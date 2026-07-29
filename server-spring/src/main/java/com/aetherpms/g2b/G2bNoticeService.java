package com.aetherpms.g2b;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;

/**
 * 공고 조회 오케스트레이션 (설계 0016 §B/§C).
 *
 * - noticeType 분기: all=본공고+사전규격 병합, main/pre_spec=해당 소스만.
 * - 캐시(§C): 소스별 원시 수집을 단기 캐시 → 검색/필터/페이징은 캐시 기반(외부 재호출 없음).
 * - 기간 기본/가드: 레거시 api/g2b.js와 동일(비면 최근 30일, 6개월 초과 거부).
 * - serviceKey 미설정: 500 아님 — 명확한 G2bException(컨트롤러가 4xx로 매핑).
 */
@Service
public class G2bNoticeService {

    private static final DateTimeFormatter YMD = DateTimeFormatter.ofPattern("yyyyMMdd");
    /**
     * 나라장터 OpenAPI 조회기간 상한(실측). 초과하면 오류가 아니라 <b>빈 결과</b>가 조용히 돌아와
     * 사용자에겐 "검색이 안 되는" 것으로 보인다 → 여기서 명확한 에러로 끊는다.
     * (구 레거시 가드는 6개월(186일)이었으나 실제 API 동작과 어긋나 30일로 정정.)
     */
    private static final int MAX_RANGE_DAYS = 30;

    private final List<G2bNoticeSource> sources;
    private final G2bNoticeCache cache;
    private final G2bProperties props;

    public G2bNoticeService(List<G2bNoticeSource> sources, G2bNoticeCache cache, G2bProperties props) {
        this.sources = sources;
        this.cache = cache;
        this.props = props;
    }

    /**
     * 조회 결과.
     *
     * @param items       현재 페이지 공고
     * @param totalCount  <b>우리가 들고 있는</b> 필터 후 건수 — 페이저는 이 값을 쓴다(실제 이동 가능 범위).
     * @param sourceTotal 나라장터가 보고한 전체 건수. 수집 상한(300건)에 걸리면 totalCount보다 크다.
     * @param truncated   수집 상한에 걸려 일부만 보여주는 중인지.
     */
    public record Result(List<BidNotice> items, int totalCount, int sourceTotal, boolean truncated) {
        public Map<String, Object> toDto() {
            List<Map<String, Object>> list = new ArrayList<>(items.size());
            for (BidNotice n : items) list.add(n.toDto());
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("notices", list);
            m.put("totalCount", totalCount);
            m.put("sourceTotalCount", sourceTotal);
            m.put("truncated", truncated);
            return m;
        }
    }

    public Result search(BidNoticeQuery raw) {
        if (!props.hasServiceKey()) {
            // 설계 0016 §serviceKey: 키 없으면 명확한 에러(500 금지).
            throw new G2bException(
                "나라장터 인증키(G2B_SERVICE_KEY)가 설정되지 않아 공고를 조회할 수 없습니다.");
        }
        BidNoticeQuery q = normalize(raw);

        // 1) 소스별 수집(캐시 기반). sourceTotal은 나라장터가 보고한 전체 건수의 합.
        List<BidNotice> collected = new ArrayList<>();
        int sourceTotal = 0;
        boolean truncated = false;
        for (G2bNoticeSource src : sources) {
            boolean wanted = switch (src.noticeType()) {
                case BidNoticeQuery.TYPE_MAIN -> q.wantsMain();
                case BidNoticeQuery.TYPE_PRE_SPEC -> q.wantsPreSpec();
                default -> false;
            };
            if (!wanted || !src.isEnabled()) continue;
            NoticeFetch f = fetchCached(src, q);
            collected.addAll(f.items());
            sourceTotal += f.sourceTotal();
            truncated |= f.truncated();
        }

        // 2) 공고번호 기준 dedup(레거시 seenNoticeNos).
        List<BidNotice> unique = dedup(collected);

        // 3) 로컬 필터(캐시 기반 검색어/기관 부분매칭 — 외부 재호출 없이).
        List<BidNotice> filtered = localFilter(unique, q);

        // 4) 페이징.
        int total = filtered.size();
        int from = Math.max(0, (q.page() - 1) * q.limit());
        int to = Math.min(total, from + q.limit());
        List<BidNotice> pageItems = from >= total ? List.of() : filtered.subList(from, to);

        // 로컬 검색어로 걸러낸 경우엔 상위 총건수와 직접 비교할 수 없다(상위는 미필터 기준).
        //   → 잘림 표시는 "수집 자체가 상한에 걸렸는지"로만 판단하고, sourceTotal은 그대로 전달한다.
        return new Result(new ArrayList<>(pageItems), total, Math.max(sourceTotal, total), truncated);
    }

    private NoticeFetch fetchCached(G2bNoticeSource src, BidNoticeQuery q) {
        // 기관/기간 단위 캐시(검색어는 로컬필터라 키에서 제외 — 같은 기관/기간의 재검색은 캐시 히트).
        String key = G2bNoticeCache.key(src.noticeType(), q.agencyName(), q.bgngDt(), q.endDt());
        NoticeFetch cached = cache.get(key);
        if (cached != null) return cached;
        NoticeFetch fetched = src.fetch(q);
        cache.put(key, fetched);
        return fetched;
    }

    private static List<BidNotice> dedup(List<BidNotice> in) {
        Map<String, BidNotice> seen = new LinkedHashMap<>();
        for (BidNotice n : in) {
            // 유형+번호로 dedup(본공고/사전규격 번호공간 분리).
            String k = n.noticeType() + ":" + n.announcementNo();
            seen.putIfAbsent(k, n);
        }
        return new ArrayList<>(seen.values());
    }

    private static List<BidNotice> localFilter(List<BidNotice> in, BidNoticeQuery q) {
        List<BidNotice> out = new ArrayList<>(in.size());
        for (BidNotice n : in) {
            if (!matches(n.name(), q.keyword()) && !matches(n.announcementNo(), q.keyword())) continue;
            if (q.agencyName() != null && !q.agencyName().isBlank()
                    && !matches(n.customer(), q.agencyName())) continue;
            out.add(n);
        }
        return out;
    }

    /** 한글 NFC + 공백제거 + 소문자 부분매칭(레거시 matchesKeyword). keyword 빈값이면 true. */
    private static boolean matches(String target, String keyword) {
        if (keyword == null || keyword.isBlank()) return true;
        return norm(target).contains(norm(keyword));
    }

    private static String norm(String s) {
        if (s == null) return "";
        return java.text.Normalizer.normalize(s, java.text.Normalizer.Form.NFC)
                .toLowerCase().replaceAll("\\s+", "");
    }

    /** 날짜 기본/정리 + 6개월 가드 + 페이징 기본(레거시 계약). */
    private BidNoticeQuery normalize(BidNoticeQuery raw) {
        String bgn = clean(raw.bgngDt());
        String end = clean(raw.endDt());
        if (bgn.isEmpty() || end.isEmpty()) {
            LocalDate today = LocalDate.now();
            LocalDate past = today.minusDays(30);
            if (bgn.isEmpty()) bgn = past.format(YMD);
            if (end.isEmpty()) end = today.format(YMD);
        }
        if (rangeExceeds(bgn, end)) {
            throw new G2bException(
                "나라장터 공고 검색은 최대 " + MAX_RANGE_DAYS + "일 이내 기간만 조회할 수 있습니다."
                + " (나라장터 OpenAPI 제약 — 초과 시 결과가 비어 있게 반환됩니다.)");
        }
        String type = raw.noticeType() == null || raw.noticeType().isBlank()
                ? BidNoticeQuery.TYPE_ALL : raw.noticeType().trim();
        int page = raw.page() <= 0 ? 1 : raw.page();
        int limit = raw.limit() <= 0 ? 10 : Math.min(raw.limit(), 100);
        return new BidNoticeQuery(
                blankToNull(raw.agencyName()), type, blankToNull(raw.keyword()), bgn, end, page, limit);
    }

    private static boolean rangeExceeds(String bgn, String end) {
        try {
            LocalDate b = LocalDate.parse(bgn, YMD);
            LocalDate e = LocalDate.parse(end, YMD);
            return java.time.temporal.ChronoUnit.DAYS.between(b, e) > MAX_RANGE_DAYS;
        } catch (Exception ex) {
            return false;
        }
    }

    private static String clean(String s) {
        return s == null ? "" : s.replace("-", "").trim();
    }

    private static String blankToNull(String s) {
        return (s == null || s.isBlank()) ? null : s.trim();
    }
}
