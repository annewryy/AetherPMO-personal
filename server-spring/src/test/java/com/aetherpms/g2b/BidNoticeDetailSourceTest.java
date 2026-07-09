package com.aetherpms.g2b;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.queryParam;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;

import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/**
 * 단건 상세조회 소스 파싱·매핑 유닛 테스트 — MockRestServiceServer로 외부 호출 스텁(실호출 금지).
 * inqryDiv=2 파라미터 · 리치 필드 매핑 · noticeType · 0건(null) · XML 오류를 검증.
 */
class BidNoticeDetailSourceTest {

    private MockRestServiceServer server;
    private BidNoticeDetailSource src;
    private G2bProperties props;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://apis.data.go.kr/1230000");
        server = MockRestServiceServer.bindTo(builder).build();
        RestClient client = builder.build();
        props = new G2bProperties();
        props.setServiceKey("TEST-KEY");
        src = new BidNoticeDetailSource(client, props);
    }

    /** 정본 명세 필드가 담긴 정상 JSON 단건 응답. */
    private static String okBody() {
        return "{\"response\":{\"header\":{\"resultCode\":\"00\",\"resultMsg\":\"정상\"},\"body\":{"
                + "\"totalCount\":1,\"items\":[{"
                + "\"bidNtceNo\":\"R25BK00934017\","
                + "\"bidNtceOrd\":\"000\","
                + "\"reNtceYn\":\"N\","
                + "\"rgstTyNm\":\"조달청 또는 나라장터 자체 공고건\","
                + "\"ntceKindNm\":\"등록공고\","
                + "\"intrbidYn\":\"N\","
                + "\"bidNtceDt\":\"2025-07-01 13:21:14\","
                + "\"refNo\":\"서울특별시 재무공고 제2025-1698호\","
                + "\"bidNtceNm\":\"상수도 누수복구공사장 건설폐기물 처리용역\","
                + "\"ntceInsttCd\":\"6110000\",\"ntceInsttNm\":\"서울특별시\","
                + "\"dminsttCd\":\"6114454\",\"dminsttNm\":\"서울아리수본부 남부수도사업소\","
                + "\"bidMethdNm\":\"전자입찰\",\"cntrctCnclsMthdNm\":\"제한경쟁\","
                + "\"ntceInsttOfclNm\":\"김희정\",\"ntceInsttOfclTelNo\":\"02-2133-3251\","
                + "\"ntceInsttOfclEmailAdrs\":\"angelro@korea.kr\",\"exctvNm\":\"김희정\","
                + "\"dminsttOfclEmailAdrs\":\"nskk22@kywa.or.kr\","
                + "\"bidBeginDt\":\"2025-07-04 10:00:00\",\"bidClseDt\":\"2025-07-08 14:00:00\","
                + "\"opengDt\":\"2025-07-08 15:00:00\",\"opengPlce\":\"나라장터\","
                + "\"bidQlfctRgstDt\":\"2025-07-07 18:00\","
                + "\"ntceSpecDocUrl1\":\"https://g2b/doc1\",\"ntceSpecFileNm1\":\"입찰공고문.hwpx\","
                + "\"ntceSpecDocUrl2\":\"https://g2b/doc2\",\"ntceSpecFileNm2\":\"과업내용서.hwpx\","
                + "\"jntcontrctDutyRgnNm1\":\"서울특별시\","
                + "\"asignBdgtAmt\":\"142817400\",\"presmptPrce\":\"129834000\",\"VAT\":\"12983400\","
                + "\"sucsfbidLwltRate\":\"87.745\","
                + "\"srvceDivNm\":\"일반용역\","
                + "\"indstrytyLmtYn\":\"Y\",\"bidPrtcptLmtYn\":\"N\","
                + "\"rgnLmtBidLocplcJdgmBssNm\":\"본사또는참여지사소재지\","
                + "\"sucsfbidMthdCd\":\"낙030001\","
                + "\"sucsfbidMthdNm\":\"적격심사제-추정가격 2억원 미만인 용역\","
                + "\"pubPrcrmntLrgclsfcNm\":\"폐기물 처리 및 재활용서비스\","
                + "\"pubPrcrmntClsfcNo\":\"76121598\",\"pubPrcrmntClsfcNm\":\"건설폐기물처리서비스\","
                + "\"stdNtceDocUrl\":\"https://g2b/std\","
                + "\"bidNtceDtlUrl\":\"https://g2b/detail\",\"bidNtceUrl\":\"https://g2b/url\","
                + "\"rgstDt\":\"2025-07-01 13:21:14\",\"chgDt\":\"2025-07-01 13:21:14\","
                + "\"untyNtceNo\":\"R25BM00300902\",\"bfSpecRgstNo\":\"R25BD20306522\""
                + "}]}}}";
    }

    @Test
    void fetch_sendsInqryDiv2AndBidNtceNo_andMapsRichFields() {
        server.expect(requestTo(Matchers.containsString("getBidPblancListInfoServc")))
                .andExpect(method(HttpMethod.GET))
                .andExpect(queryParam("inqryDiv", "2"))
                .andExpect(queryParam("bidNtceNo", "R25BK00934017"))
                .andExpect(queryParam("type", "json"))
                .andRespond(withSuccess(okBody(), MediaType.APPLICATION_JSON));

        BidNoticeDetail d = src.fetch("R25BK00934017");

        assertThat(d).isNotNull();
        // 핵심 필드(리스트 정합).
        assertThat(d.announcementNo()).isEqualTo("R25BK00934017");
        assertThat(d.noticeType()).isEqualTo("main");
        assertThat(d.name()).isEqualTo("상수도 누수복구공사장 건설폐기물 처리용역");
        assertThat(d.customer()).isEqualTo("서울아리수본부 남부수도사업소");
        assertThat(d.publishDate()).isEqualTo("2025-07-01 13:21:14");
        assertThat(d.endDate()).isEqualTo("2025-07-08 14:00:00");
        assertThat(d.budget()).isEqualTo(142817400L);  // 배정예산 우선.
        assertThat(d.url()).isEqualTo("https://g2b/detail");
        // 리치 필드.
        assertThat(d.contractMethodName()).isEqualTo("제한경쟁");
        assertThat(d.bidwinnerMethodName()).isEqualTo("적격심사제-추정가격 2억원 미만인 용역");
        assertThat(d.estimatedPrice()).isEqualTo(129834000L);
        assertThat(d.assignBudgetAmount()).isEqualTo(142817400L);
        assertThat(d.vat()).isEqualTo(12983400L);
        assertThat(d.bidwinnerLowerRate()).isEqualTo(87.745);
        assertThat(d.industryLimitYn()).isEqualTo("Y");
        assertThat(d.regionLimitJudgeName()).isEqualTo("본사또는참여지사소재지");
        assertThat(d.serviceDivName()).isEqualTo("일반용역");
        assertThat(d.openingDate()).isEqualTo("2025-07-08 15:00:00");
        // 담당자.
        assertThat(d.noticeAgencyOfficialName()).isEqualTo("김희정");
        assertThat(d.noticeAgencyOfficialTel()).isEqualTo("02-2133-3251");
        assertThat(d.noticeAgencyOfficialEmail()).isEqualTo("angelro@korea.kr");
        assertThat(d.demandAgencyOfficialEmail()).isEqualTo("nskk22@kywa.or.kr");
        // 규격서 첨부(URL 있는 것만).
        assertThat(d.specDocs()).hasSize(2);
        assertThat(d.specDocs().get(0).url()).isEqualTo("https://g2b/doc1");
        assertThat(d.specDocs().get(0).fileName()).isEqualTo("입찰공고문.hwpx");
        // 공동도급의무지역(1건).
        assertThat(d.jointContractDutyRegions()).containsExactly("서울특별시");
        // 분류.
        assertThat(d.pubProcurementClassName()).isEqualTo("건설폐기물처리서비스");
        server.verify();
    }

    @Test
    void fetch_emptyItems_returnsNull() {
        String body = "{\"response\":{\"header\":{\"resultCode\":\"00\"},\"body\":{"
                + "\"totalCount\":0,\"items\":[]}}}";
        server.expect(requestTo(Matchers.containsString("getBidPblancListInfoServc")))
                .andRespond(withSuccess(body, MediaType.APPLICATION_JSON));

        assertThat(src.fetch("R25BK99999999")).isNull();
        server.verify();
    }

    @Test
    void fetch_xmlAuthError_throwsG2bException() {
        String xml = "<OpenAPI_ServiceResponse><cmmMsgHeader>"
                + "<returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg>"
                + "<returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>";
        server.expect(requestTo(Matchers.containsString("getBidPblancListInfoServc")))
                .andRespond(withSuccess(xml, MediaType.APPLICATION_XML));

        assertThatThrownBy(() -> src.fetch("R25BK00934017"))
                .isInstanceOf(G2bException.class)
                .hasMessageContaining("SERVICE_KEY_IS_NOT_REGISTERED_ERROR");
        server.verify();
    }

    @Test
    void fetch_multipleOrders_picksLatestOrder() {
        String body = "{\"response\":{\"header\":{\"resultCode\":\"00\"},\"body\":{"
                + "\"totalCount\":2,\"items\":["
                + "{\"bidNtceNo\":\"A1\",\"bidNtceOrd\":\"000\",\"bidNtceNm\":\"원공고\"},"
                + "{\"bidNtceNo\":\"A1\",\"bidNtceOrd\":\"001\",\"bidNtceNm\":\"변경공고\"}]}}}";
        server.expect(requestTo(Matchers.containsString("getBidPblancListInfoServc")))
                .andRespond(withSuccess(body, MediaType.APPLICATION_JSON));

        BidNoticeDetail d = src.fetch("A1");
        assertThat(d.noticeOrder()).isEqualTo("001");
        assertThat(d.name()).isEqualTo("변경공고");
        server.verify();
    }
}
