package com.aetherpms.g2b;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

/** 응답 파서 유닛 테스트 — XML 오류 감지 + JSON item 추출(배열/단건 형태). */
class G2bResponseParserTest {

    @Test
    void detectXmlError_authFailure() {
        String xml = "<OpenAPI_ServiceResponse><cmmMsgHeader>" +
                "<returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg>" +
                "<returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>";
        String err = G2bResponseParser.detectXmlError(xml);
        assertThat(err).contains("30").contains("SERVICE_KEY_IS_NOT_REGISTERED_ERROR");
    }

    @Test
    void detectXmlError_returnsNullForJson() {
        assertThat(G2bResponseParser.detectXmlError("{\"response\":{}}")).isNull();
    }

    @Test
    void extractItems_arrayForm() {
        String json = "{\"response\":{\"header\":{\"resultCode\":\"00\"},\"body\":{" +
                "\"totalCount\":2,\"items\":[{\"bidNtceNo\":\"A1\"},{\"bidNtceNo\":\"A2\"}]}}}";
        List<Map<String, Object>> items = G2bResponseParser.extractItems(json);
        assertThat(items).hasSize(2);
        assertThat(items.get(0).get("bidNtceNo")).isEqualTo("A1");
        assertThat(G2bResponseParser.totalCount(json)).isEqualTo(2);
    }

    @Test
    void extractItems_singleItemForm() {
        String json = "{\"response\":{\"header\":{\"resultCode\":\"00\"},\"body\":{" +
                "\"items\":{\"item\":{\"bidNtceNo\":\"A1\"}}}}}";
        assertThat(G2bResponseParser.extractItems(json)).hasSize(1);
    }

    @Test
    void extractItems_nonZeroResultCode_throws() {
        String json = "{\"response\":{\"header\":{\"resultCode\":\"07\",\"resultMsg\":\"LIMIT\"}}}";
        assertThatThrownBy(() -> G2bResponseParser.extractItems(json))
                .isInstanceOf(G2bException.class)
                .hasMessageContaining("07");
    }
}
