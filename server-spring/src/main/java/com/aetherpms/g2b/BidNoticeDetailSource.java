package com.aetherpms.g2b;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

/**
 * 공고 단건 상세조회 소스 — getBidPblancListInfoServc inqryDiv=2 (배치14 / 설계 0017 §A).
 *
 * 리스트 소스(MainNoticeSource, inqryDiv=1)와 달리 단건조회는 bidNtceNo 필수, 기간 파라미터 없음.
 * 응답 메시지 명세(조달청 OpenAPI 참고자료)의 풀필드를 {@link BidNoticeDetail}로 매핑한다.
 * 없는 값은 null(더미데이터 금지). XML 오류는 G2bException, 결과 0건은 null 반환.
 */
@Component
public class BidNoticeDetailSource {

    private final RestClient client;
    private final G2bProperties props;

    public BidNoticeDetailSource(RestClient g2bRestClient, G2bProperties props) {
        this.client = g2bRestClient;
        this.props = props;
    }

    /** bidNtceNo로 단건 상세 조회. 결과 없으면 null. 외부 오류는 G2bException. */
    public BidNoticeDetail fetch(String bidNtceNo) {
        MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
        params.add("serviceKey", props.getServiceKey());
        params.add("numOfRows", "10");
        params.add("pageNo", "1");
        params.add("inqryDiv", "2");           // 2 = 입찰공고번호 단건조회.
        params.add("bidNtceNo", bidNtceNo);
        params.add("type", "json");

        String body = client.get()
                .uri(uriBuilder -> uriBuilder
                        .path(props.getNoticePath())
                        .queryParams(params)
                        .build())
                .retrieve()
                .body(String.class);

        String xmlErr = G2bResponseParser.detectXmlError(body);
        if (xmlErr != null) {
            throw new G2bException("나라장터 공고 단건조회 실패 - " + xmlErr);
        }
        List<Map<String, Object>> items = G2bResponseParser.extractItems(body);
        if (items.isEmpty()) return null;

        // 동일 공고번호에 차수(bidNtceOrd)가 여러 건일 수 있음 → 최신(가장 큰 차수) 선택.
        Map<String, Object> it = items.get(0);
        for (Map<String, Object> cand : items) {
            if (ord(cand) > ord(it)) it = cand;
        }
        return map(it);
    }

    private static int ord(Map<String, Object> it) {
        Long o = parseLong(it.get("bidNtceOrd"));
        return o == null ? 0 : o.intValue();
    }

    private BidNoticeDetail map(Map<String, Object> it) {
        Long assignBudget = parseLong(it.get("asignBdgtAmt"));
        Long estimated = parseLong(it.get("presmptPrce"));
        Long budget = (assignBudget != null && assignBudget != 0) ? assignBudget : estimated;

        return new BidNoticeDetail(
                str(it.get("bidNtceNo")),
                BidNoticeQuery.TYPE_MAIN,
                str(it.get("bidNtceNm")),
                str(it.get("dminsttNm")),
                str(it.get("bidNtceDt")),
                str(it.get("bidClseDt")),
                budget,
                str(it.get("bidNtceDtlUrl")),

                str(it.get("bidNtceOrd")),
                str(it.get("reNtceYn")),
                str(it.get("rgstTyNm")),
                str(it.get("ntceKindNm")),
                str(it.get("intrbidYn")),
                str(it.get("refNo")),
                str(it.get("rgstDt")),
                str(it.get("chgDt")),
                str(it.get("chgNtceRsn")),
                str(it.get("bfSpecRgstNo")),
                str(it.get("untyNtceNo")),
                str(it.get("orderPlanUntyNo")),

                str(it.get("ntceInsttCd")),
                str(it.get("ntceInsttNm")),
                str(it.get("dminsttCd")),
                str(it.get("dminsttNm")),

                str(it.get("bidMethdNm")),
                str(it.get("cntrctCnclsMthdNm")),
                str(it.get("sucsfbidMthdCd")),
                str(it.get("sucsfbidMthdNm")),
                str(it.get("sucsfbidMthdAppStd")),
                str(it.get("srvceDivNm")),

                str(it.get("bidQlfctRgstDt")),
                str(it.get("bidBeginDt")),
                str(it.get("opengDt")),
                str(it.get("opengPlce")),
                str(it.get("dcmtgOprtnDt")),
                str(it.get("dcmtgOprtnPlce")),

                assignBudget,
                estimated,
                parseLong(it.get("VAT")),
                parseDouble(it.get("sucsfbidLwltRate")),

                str(it.get("indstrytyLmtYn")),
                str(it.get("rgnLmtBidLocplcJdgmBssNm")),
                str(it.get("bidPrtcptLmtYn")),
                jointRegions(it),

                str(it.get("ntceInsttOfclNm")),
                str(it.get("ntceInsttOfclTelNo")),
                str(it.get("ntceInsttOfclEmailAdrs")),
                str(it.get("dminsttOfclEmailAdrs")),
                str(it.get("exctvNm")),

                str(it.get("pubPrcrmntLrgclsfcNm")),
                str(it.get("pubPrcrmntMidclsfcNm")),
                str(it.get("pubPrcrmntClsfcNo")),
                str(it.get("pubPrcrmntClsfcNm")),

                specDocs(it),
                str(it.get("stdNtceDocUrl")),
                str(it.get("bidNtceDtlUrl")),
                str(it.get("bidNtceUrl")));
    }

    /** 공동도급의무지역명1..3 → 비어있지 않은 값만 리스트. */
    private static List<String> jointRegions(Map<String, Object> it) {
        List<String> out = new ArrayList<>();
        for (int i = 1; i <= 3; i++) {
            String v = str(it.get("jntcontrctDutyRgnNm" + i));
            if (v != null) out.add(v);
        }
        return out;
    }

    /** 공고규격서URL1..10 + 파일명1..10 → URL 있는 항목만 쌍으로. */
    private static List<BidNoticeDetail.SpecDoc> specDocs(Map<String, Object> it) {
        List<BidNoticeDetail.SpecDoc> out = new ArrayList<>();
        for (int i = 1; i <= 10; i++) {
            String url = str(it.get("ntceSpecDocUrl" + i));
            String name = str(it.get("ntceSpecFileNm" + i));
            if (url == null && name == null) continue;
            out.add(new BidNoticeDetail.SpecDoc(url, name));
        }
        return out;
    }

    /** 값이 없거나 공백이면 null(더미 금지). 앞뒤 공백 제거. */
    private static String str(Object o) {
        if (o == null) return null;
        String s = o.toString().trim();
        return s.isEmpty() ? null : s;
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

    private static Double parseDouble(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return n.doubleValue();
        try {
            String s = o.toString().trim();
            if (s.isEmpty()) return null;
            return Double.parseDouble(s);
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
