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
    private static final int MAX_RANGE_DAYS = 186; // 레거시 6개월 가드.

    private final List<G2bNoticeSource> sources;
    private final G2bNoticeCache cache;
    private final G2bProperties props;

    public G2bNoticeService(List<G2bNoticeSource> sources, G2bNoticeCache cache, G2bProperties props) {
        this.sources = sources;
        this.cache = cache;
        this.props = props;
    }

    /** 조회 결과: 페이징된 공고 목록 + 전체건수(필터 후). */
    public record Result(List<BidNotice> items, int totalCount) {
        public Map<String, Object> toDto() {
            List<Map<String, Object>> list = new ArrayList<>(items.size());
            for (BidNotice n : items) list.add(n.toDto());
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("notices", list);
            m.put("totalCount", totalCount);
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

        // 1) 소스별 수집(캐시 기반).
        List<BidNotice> collected = new ArrayList<>();
        for (G2bNoticeSource src : sources) {
            boolean wanted = switch (src.noticeType()) {
                case BidNoticeQuery.TYPE_MAIN -> q.wantsMain();
                case BidNoticeQuery.TYPE_PRE_SPEC -> q.wantsPreSpec();
                default -> false;
            };
            if (!wanted || !src.isEnabled()) continue;
            collected.addAll(fetchCached(src, q));
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
        return new Result(new ArrayList<>(pageItems), total);
    }

    private List<BidNotice> fetchCached(G2bNoticeSource src, BidNoticeQuery q) {
        // 기관/기간 단위 캐시(검색어는 로컬필터라 키에서 제외 — 같은 기관/기간의 재검색은 캐시 히트).
        String key = G2bNoticeCache.key(src.noticeType(), q.agencyName(), q.bgngDt(), q.endDt());
        List<BidNotice> cached = cache.get(key);
        if (cached != null) return cached;
        List<BidNotice> fetched = src.fetch(q);
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
                "나라장터 공고 검색은 응답 지연 방지를 위해 최대 6개월 이내 기간만 조회할 수 있습니다.");
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
