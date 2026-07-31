package com.aetherpms.task;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 0039 — 태스크 유효 진척률(태스크 상세·WBS·간트차트가 동일 수치를 보여야 함).
 *   담당자가 직접 입력한 progress_rate가 있으면(>0) 그 값이 우선이고,
 *   입력값이 없을 때만 산출물(pms_deliverable.task_id) 상태 가중치 평균으로 자동 계산한다.
 *   (사용자 결정 2026-07-31: 수동 우선 유지 + 하위 산출물 상태 전이 시 수동값 리셋 —
 *    TransitionService가 산출물 전이 때 부모 태스크 progress_rate를 NULL로 지워
 *    계산값으로 복귀시킨다. 수동값은 "다음 산출물 변경 전까지의 스냅샷"이라 낡은 수치가 남지 않는다.)
 * WbsService(WBS/간트 목표·실제% 산정)와 TaskReadController(태스크 상세 "진척률") 양쪽이
 * 이 클래스 하나로 계산해 두 화면이 어긋나지 않게 한다.
 */
@Component
public class TaskProgressResolver {

    private final JdbcTemplate jdbc;

    public TaskProgressResolver(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // 0039 — 산출물 진척은 "승인 개수 비율"이 아니라 워크플로 상태별 진척률(progress_weight)의
    //   평균으로 계산한다(작성중/제출/검토중이 전부 0%로 같게 취급되던 문제). 가중치는
    //   기본 워크플로(pms_workflow.is_default=1)의 상태 코드로 매칭하며, 가중치가 지정되지 않은
    //   코드는 예전 규칙(승인=100, 그 외 0)으로 대체한다.
    private static final String BATCH_SQL = """
        SELECT t.task_id,
               COALESCE(dc.total, 0) AS deliv_total,
               COALESCE(dc.weight_sum, 0) AS deliv_weight_sum,
               COALESCE(t.progress_rate, 0) AS manual_progress
          FROM pms_task t
          LEFT JOIN (
              SELECT d.task_id,
                     CAST(COUNT(*) AS SIGNED) AS total,
                     CAST(SUM(COALESCE(ws.progress_weight,
                                       CASE WHEN d.status = 'APPROVED' THEN 100 ELSE 0 END)) AS SIGNED) AS weight_sum
                FROM pms_deliverable d
                LEFT JOIN pms_workflow_status ws
                       ON ws.code = d.status
                      AND ws.workflow_id = (SELECT workflow_id FROM pms_workflow
                                             ORDER BY is_default DESC, workflow_id ASC LIMIT 1)
               WHERE d.task_id IS NOT NULL
               GROUP BY d.task_id
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
        long weightSum = ((Number) r.get("deliv_weight_sum")).longValue();
        int manual = ((Number) r.get("manual_progress")).intValue();
        if (manual > 0) return manual;                 // 담당자 직접 입력값 우선(산출물 전이 시 리셋됨)
        return total > 0 ? (int) Math.round((double) weightSum / total) : 0;
    }
}
