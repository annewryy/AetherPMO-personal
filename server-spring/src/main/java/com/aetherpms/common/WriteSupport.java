package com.aetherpms.common;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;

import com.aetherpms.common.ApiException;

/**
 * 쓰기 라우트 공용 SQL 헬퍼 — 동적 INSERT/UPDATE(컬럼 목록 → placeholders) +
 * 단건 조회(FOR UPDATE). Node buildInsert / update set 패턴 이식.
 * MariaDB는 RETURNING 미지원 → INSERT 후 LAST_INSERT_ID() 또는 재조회로 row를 되읽는다.
 */
public final class WriteSupport {

    private WriteSupport() {}

    /** Number/문자 → 양의 정수 파싱. 아니면 400. */
    public static long parseId(long id) {
        if (id <= 0) throw ApiException.badRequest("유효하지 않은 id입니다.");
        return id;
    }

    /** SELECT * FROM table WHERE idCol = ? (없으면 null). */
    public static Map<String, Object> findOne(JdbcTemplate jdbc, String table, String idCol, long id) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT * FROM " + table + " WHERE " + idCol + " = ?", id);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** 동적 INSERT + LAST_INSERT_ID()로 생성 row 되읽기(AUTO_INCREMENT PK 전용). */
    public static Map<String, Object> insertReturning(
            JdbcTemplate jdbc, String table, String pkCol, Map<String, Object> fields) {
        List<String> cols = new ArrayList<>(fields.keySet());
        String colList = String.join(", ", cols.stream().map(WriteSupport::quote).toList());
        String ph = String.join(", ", cols.stream().map(c -> "?").toList());
        Object[] vals = cols.stream().map(fields::get).toArray();
        jdbc.update("INSERT INTO " + table + " (" + colList + ") VALUES (" + ph + ")", vals);
        Long id = jdbc.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        return findOne(jdbc, table, pkCol, id == null ? 0 : id);
    }

    /** 동적 UPDATE(cols=fields) + 갱신 후 row 재조회. */
    public static Map<String, Object> updateReturning(
            JdbcTemplate jdbc, String table, String idCol, long id,
            Map<String, Object> fields, boolean touchUpdatedAt) {
        List<String> cols = new ArrayList<>(fields.keySet());
        String sets = String.join(", ", cols.stream().map(c -> quote(c) + " = ?").toList());
        if (touchUpdatedAt) sets += ", updated_at = CURRENT_TIMESTAMP(6)";
        List<Object> args = new ArrayList<>();
        for (String c : cols) args.add(fields.get(c));
        args.add(id);
        jdbc.update("UPDATE " + table + " SET " + sets + " WHERE " + idCol + " = ?", args.toArray());
        return findOne(jdbc, table, idCol, id);
    }

    /** `before`/`after` 등 예약어 컬럼 백틱 처리. */
    static String quote(String col) {
        return switch (col) {
            case "before", "after" -> "`" + col + "`";
            default -> col;
        };
    }

    /** 여러 컬럼만 뽑아 Map으로. */
    public static Map<String, Object> pick(Map<String, Object> row, List<String> cols) {
        LinkedHashMap<String, Object> out = new LinkedHashMap<>();
        for (String c : cols) out.put(c, row.get(c));
        return out;
    }

    // ---- 쓰기 본문 공용 헬퍼(구 AdminService 정적 유틸 승격) --------------------

    /** 입력 키를 표준 컬럼명으로 별칭 매핑. 충돌 시 400. */
    public static Map<String, Object> applyAliases(Map<String, Object> raw, Map<String, String> aliases) {
        Map<String, Object> out = new LinkedHashMap<>();
        List<String> conflicts = new java.util.ArrayList<>();
        if (raw != null) {
            for (Map.Entry<String, Object> e : raw.entrySet()) {
                String target = aliases.getOrDefault(e.getKey(), e.getKey());
                if (out.containsKey(target)) conflicts.add(e.getKey() + "/" + target);
                out.put(target, e.getValue());
            }
        }
        if (!conflicts.isEmpty()) {
            throw ApiException.badRequest("중복 지정된 필드: " + String.join(", ", conflicts));
        }
        return out;
    }

    public static Long toLong(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return n.longValue();
        return Long.parseLong(o.toString());
    }

    public static Integer intOrNull(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) {
            double d = n.doubleValue();
            if (d != Math.floor(d)) return null;
            return (int) d;
        }
        try { return Integer.parseInt(o.toString()); } catch (NumberFormatException e) { return null; }
    }
}
