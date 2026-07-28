package com.aetherpms.signal;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import com.aetherpms.auth.AuthContext;
import com.aetherpms.common.ApiException;

import jakarta.servlet.http.HttpServletRequest;

/**
 * 0038 — 실무진용 대시보드(내 업무): 세션 person 기준(아마란스·자체 로그인 무관).
 *   내 참여 프로젝트(+산출물 승인률 진척) / 내 담당 태스크·액션아이템·이슈·산출물(오늘·지연 플래그)
 *   / 유형별 "미해결 n / 총 N" 카운트. person 미연결 계정은 needsPersonLink=true(관리자 연결 안내).
 */
@RestController
public class MyDashboardController {

    private static final int LIST_LIMIT = 20;

    private final JdbcTemplate jdbc;

    public MyDashboardController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/api/dashboard/my")
    public Map<String, Object> my(HttpServletRequest req) {
        AuthContext ctx = AuthContext.of(req);
        if (ctx == null) throw ApiException.unauthorized("로그인이 필요합니다.");
        Map<String, Object> out = new LinkedHashMap<>();
        if (ctx.personId() == null) {
            out.put("needsPersonLink", true);
            return out;
        }
        String name = jdbc.query("SELECT name FROM pms_person WHERE person_id = ?",
                rs -> rs.next() ? rs.getString(1) : null, ctx.personId());
        if (name == null) {
            out.put("needsPersonLink", true);
            return out;
        }
        String today = LocalDate.now().toString();
        out.put("needsPersonLink", false);
        out.put("personName", name);

        // ---- 내 참여 프로젝트(+산출물 승인률 진척, 0006과 동일 산식) ----
        List<Map<String, Object>> projects = new ArrayList<>();
        jdbc.query("""
                SELECT p.project_id, p.project_name, p.project_stage, p.status, p.planned_end_date,
                       (SELECT COUNT(*) FROM pms_deliverable d WHERE d.project_id = p.project_id) AS total_d,
                       (SELECT COUNT(*) FROM pms_deliverable d WHERE d.project_id = p.project_id
                          AND d.status = 'APPROVED') AS approved_d,
                       MAX(m.is_project_manager) AS is_pm
                  FROM pms_project_member m
                  JOIN pms_project p ON p.project_id = m.project_id
                 WHERE m.person_id = ? AND COALESCE(m.is_active, 1) = 1 AND p.status <> '완료'
                 GROUP BY p.project_id ORDER BY p.project_id""",
                rs -> {
                    long total = rs.getLong("total_d");
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("projectId", rs.getLong("project_id"));
                    m.put("projectName", rs.getString("project_name"));
                    m.put("stage", rs.getString("project_stage"));
                    m.put("status", rs.getString("status"));
                    m.put("isPm", rs.getInt("is_pm") == 1);
                    m.put("progress", total == 0 ? null
                            : Math.round(rs.getLong("approved_d") * 100.0 / total));
                    projects.add(m);
                }, ctx.personId());
        out.put("projects", projects);

        // ---- 내 담당 항목(유형별 목록 + n/N 카운트) ----
        out.put("tasks", items("""
                SELECT t.task_id AS id, t.task_name AS title, t.planned_end_date AS due,
                       COALESCE(t.progress_rate, 0) AS progress, p.project_id, p.project_name
                  FROM pms_task t JOIN pms_project p ON p.project_id = t.project_id
                 WHERE p.status <> '완료' AND t.assignee_name = ? AND t.status <> 'DONE'
                 ORDER BY t.planned_end_date IS NULL, t.planned_end_date, t.task_id LIMIT %d""".formatted(LIST_LIMIT),
                name, today));
        out.put("actionItems", items("""
                SELECT a.action_id AS id, a.title, a.due_date AS due, NULL AS progress, p.project_id, p.project_name
                  FROM pms_action_item a JOIN pms_project p ON p.project_id = a.project_id
                 WHERE p.status <> '완료' AND a.assignee_name = ? AND COALESCE(a.status, '대기') <> '완료'
                 ORDER BY a.due_date IS NULL, a.due_date, a.action_id LIMIT %d""".formatted(LIST_LIMIT),
                name, today));
        out.put("issues", items("""
                SELECT i.issue_id AS id, CONCAT('[', i.type, '] ', i.title) AS title, i.due_date AS due,
                       NULL AS progress, p.project_id, p.project_name
                  FROM pms_issue i JOIN pms_project p ON p.project_id = i.project_id
                 WHERE p.status <> '완료' AND i.owner_name = ? AND COALESCE(i.status, '발생') <> '완료'
                 ORDER BY i.due_date IS NULL, i.due_date, i.issue_id LIMIT %d""".formatted(LIST_LIMIT),
                name, today));
        out.put("deliverables", items("""
                SELECT d.deliverable_id AS id, d.deliverable_name AS title, d.due_date AS due,
                       NULL AS progress, p.project_id, p.project_name
                  FROM pms_deliverable d JOIN pms_project p ON p.project_id = d.project_id
                 WHERE p.status <> '완료' AND d.author_name = ? AND d.submitted_at IS NULL AND d.status <> 'APPROVED'
                 ORDER BY d.due_date IS NULL, d.due_date, d.deliverable_id LIMIT %d""".formatted(LIST_LIMIT),
                name, today));

        // ---- 유형별 미해결 n / 총 N (내 담당 전체 기준) ----
        Map<String, Object> counts = new LinkedHashMap<>();
        counts.put("tasks", openTotal(
                "SELECT COUNT(*), SUM(t.status <> 'DONE') FROM pms_task t "
              + "JOIN pms_project p ON p.project_id = t.project_id WHERE p.status <> '완료' AND t.assignee_name = ?", name));
        counts.put("actionItems", openTotal(
                "SELECT COUNT(*), SUM(COALESCE(a.status, '대기') <> '완료') FROM pms_action_item a "
              + "JOIN pms_project p ON p.project_id = a.project_id WHERE p.status <> '완료' AND a.assignee_name = ?", name));
        counts.put("issues", openTotal(
                "SELECT COUNT(*), SUM(COALESCE(i.status, '발생') <> '완료') FROM pms_issue i "
              + "JOIN pms_project p ON p.project_id = i.project_id WHERE p.status <> '완료' AND i.owner_name = ?", name));
        counts.put("deliverables", openTotal(
                "SELECT COUNT(*), SUM(d.submitted_at IS NULL AND d.status <> 'APPROVED') FROM pms_deliverable d "
              + "JOIN pms_project p ON p.project_id = d.project_id WHERE p.status <> '완료' AND d.author_name = ?", name));
        out.put("counts", counts);
        return out;
    }

    private List<Map<String, Object>> items(String sql, String name, String today) {
        List<Map<String, Object>> out = new ArrayList<>();
        jdbc.query(sql, rs -> {
            String due = rs.getString("due");
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", rs.getLong("id"));
            m.put("title", rs.getString("title"));
            m.put("dueDate", due);
            m.put("progress", rs.getObject("progress") == null ? null : rs.getInt("progress"));
            m.put("projectId", rs.getLong("project_id"));
            m.put("projectName", rs.getString("project_name"));
            m.put("overdue", due != null && due.compareTo(today) < 0);
            m.put("dueToday", today.equals(due));
            out.add(m);
        }, name);
        return out;
    }

    private Map<String, Object> openTotal(String sql, String name) {
        return jdbc.query(sql, rs -> {
            rs.next();
            long total = rs.getLong(1);
            long open = rs.getLong(2);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("total", total);
            m.put("open", open);
            return m;
        }, name);
    }
}
