package com.aetherpms.g2b;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.queryParam;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.util.List;

import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class MainNoticeSourceTest {

    private MockRestServiceServer server;
    private MainNoticeSource src;
    private G2bProperties props;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://apis.data.go.kr/1230000");
        server = MockRestServiceServer.bindTo(builder).build();
        RestClient client = builder.build();
        props = new G2bProperties();
        props.setServiceKey("TEST-KEY");
        props.setNoticeSearchPath("/ad/BidPublicInfoService/getBidPblancListInfoServcPPSSrch");
        src = new MainNoticeSource(client, props);
    }

    private String pageJson(int totalCount, int pageNo, int count) {
        StringBuilder items = new StringBuilder("[");
        for (int i = 1; i <= count; i++) {
            if (i > 1) items.append(",");
            items.append("{\"bidNtceNo\":\"NO-").append(pageNo).append("-").append(i)
                 .append("\",\"bidNtceOrd\":\"00\",\"bidNtceNm\":\"공고-")
                 .append(pageNo).append("-").append(i)
                 .append("\",\"dminsttNm\":\"관세청\"}");
        }
        items.append("]");
        return "{\"response\":{\"header\":{\"resultCode\":\"00\",\"resultMsg\":\"정상\"},\"body\":{"
                + "\"totalCount\":" + totalCount + ",\"items\":" + items + "}}}";
    }

    @Test
    @DisplayName("원본 501건 이상(650건) 사례: totalCount에 따라 7페이지까지 모두 호출하여 650건 전체를 수집하고 truncated=false 검증")
    void fetch_over500Items_collectsAll7Pages() {
        int total = 650;
        // 1페이지~6페이지: 100건씩
        for (int p = 1; p <= 6; p++) {
            server.expect(requestTo(Matchers.containsString("getBidPblancListInfoServcPPSSrch")))
                    .andExpect(method(HttpMethod.GET))
                    .andExpect(queryParam("pageNo", String.valueOf(p)))
                    .andExpect(queryParam("numOfRows", "100"))
                    .andRespond(withSuccess(pageJson(total, p, 100), MediaType.APPLICATION_JSON));
        }
        // 7페이지: 마지막 50건
        server.expect(requestTo(Matchers.containsString("getBidPblancListInfoServcPPSSrch")))
                .andExpect(method(HttpMethod.GET))
                .andExpect(queryParam("pageNo", "7"))
                .andExpect(queryParam("numOfRows", "100"))
                .andRespond(withSuccess(pageJson(total, 7, 50), MediaType.APPLICATION_JSON));

        BidNoticeQuery q = new BidNoticeQuery(List.of("관세청"), "main", null, "20260901", "20261001", 1, 100);
        NoticeFetch fetch = src.fetch(q);

        assertThat(fetch.items()).hasSize(650);
        assertThat(fetch.sourceTotal()).isEqualTo(650);
        assertThat(fetch.truncated()).isFalse();
        server.verify();
    }
}
