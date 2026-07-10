package com.aetherpms.wbs;

import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * WBS/일정 조회용 조인 — 배치19 (0006 진척·0007 기대치·0011 work-surface).
 * 진척 롤업(실제%)은 ProgressService, 목표(기대%)는 SignalDates.linearExpected를 재사용하고
 * 여기서는 <b>날짜·상태·담당자</b>만 노드별로 끌어온다(중복 계산 금지).
 *
 * 계획일정 소스:
 *   - PHASE   : pms_project_tailoring.planned_start_date/planned_end_date (0007 §1)
 *   - TASK    : pms_task (generated_task_id 또는 catalog_node_id 매핑) planned/actual
 *   - ACTIVITY: 하위 TASK min/max (서비스 계층 파생)
 */
@Repository
public class WbsRepository {

    private final JdbcTemplate jdbc;

    public WbsRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public boolean projectExists(long projectId) {
        Integer c = jdbc.queryForObject(
                "SELECT COUNT(*) FROM pms_project WHERE project_id = ?", Integer.class, projectId);
        return c != null && c > 0;
    }

    /**
     * 선택된 tailoring 전개분 중 PHASE/ACTIVITY/TASK 노드 + 계획일정/태스크 상세.
     * TASK는 tailoring.generated_task_id 우선, 없으면 pms_task.catalog_node_id로 보강 매핑.
     * assignee_id(char36) → pms_project_member.user_uid(동일 프로젝트) 이름 해석, 없으면 pms_user.
     */
    private static final String WBS_NODES_SQL = """
        SELECT n.node_id, n.parent_node_id, n.node_type, n.code, n.name, n.sort_order,
               t.planned_start_date AS phase_planned_start,
               t.planned_end_date   AS phase_planned_end,
               tk.task_id,
               tk.status              AS task_status,
               tk.assignee_id         AS assignee_id,
               tk.planned_start_date  AS task_planned_start,
               tk.planned_end_date    AS task_planned_end,
               tk.actual_start_date   AS task_actual_start,
               tk.actual_end_date     AS task_actual_end,
               COALESCE(tk.assignee_name, pm.name, u.full_name) AS assignee_name
          FROM pms_project_tailoring t
          JOIN pms_catalog_node n ON n.node_id = t.catalog_node_id
          LEFT JOIN pms_task tk
                 ON tk.task_id = t.generated_task_id
                 OR (t.generated_task_id IS NULL
                     AND tk.catalog_node_id = n.node_id
                     AND tk.project_id = t.project_id)
          LEFT JOIN pms_project_member pm
                 ON pm.user_uid = tk.assignee_id AND pm.project_id = t.project_id
          LEFT JOIN pms_user u
                 ON u.username = tk.assignee_id
         WHERE t.project_id = ?
           AND t.is_selected = 1
           AND n.node_type IN ('PHASE','ACTIVITY','TASK')
         ORDER BY n.sort_order, n.node_id
        """;

    public List<Map<String, Object>> wbsNodes(long projectId) {
        return jdbc.queryForList(WBS_NODES_SQL, projectId);
    }

    /** TASK 노드별 산출물 total/approved (딜리버러블 카운트 — deliverableCounts). */
    private static final String TASK_DELIVERABLE_COUNTS_SQL = """
        SELECT n.node_id AS task_node_id,
               CAST(COUNT(*) AS SIGNED) AS total,
               CAST(SUM(CASE WHEN d.status = 'APPROVED' THEN 1 ELSE 0 END) AS SIGNED) AS approved
          FROM pms_project_tailoring t
          JOIN pms_catalog_node dn ON dn.node_id = t.catalog_node_id AND dn.node_type = 'DELIVERABLE'
          JOIN pms_catalog_node n  ON n.node_id = dn.parent_node_id
          JOIN pms_deliverable d   ON d.deliverable_id = t.generated_deliverable_id
         WHERE t.project_id = ?
           AND t.is_selected = 1
         GROUP BY n.node_id
        """;

    public List<Map<String, Object>> taskDeliverableCounts(long projectId) {
        return jdbc.queryForList(TASK_DELIVERABLE_COUNTS_SQL, projectId);
    }
}
