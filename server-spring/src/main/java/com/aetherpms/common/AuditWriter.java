package com.aetherpms.common;

import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * pms_audit_log INSERT 공용 헬퍼 — Node 각 라우트의 insertAudit() 이식.
 * before/after/changed_fields는 JSON 컬럼(Jackson 직렬화). changed_by_uid는 actor.
 */
@Component
public class AuditWriter {

    private final JdbcTemplate jdbc;

    public AuditWriter(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * @param entityType  대문자 엔티티 코드(ISSUE·CATALOG_NODE·WORKFLOW …)
     * @param projectId   null 허용(관리자/워크플로 쓰기는 null)
     * @param action      INSERT | UPDATE | DELETE
     * @param changedFields null 허용
     * @param before      null 허용(스칼라·Map)
     * @param after       null 허용
     */
    public void write(String entityType, long entityId, Long projectId, String action,
                      List<String> changedFields, Object before, Object after,
                      Actor actor, String reason) {
        jdbc.update(
                "INSERT INTO pms_audit_log "
              + "(entity_type, entity_id, project_id, action, changed_fields, `before`, `after`, "
              + "changed_by_uid, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                entityType, entityId, projectId, action,
                Json.write(changedFields), Json.write(before), Json.write(after),
                actor == null ? null : actor.userId(), reason);
    }

    /** cols 필드만 뽑아 Map으로(변경 전/후 부분 기록용). */
    public static Map<String, Object> pick(Map<String, Object> row, List<String> cols) {
        java.util.LinkedHashMap<String, Object> out = new java.util.LinkedHashMap<>();
        for (String c : cols) out.put(c, row.get(c));
        return out;
    }
}
