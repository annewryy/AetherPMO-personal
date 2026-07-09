package com.aetherpms.g2b;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

/**
 * 사전규격 소스 어댑터 (설계 0016 §B, 미결 항목).
 *
 * <p><b>조사 결과(2026-07):</b> 나라장터 사전규격정보서비스
 * {@code HrcspSsstndrdInfoService}. 용역 오퍼레이션은
 * {@code /ao/HrcspSsstndrdInfoService/getPublicPrcureThngInfoServcPPSSrch}로 파악됨
 * (data.go.kr 15129437). 표준 G2B 파라미터(inqryDiv/inqryBgnDt/inqryEndDt/type)와
 * 기관필터(orderInsttNm/dminsttNm)를 공유하는 것으로 보인다.
 *
 * <p><b>불확실(확정 필요):</b> 정확한 파라미터명(inqryDiv 코드값·기관필터 파라미터명),
 * 오퍼레이션의 업무구분(물품/용역/공사/외자별 별도 오퍼레이션 여부),
 * 응답 필드 스키마. 아래 매핑은 조사에서 얻은 추정 필드명이며 실 응답으로 검증되지 않았다:
 * <ul>
 *   <li>bfSpecRgstNo   → announcementNo (사전규격등록번호)</li>
 *   <li>prdctClsfcNoNm → name (품명/사업명)</li>
 *   <li>orderInsttNm   → customer (수요/발주기관)</li>
 *   <li>rgstDt         → publishDate (등록일 — 필드명 추정)</li>
 *   <li>opninRgstClseDt→ endDate (의견등록마감일시)</li>
 *   <li>asignBdgtAmt   → budget (배정예산액)</li>
 * </ul>
 *
 * <p>실 응답으로 검증 전까지 {@code g2b.pre-spec-enabled=false}(기본)로 게이트한다.
 * 비활성 시 fetch는 빈 목록을 반환해 본공고만 동작(더미 데이터 금지 원칙 준수).
 */
@Component
public class PreSpecNoticeSource implements G2bNoticeSource {

    private static final int PAGE_SIZE = 100;

    private final RestClient client;
    private final G2bProperties props;

    public PreSpecNoticeSource(RestClient g2bRestClient, G2bProperties props) {
        this.client = g2bRestClient;
        this.props = props;
    }

    @Override
    public String noticeType() {
        return BidNoticeQuery.TYPE_PRE_SPEC;
    }

    @Override
    public boolean isEnabled() {
        // 오퍼레이션/필드 검증 전까지 플래그로 게이트(설계 0016 미결).
        return props.isPreSpecEnabled();
    }

    @Override
    public List<BidNotice> fetch(BidNoticeQuery q) {
        if (!isEnabled()) {
            // 비활성: 지어내지 않고 빈 목록. all 조회 시 본공고만 나온다.
            return List.of();
        }
        String inqryBgnDt = q.bgngDt() + "0000";
        String inqryEndDt = q.endDt() + "2359";

        MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
        params.add("serviceKey", props.getServiceKey());
        params.add("numOfRows", String.valueOf(PAGE_SIZE));
        params.add("pageNo", "1");
        params.add("inqryDiv", "1");
        params.add("inqryBgnDt", inqryBgnDt);
        params.add("inqryEndDt", inqryEndDt);
        params.add("type", "json");
        if (q.agencyName() != null && !q.agencyName().isBlank()) {
            // TODO(확정 필요): 사전규격 기관필터 파라미터명(orderInsttNm vs dminsttNm) 실검증.
            params.add("orderInsttNm", q.agencyName().trim());
        }

        String body = client.get()
                .uri(uriBuilder -> uriBuilder
                        .path(props.getPreSpecPath())
                        .queryParams(params)
                        .build())
                .retrieve()
                .body(String.class);

        String xmlErr = G2bResponseParser.detectXmlError(body);
        if (xmlErr != null) {
            throw new G2bException("나라장터 사전규격 조회 실패 - " + xmlErr);
        }
        List<Map<String, Object>> items = G2bResponseParser.extractItems(body);
        List<BidNotice> out = new ArrayList<>(items.size());
        for (Map<String, Object> it : items) out.add(map(it));
        return out;
    }

    /** TODO(확정 필요): 실 응답으로 필드명 검증 후 확정. */
    private BidNotice map(Map<String, Object> it) {
        return new BidNotice(
                str(it.get("bfSpecRgstNo"), "-"),
                BidNoticeQuery.TYPE_PRE_SPEC,
                str(it.get("prdctClsfcNoNm"), "-"),
                str(it.get("orderInsttNm"), "-"),
                date10(it.get("rgstDt")),
                date10(it.get("opninRgstClseDt")),
                parseLong(it.get("asignBdgtAmt")),
                str(it.get("specDocFileUrl1"), "#"));
    }

    private static String str(Object o, String dflt) {
        if (o == null) return dflt;
        String s = o.toString().trim();
        return s.isEmpty() ? dflt : s;
    }

    private static String date10(Object o) {
        if (o == null) return "-";
        String s = o.toString().trim();
        if (s.isEmpty()) return "-";
        return s.length() >= 10 ? s.substring(0, 10) : s;
    }

    private static long parseLong(Object o) {
        if (o == null) return 0;
        if (o instanceof Number n) return n.longValue();
        try {
            String s = o.toString().trim();
            if (s.isEmpty()) return 0;
            return (long) Double.parseDouble(s);
        } catch (NumberFormatException e) {
            return 0;
        }
    }
}
