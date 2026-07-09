package com.aetherpms.issue;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * 표시 코드(display_code) 발번 — 0010 A-4, Node display-code.ts 이식.
 * 슬라이스 범위: ISSUE 수동 등록(catalog_node_id 없음) → 커스텀 순번 I-{seq}.
 *
 * 동시성 안전 발번(MariaDB 변환):
 *   PostgreSQL: INSERT ... ON CONFLICT (project_id, entity_type)
 *               DO UPDATE SET last_seq = last_seq + 1 RETURNING last_seq
 *   MariaDB   : INSERT ... ON DUPLICATE KEY UPDATE
 *               last_seq = LAST_INSERT_ID(last_seq + 1)
 *               → 이후 SELECT LAST_INSERT_ID() 로 증가값 회수.
 *   uk_code_counter (project_id, entity_type) unique 로 동시 삽입/증가 정합성 보장.
 *   반드시 같은 커넥션(@Transactional)에서 INSERT 후 LAST_INSERT_ID()를 읽어야 한다.
 */
@Service
public class DisplayCodeService {

    private final JdbcTemplate jdbc;

    public DisplayCodeService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public String nextIssueDisplayCode(long projectId) {
        return nextDisplayCode(projectId, "ISSUE", null);
    }

    /**
     * 다음 display_code 생성 — Node display-code.ts nextDisplayCode 이식.
     * 카탈로그 노드가 있으면 {prefix}-{카탈로그코드}, 없으면 {prefix}-{순번}.
     * 접두사: T(TASK)·D(DELIVERABLE)·I(ISSUE)·A(ACTION_ITEM).
     */
    public String nextDisplayCode(long projectId, String entityType, Long catalogNodeId) {
        String prefix = switch (entityType) {
            case "TASK" -> "T";
            case "DELIVERABLE" -> "D";
            case "ISSUE" -> "I";
            case "ACTION_ITEM" -> "A";
            default -> "X";
        };

        // 카탈로그 전개분: {prefix}-{카탈로그코드}
        if (catalogNodeId != null) {
            java.util.List<String> codes = jdbc.query(
                    "SELECT code FROM pms_catalog_node WHERE node_id = ?",
                    (rs, i) -> rs.getString("code"), catalogNodeId);
            String catalogCode = codes.isEmpty() ? null : codes.get(0);
            if (catalogCode != null) return prefix + "-" + catalogCode;
        }

        // 커스텀 순번: pms_code_counter upsert(동시성 안전 발번)
        jdbc.update(
                "INSERT INTO pms_code_counter (project_id, entity_type, last_seq) "
              + "VALUES (?, ?, 1) "
              + "ON DUPLICATE KEY UPDATE last_seq = LAST_INSERT_ID(last_seq + 1)",
                projectId, entityType);
        Long seq = jdbc.queryForObject(
                "SELECT last_seq FROM pms_code_counter WHERE project_id = ? AND entity_type = ?",
                Long.class, projectId, entityType);
        return prefix + "-" + (seq == null ? 1 : seq);
    }
}
