package com.aetherpms.g2b;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * 나라장터 OpenAPI 응답 파싱 공용 헬퍼 — 레거시 api/g2b.js 로직 이식.
 *
 * 조달청 응답은 정상 시 JSON(response.body.items[]) 이지만, 인증/게이트웨이 오류 시
 * XML(<errMsg>/<returnAuthMsg>)로 온다. 레거시와 동일하게 XML 오류를 먼저 감지.
 */
final class G2bResponseParser {

    private static final ObjectMapper OM = new ObjectMapper();

    private static final Pattern XML_ERR = Pattern.compile("<errMsg>|<returnAuthMsg>");
    private static final Pattern RSN_CODE = Pattern.compile("<returnReasonCode>([^<]+)</returnReasonCode>");
    private static final Pattern RES_CODE = Pattern.compile("<resultCode>([^<]+)</resultCode>");
    private static final Pattern AUTH_MSG = Pattern.compile("<returnAuthMsg>([^<]+)</returnAuthMsg>");
    private static final Pattern RES_MSG = Pattern.compile("<resultMsg>([^<]+)</resultMsg>");
    private static final Pattern ERR_MSG = Pattern.compile("<errMsg>([^<]+)</errMsg>");

    private G2bResponseParser() {}

    /** XML 오류면 {code,msg} 문자열, 아니면 null (레거시 extractXmlError). */
    static String detectXmlError(String body) {
        if (body == null || body.isEmpty()) return null;
        if (!XML_ERR.matcher(body).find()) return null;
        String code = first(RSN_CODE, body);
        if (code == null) code = first(RES_CODE, body);
        String msg = first(AUTH_MSG, body);
        if (msg == null) msg = first(RES_MSG, body);
        if (msg == null) msg = first(ERR_MSG, body);
        return "Code: " + (code == null ? "UNKNOWN" : code)
                + ", Message: " + (msg == null ? "Authentication or Gateway Error" : msg);
    }

    /**
     * 정상 JSON 응답에서 item 목록을 추출(레거시 response.body.items 처리).
     * header.resultCode != '00' 이면 예외. items는 배열 or {item:...} 형태 모두 흡수.
     */
    static List<Map<String, Object>> extractItems(String body) {
        JsonNode root;
        try {
            root = OM.readTree(body);
        } catch (Exception e) {
            String snippet = body == null ? "Empty response"
                    : body.substring(0, Math.min(200, body.length()));
            throw new G2bException("나라장터 응답을 JSON으로 파싱하지 못했습니다. preview: " + snippet);
        }
        JsonNode header = root.path("response").path("header");
        String resultCode = header.path("resultCode").asText(null);
        if (resultCode != null && !resultCode.isEmpty() && !"00".equals(resultCode)) {
            throw new G2bException("나라장터 OpenAPI 오류 - Code: " + resultCode
                    + ", Message: " + header.path("resultMsg").asText(""));
        }
        JsonNode items = root.path("response").path("body").path("items");
        List<Map<String, Object>> out = new ArrayList<>();
        if (items.isArray()) {
            for (JsonNode n : items) out.add(toMap(n));
        } else if (items.path("item").isArray()) {
            for (JsonNode n : items.path("item")) out.add(toMap(n));
        } else if (!items.path("item").isMissingNode() && !items.path("item").isNull()) {
            out.add(toMap(items.path("item")));
        }
        return out;
    }

    /** 응답 totalCount(있으면). */
    static int totalCount(String body) {
        try {
            JsonNode root = OM.readTree(body);
            return root.path("response").path("body").path("totalCount").asInt(0);
        } catch (Exception e) {
            return 0;
        }
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> toMap(JsonNode node) {
        return OM.convertValue(node, Map.class);
    }

    private static String first(Pattern p, String s) {
        Matcher m = p.matcher(s);
        return m.find() ? m.group(1).trim() : null;
    }
}
