package com.aetherpms.g2b;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;

/**
 * 공고 조회 오케스트레이션 (설계 0016 §B/§C 및 다중 수요기관 OR 검색).
 *
 * - 다중 수요기관 지원: 관심기관 5개 등 다중 기관 선택 시 기관별 수집 후 결과 병합.
 * - API 기간제한 극복: 30일 초과 범위는 25일 슬라이스로 분할(split) 조회 후 누락 없이 병합.
 * - 중복 제거(dedup): noticeType:announcementNo 고유키 기준 중복 제거.
 * - 정밀 수요기관 필터링: 공고기관이 조달청이어도 실제 수요기관(dminsttNm/dminsttCd) 기준 매칭.
 * - 공고일시 최신순 정렬 및 전체 건수 기반 페이징.
 * - 부분 실패 방어: 외부 API 호출 실패 시 조용히 성공으로 처리하지 않고 G2bException 전파.
 */
@Service
public class G2bNoticeService {

    private static final DateTimeFormatter YMD = DateTimeFormatter.ofPattern("yyyyMMdd");
    private static final int MAX_SLICE_DAYS = 25; // 안전한 1회 조회 슬라이스 일수
    private static final int MAX_TOTAL_DAYS = 95; // 최대 허용 조회 기간 (약 3개월)

    private final List<G2bNoticeSource> sources;
    private final G2bNoticeCache cache;
    private final G2bProperties props;

    public G2bNoticeService(List<G2bNoticeSource> sources, G2bNoticeCache cache, G2bProperties props) {
        this.sources = sources;
        this.cache = cache;
        this.props = props;
    }

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

    private static final Comparator<BidNotice> NOTICE_COMPARATOR = (a, b) -> {
        String dateA = a.publishDate() != null ? a.publishDate() : "";
        String dateB = b.publishDate() != null ? b.publishDate() : "";
        int cmp = dateB.compareTo(dateA); // 최신순 내림차순
        if (cmp != 0) return cmp;
        String noA = a.announcementNo() != null ? a.announcementNo() : "";
        String noB = b.announcementNo() != null ? b.announcementNo() : "";
        return noB.compareTo(noA);
    };

    public Result search(BidNoticeQuery raw) {
        if (!props.hasServiceKey()) {
            throw new G2bException(
                "나라장터 인증키(G2B_SERVICE_KEY)가 설정되지 않아 공고를 조회할 수 없습니다.");
        }
        BidNoticeQuery q = normalize(raw);

        // 1) 기간 슬라이스 분할 (30일 초과 시에도 누락 없이 수집)
        List<BidTargetAgency.DateRange> dateSlices =
                BidTargetAgency.splitDateRange(q.bgngDt(), q.endDt(), MAX_SLICE_DAYS);

        // 2) 기관 목록 결정 (지정 없으면 전체 기관 1회 수집)
        List<String> targetAgencies = (q.agencies() != null && !q.agencies().isEmpty())
                ? q.agencies()
                : List.of(""); // 빈 문자열 = 기관 필터 없는 전체 조회

        List<BidNotice> collected = new ArrayList<>();
        boolean truncated = false;
        int sourceTotalAccum = 0;

        for (G2bNoticeSource src : sources) {
            boolean wanted = switch (src.noticeType()) {
                case BidNoticeQuery.TYPE_MAIN -> q.wantsMain();
                case BidNoticeQuery.TYPE_PRE_SPEC -> q.wantsPreSpec();
                default -> false;
            };
            if (!wanted || !src.isEnabled()) continue;

            for (String agency : targetAgencies) {
                List<String> searchKeys = agency.isEmpty()
                        ? List.of("")
                        : BidTargetAgency.getSearchKeywords(agency);
                for (String searchKey : searchKeys) {
                    String actualKey = searchKey.isEmpty() ? null : searchKey;
                    for (BidTargetAgency.DateRange slice : dateSlices) {
                        BidNoticeQuery sliceQuery = new BidNoticeQuery(
                                actualKey != null ? List.of(actualKey) : List.of(),
                                q.noticeType(),
                                q.keyword(),
                                slice.bgngDt(),
                                slice.endDt(),
                                1,
                                100
                        );
                        NoticeFetch f = fetchCached(src, sliceQuery, actualKey);
                        collected.addAll(f.items());
                        sourceTotalAccum += f.sourceTotal();
                        truncated |= f.truncated();
                    }
                }
            }
        }

        // 3) 공고번호 기준 중복 제거 (본공고/사전규격 구분)
        List<BidNotice> unique = dedup(collected);

        // 4) 로컬 정밀 필터링: 검색어 + 실제 수요기관(customer/customerCode) 매칭
        List<BidNotice> filtered = localFilter(unique, q);

        // 5) 공고일시 최신순 정렬
        filtered.sort(NOTICE_COMPARATOR);

        // 6) 전체 건수 기준 페이징 슬라이싱
        int total = filtered.size();
        int from = Math.max(0, (q.page() - 1) * q.limit());
        int to = Math.min(total, from + q.limit());
        List<BidNotice> pageItems = from >= total ? List.of() : filtered.subList(from, to);

        return new Result(new ArrayList<>(pageItems), total, Math.max(sourceTotalAccum, total), truncated);
    }

    private NoticeFetch fetchCached(G2bNoticeSource src, BidNoticeQuery q, String searchKey) {
        String key = G2bNoticeCache.key(src.noticeType(), searchKey, q.bgngDt(), q.endDt());
        NoticeFetch cached = cache.get(key);
        if (cached != null) return cached;
        NoticeFetch fetched = src.fetch(q);
        cache.put(key, fetched);
        return fetched;
    }

    private static List<BidNotice> dedup(List<BidNotice> in) {
        Map<String, BidNotice> seen = new LinkedHashMap<>();
        for (BidNotice n : in) {
            String ord = (n.noticeOrder() != null && !n.noticeOrder().isBlank()) ? n.noticeOrder().trim() : "00";
            String k = n.noticeType() + ":" + n.announcementNo() + ":" + ord;
            seen.putIfAbsent(k, n);
        }
        return new ArrayList<>(seen.values());
    }

    private static List<BidNotice> localFilter(List<BidNotice> in, BidNoticeQuery q) {
        List<BidNotice> out = new ArrayList<>(in.size());
        boolean hasAgencies = q.agencies() != null && !q.agencies().isEmpty();

        for (BidNotice n : in) {
            // 검색어 부분매칭
            if (!matches(n.name(), q.keyword()) && !matches(n.announcementNo(), q.keyword())) {
                continue;
            }
            // 수요기관 OR 매칭 (실제 customer/customerCode 기준, 조달청 공고라도 수요기관 매칭되면 포함)
            if (hasAgencies) {
                if (!BidTargetAgency.matchesAny(n.customer(), n.customerCode(), q.agencies())) {
                    continue;
                }
            }
            out.add(n);
        }
        return out;
    }

    private static boolean matches(String target, String keyword) {
        if (keyword == null || keyword.isBlank()) return true;
        return norm(target).contains(norm(keyword));
    }

    private static String norm(String s) {
        if (s == null) return "";
        return java.text.Normalizer.normalize(s, java.text.Normalizer.Form.NFC)
                .toLowerCase().replaceAll("\\s+", "");
    }

    /** 날짜 기본/정리 + 최대 기간 가드 + 페이징 기본 */
    private BidNoticeQuery normalize(BidNoticeQuery raw) {
        String bgn = clean(raw.bgngDt());
        String end = clean(raw.endDt());
        if (bgn.isEmpty() || end.isEmpty()) {
            LocalDate today = LocalDate.now();
            LocalDate past = today.minusMonths(1); // 1개월 전(전월 말일 자동 처리)
            if (bgn.isEmpty()) bgn = past.format(YMD);
            if (end.isEmpty()) end = today.format(YMD);
        }
        if (rangeExceeds(bgn, end, MAX_TOTAL_DAYS)) {
            throw new G2bException(
                "나라장터 공고 검색은 최대 " + MAX_TOTAL_DAYS + "일 이내 기간만 조회할 수 있습니다.");
        }
        String type = raw.noticeType() == null || raw.noticeType().isBlank()
                ? BidNoticeQuery.TYPE_ALL : raw.noticeType().trim();
        int page = raw.page() <= 0 ? 1 : raw.page();
        int limit = raw.limit() <= 0 ? 10 : Math.min(raw.limit(), 100);

        List<String> agencies = new ArrayList<>();
        if (raw.agencies() != null) {
            for (String a : raw.agencies()) {
                if (a != null && !a.isBlank()) {
                    agencies.add(a.trim());
                }
            }
        }

        return new BidNoticeQuery(agencies, type, blankToNull(raw.keyword()), bgn, end, page, limit);
    }

    private static boolean rangeExceeds(String bgn, String end, int maxDays) {
        try {
            LocalDate b = LocalDate.parse(bgn, YMD);
            LocalDate e = LocalDate.parse(end, YMD);
            return java.time.temporal.ChronoUnit.DAYS.between(b, e) > maxDays;
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
