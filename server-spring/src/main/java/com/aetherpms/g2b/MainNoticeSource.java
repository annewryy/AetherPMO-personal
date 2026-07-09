package com.aetherpms.g2b;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

/**
 * 본공고 소스 — 레거시 api/g2b.js(오라클) 이식 (설계 0016 §B).
 *
 * 엔드포인트: BidPublicInfoService/getBidPblancListInfoServc.
 * 파라미터: inqryDiv='1', inqryBgnDt/inqryEndDt(yyyyMMddHHmm), bidNtceNm, dminsttNm, type=json.
 * 필드 매핑(레거시 그대로): bidNtceNo→announcementNo, bidNtceNm→name, dminsttNm→customer,
 *   bidNtceDt→publishDate, bidClseDt→endDate, asignBdgtAmt/presmptPrce→budget, bidNtceDtlUrl→url.
 *
 * 이 소스는 "수집"만 담당 — 최대 3페이지(300건)까지 병합해 반환. dedup/로컬필터/페이징/캐시는
 * G2bNoticeService가 처리(레거시 하이브리드 수집과 동형).
 */
@Component
public class MainNoticeSource implements G2bNoticeSource {

    private static final int PAGE_SIZE = 100;
    private static final int MAX_PAGES = 3;

    private final RestClient client;
    private final G2bProperties props;

    public MainNoticeSource(RestClient g2bRestClient, G2bProperties props) {
        this.client = g2bRestClient;
        this.props = props;
    }

    @Override
    public String noticeType() {
        return BidNoticeQuery.TYPE_MAIN;
    }

    @Override
    public boolean isEnabled() {
        return true; // 본공고는 항상 활성(레거시 동결 대체).
    }

    @Override
    public List<BidNotice> fetch(BidNoticeQuery q) {
        String inqryBgnDt = q.bgngDt() + "0000";
        String inqryEndDt = q.endDt() + "2359";

        List<BidNotice> out = new ArrayList<>();
        for (int page = 1; page <= MAX_PAGES; page++) {
            MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
            params.add("serviceKey", props.getServiceKey());
            params.add("numOfRows", String.valueOf(PAGE_SIZE));
            params.add("pageNo", String.valueOf(page));
            params.add("inqryDiv", "1");
            params.add("inqryBgnDt", inqryBgnDt);
            params.add("inqryEndDt", inqryEndDt);
            params.add("type", "json");
            if (q.keyword() != null && !q.keyword().isBlank()) {
                params.add("bidNtceNm", q.keyword().trim());
            }
            if (q.agencyName() != null && !q.agencyName().isBlank()) {
                params.add("dminsttNm", q.agencyName().trim());
            }

            String body = client.get()
                    .uri(uriBuilder -> uriBuilder
                            .path(props.getNoticePath())
                            .queryParams(params)
                            .build())
                    .retrieve()
                    .body(String.class);

            String xmlErr = G2bResponseParser.detectXmlError(body);
            if (xmlErr != null) {
                throw new G2bException("나라장터 본공고 조회 실패 - " + xmlErr);
            }
            List<Map<String, Object>> items = G2bResponseParser.extractItems(body);
            if (items.isEmpty()) break;
            for (Map<String, Object> it : items) out.add(map(it));
            if (items.size() < PAGE_SIZE) break; // 마지막 페이지.
        }
        return out;
    }

    /** 레거시 필드 매핑 그대로. */
    private BidNotice map(Map<String, Object> it) {
        return new BidNotice(
                str(it.get("bidNtceNo"), "-"),
                BidNoticeQuery.TYPE_MAIN,
                str(it.get("bidNtceNm"), "-"),
                str(it.get("dminsttNm"), "-"),
                date10(it.get("bidNtceDt")),
                date10(it.get("bidClseDt")),
                num(it.get("asignBdgtAmt"), it.get("presmptPrce")),
                str(it.get("bidNtceDtlUrl"), "#"));
    }

    private static String str(Object o, String dflt) {
        if (o == null) return dflt;
        String s = o.toString().trim();
        return s.isEmpty() ? dflt : s;
    }

    /** yyyy-MM-dd... → 앞 10자리(레거시 substring(0,10)). */
    private static String date10(Object o) {
        if (o == null) return "-";
        String s = o.toString().trim();
        if (s.isEmpty()) return "-";
        return s.length() >= 10 ? s.substring(0, 10) : s;
    }

    private static long num(Object primary, Object fallback) {
        Long p = parseLong(primary);
        if (p != null && p != 0) return p;
        Long f = parseLong(fallback);
        return f == null ? 0 : f;
    }

    private static Long parseLong(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return n.longValue();
        try {
            String s = o.toString().trim();
            if (s.isEmpty()) return null;
            return (long) Double.parseDouble(s);
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
