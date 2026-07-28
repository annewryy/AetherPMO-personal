package com.aetherpms.common;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 0039 — N:M 링크 테이블(이슈↔태스크, 회의록↔이슈/태스크/산출물) 공용 검증·동기화·배치조회 헬퍼.
 * 테이블은 (fromCol, toCol) 2컬럼 복합 PK, delete-then-insert로 동기화한다.
 */
public final class LinkTableSupport {

    private LinkTableSupport() {}

    /** raw(정수 배열) → 검증된 id 목록. targetTable/targetIdCol/projectScopeCol으로 같은 프로젝트 소속만 허용. */
    public static List<Long> validateIds(JdbcTemplate jdbc, Object raw, String label,
                                         String targetTable, String targetIdCol, long projectId) {
        if (raw == null) return List.of();
        if (!(raw instanceof List<?> list)) throw ApiException.badRequest(label + "는 정수 배열이어야 합니다.");
        List<Long> ids = new ArrayList<>();
        for (Object o : list) {
            long v;
            try {
                v = o instanceof Number n ? n.longValue() : Long.parseLong(o.toString());
            } catch (NumberFormatException e) {
                throw ApiException.badRequest(label + "에 유효하지 않은 값이 있습니다: " + o);
            }
            if (v <= 0) throw ApiException.badRequest(label + "에 유효하지 않은 값이 있습니다: " + o);
            ids.add(v);
        }
        if (ids.isEmpty()) return List.of();
        String placeholders = String.join(",", Collections.nCopies(ids.size(), "?"));
        Object[] args = new Object[ids.size() + 1];
        args[0] = projectId;
        for (int i = 0; i < ids.size(); i++) args[i + 1] = ids.get(i);
        Integer matched = jdbc.queryForObject(
                "SELECT COUNT(*) FROM " + targetTable + " WHERE project_id = ? AND " + targetIdCol
                        + " IN (" + placeholders + ")",
                Integer.class, args);
        if (matched == null || matched != ids.size()) {
            throw ApiException.badRequest(label + "에 이 프로젝트 소속이 아닌 값이 있습니다.");
        }
        return ids;
    }

    public static void sync(JdbcTemplate jdbc, String linkTable, String fromCol, String toCol,
                            long fromId, List<Long> toIds) {
        jdbc.update("DELETE FROM " + linkTable + " WHERE " + fromCol + " = ?", fromId);
        for (Long toId : toIds) {
            jdbc.update("INSERT INTO " + linkTable + " (" + fromCol + ", " + toCol + ") VALUES (?, ?)",
                    fromId, toId);
        }
    }

    /** fromIds 각각에 매핑된 toId 목록을 배치 조회(N+1 방지) — rows에 outKey로 부착. */
    public static void attach(JdbcTemplate jdbc, List<Map<String, Object>> rows, String idKey,
                              String linkTable, String fromCol, String toCol, String outKey) {
        if (rows.isEmpty()) return;
        List<Long> ids = rows.stream().map(r -> ((Number) r.get(idKey)).longValue()).toList();
        String placeholders = String.join(",", Collections.nCopies(ids.size(), "?"));
        List<Map<String, Object>> links = jdbc.queryForList(
                "SELECT " + fromCol + ", " + toCol + " FROM " + linkTable
                        + " WHERE " + fromCol + " IN (" + placeholders + ")",
                ids.toArray());
        Map<Long, List<Long>> byFrom = new LinkedHashMap<>();
        for (Map<String, Object> l : links) {
            long f = ((Number) l.get(fromCol)).longValue();
            byFrom.computeIfAbsent(f, k -> new ArrayList<>()).add(((Number) l.get(toCol)).longValue());
        }
        for (Map<String, Object> row : rows) {
            row.put(outKey, byFrom.getOrDefault(((Number) row.get(idKey)).longValue(), List.of()));
        }
    }
}
