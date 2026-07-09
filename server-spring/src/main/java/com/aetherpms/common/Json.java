package com.aetherpms.common;

import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * JSON 컬럼(JSON = MariaDB longtext) 직렬화/역직렬화 헬퍼.
 * audit_log before/after/changed_fields, comment/notification 등에서 공용 사용.
 */
public final class Json {

    private Json() {}

    private static final ObjectMapper M = new ObjectMapper();

    /** 객체 → JSON 문자열(null → null, DB에도 NULL 저장). */
    public static String write(Object v) {
        if (v == null) return null;
        try {
            return M.writeValueAsString(v);
        } catch (Exception e) {
            throw new IllegalStateException("JSON 직렬화 실패", e);
        }
    }

    /** JSON 문자열 → List. null/공백 → 빈 배열. */
    public static Object readArray(String raw) {
        if (raw == null || raw.isBlank()) return new java.util.ArrayList<>();
        try {
            return M.readValue(raw, List.class);
        } catch (Exception e) {
            return new java.util.ArrayList<>();
        }
    }

    /** JSON 문자열 → Map. null/공백 → 빈 객체. */
    public static Object readObject(String raw) {
        if (raw == null || raw.isBlank()) return new java.util.LinkedHashMap<>();
        try {
            return M.readValue(raw, Map.class);
        } catch (Exception e) {
            return new java.util.LinkedHashMap<>();
        }
    }

    /** JSON 문자열 → 원형(배열/객체/스칼라). null/공백 → null. */
    public static Object readAny(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return M.readValue(raw, Object.class);
        } catch (Exception e) {
            return null;
        }
    }
}
