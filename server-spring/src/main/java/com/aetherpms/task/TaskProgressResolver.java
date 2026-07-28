package com.aetherpms.task;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 0039 — 태스크 유효 진척률(태스크 상세·WBS·간트차트가 동일 수치를 보여야 함).
 *   산출물(pms_deliverable.task_id)이 하나라도 있으면 승인비율, 없으면 태스크 수동 progress_rate.
 * WbsService(WBS/간트 목표·실제% 산정)와 TaskReadController(태스크 상세 "진척률") 양쪽이
 * 이 클래스 하나로 계산해 두 화면이 어긋나지 않게 한다.
 */
@Component
public class TaskProgressResolver {

    private final JdbcTemplate jdbc;

    public TaskProgressResolver(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final String BATCH_SQL = """
        SELECT t.task_id,
               COALESCE(dc.total, 0) AS deliv_total,
               COALESCE(dc.approved, 0) AS deliv_approved,
               COALESCE(t.progress_rate, 0) AS manual_progress
          FROM pms_task t
          LEFT JOIN (
              SELECT task_id, CAST(COUNT(*) AS SIGNED) AS total,
                     CAST(SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) AS SIGNED) AS approved
                FROM pms_deliverable
               WHERE task_id IS NOT NULL
               GROUP BY task_id
          ) dc ON dc.task_id = t.task_id
         WHERE t.project_id = ?
        """;

    /** 프로젝트 내 전 태스크의 유효 진척률(task_id → 0~100). */
    public Map<Long, Integer> effectiveProgressByProject(long projectId) {
        Map<Long, Integer> out = new LinkedHashMap<>();
        for (Map<String, Object> r : jdbc.queryForList(BATCH_SQL, projectId)) {
            out.put(((Number) r.get("task_id")).longValue(), effective(r));
        }
        return out;
    }

    private static int effective(Map<String, Object> r) {
        long total = ((Number) r.get("deliv_total")).longValue();
        long approved = ((Number) r.get("deliv_approved")).longValue();
        int manual = ((Number) r.get("manual_progress")).intValue();
        return total > 0 ? (int) Math.round(approved * 100.0 / total) : manual;
    }
}
