package com.aetherpms.progress;

import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * 진척 롤업 — 0006 "읽기 시 계산", recursive CTE 한 방.
 * Node engine/progress.ts PROGRESS_ROLLUP_SQL 을 MariaDB 방언으로 이식.
 *
 * PostgreSQL → MariaDB 변환 지점(이 마일스톤의 핵심 리스크):
 *   - is_selected = true            → is_selected = 1  (boolean→TINYINT)
 *   - count(*)::int / sum(x)::int   → CAST(COUNT(*) AS SIGNED) / CAST(SUM(x) AS SIGNED)
 *   - null::bigint / null::text     → NULL (컬럼 타입은 UNION 첫 갈래가 결정)
 *   - public. 스키마 접두사          → 제거
 *   - WITH RECURSIVE + 비재귀 CTE(deliv) 혼재 → MariaDB 허용
 *   - $1 파라미터                    → ? 세 자리(deliv, PROJECT total, PROJECT approved)
 */
@Repository
public class ProgressRepository {

    private final JdbcTemplate jdbc;

    public ProgressRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // (첫 줄 주석 마커는 Node와 동일하게 유지 — SQL 식별자)
    static final String PROGRESS_ROLLUP_SQL = """
        -- progress-rollup
        WITH RECURSIVE deliv AS (
          SELECT t.catalog_node_id AS node_id,
                 CASE WHEN d.status = 'APPROVED' THEN 1 ELSE 0 END AS approved
            FROM pms_project_tailoring t
            JOIN pms_deliverable d ON d.deliverable_id = t.generated_deliverable_id
           WHERE t.project_id = ?
             AND t.is_selected = 1
        ),
        rollup AS (
          SELECT node_id, approved FROM deliv
          UNION ALL
          SELECT c.parent_node_id AS node_id, r.approved
            FROM rollup r
            JOIN pms_catalog_node c ON c.node_id = r.node_id
           WHERE c.parent_node_id IS NOT NULL
        ),
        agg AS (
          SELECT node_id,
                 CAST(COUNT(*) AS SIGNED) AS total,
                 CAST(SUM(approved) AS SIGNED) AS approved
            FROM rollup
           GROUP BY node_id
        )
        SELECT n.node_id, n.parent_node_id, n.node_type, n.code, n.name, n.sort_order,
               COALESCE(a.total, 0) AS total, COALESCE(a.approved, 0) AS approved
          FROM pms_project_tailoring t
          JOIN pms_catalog_node n ON n.node_id = t.catalog_node_id
          LEFT JOIN agg a ON a.node_id = n.node_id
         WHERE t.project_id = ?
           AND t.is_selected = 1
           AND n.node_type IN ('PHASE','ACTIVITY','TASK')
        UNION ALL
        SELECT NULL, NULL, 'PROJECT', NULL, NULL, 0,
               COALESCE((SELECT CAST(COUNT(*) AS SIGNED) FROM deliv), 0),
               COALESCE((SELECT CAST(SUM(approved) AS SIGNED) FROM deliv), 0)
        """;

    public List<Map<String, Object>> rollup(long projectId) {
        // deliv(?), 메인 where(?), PROJECT total 서브쿼리, PROJECT approved 서브쿼리 = 4개.
        // 단, deliv CTE는 rollup·agg·PROJECT행에서 모두 참조되지만 파라미터는 CTE 정의 1회 +
        // 메인 SELECT where 1회. PROJECT행 서브쿼리는 deliv(이미 바인딩된 CTE)를 재사용하므로
        // 추가 파라미터가 없다. → 실제 ? 개수는 2개.
        return jdbc.queryForList(PROGRESS_ROLLUP_SQL, projectId, projectId);
    }

    public Integer findManualProgressRate(long projectId) {
        List<Integer> rows = jdbc.query(
                "SELECT progress_rate FROM pms_project WHERE project_id = ?",
                (rs, i) -> rs.getObject("progress_rate") == null ? null : rs.getInt("progress_rate"),
                projectId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public boolean projectExists(long projectId) {
        Integer c = jdbc.queryForObject(
                "SELECT COUNT(*) FROM pms_project WHERE project_id = ?", Integer.class, projectId);
        return c != null && c > 0;
    }
}
