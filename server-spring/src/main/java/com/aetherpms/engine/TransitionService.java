package com.aetherpms.engine;

import com.aetherpms.common.WriteSupport;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.aetherpms.common.Actor;
import com.aetherpms.common.ApiException;
import com.aetherpms.engine.ConditionEngine;

/**
 * §3 GET /api/{entity}/{id}/transitions — 가용 전이(+조건 평가)
 * §4 POST /api/{entity}/{id}/transition — 전이 실행(조건 재평가 후 상태 변경)
 * Node routes/transitions.ts 이식. entity ∈ deliverables | tasks.
 */
@Service
public class TransitionService {

    private com.aetherpms.notification.NotificationService notify;

    private final JdbcTemplate jdbc;

    public TransitionService(JdbcTemplate jdbc, com.aetherpms.notification.NotificationService notify) {
        this.jdbc = jdbc;
        this.notify = notify;
    }

    private record EntityConfig(String table, String idCol, String entityType) {}

    private static EntityConfig config(String entity) {
        return switch (entity) {
            case "deliverables" -> new EntityConfig("pms_deliverable", "deliverable_id", "DELIVERABLE");
            case "tasks" -> new EntityConfig("pms_task", "task_id", "TASK");
            default -> throw ApiException.badRequest(
                    "지원하지 않는 엔티티입니다: " + entity + " (지원: deliverables, tasks)");
        };
    }

    private Map<String, Object> fetchEntity(EntityConfig cfg, long id) {
        Map<String, Object> row = WriteSupport.findOne(jdbc, cfg.table(), cfg.idCol(), id);
        if (row == null) throw ApiException.notFound("대상 엔티티를 찾을 수 없습니다.");
        return row;
    }

    /** 엔티티의 워크플로 결정 — 카탈로그 노드 연결 우선, 없으면 status 코드 폴백. */
    private long resolveWorkflowId(Map<String, Object> entity) {
        Object catalogNodeId = entity.get("catalog_node_id");
        if (catalogNodeId != null) {
            List<Long> wf = jdbc.query("SELECT workflow_id FROM pms_catalog_node WHERE node_id = ?",
                    (rs, i) -> rs.getObject("workflow_id") == null ? null : rs.getLong("workflow_id"), catalogNodeId);
            if (!wf.isEmpty() && wf.get(0) != null) return wf.get(0);
        }
        List<Long> rows = jdbc.query(
                "SELECT ws.workflow_id FROM pms_workflow_status ws "
              + "JOIN pms_workflow w ON w.workflow_id = ws.workflow_id "
              + "WHERE ws.code = ? ORDER BY w.is_default DESC, w.workflow_id LIMIT 1",
                (rs, i) -> rs.getLong("workflow_id"), entity.get("status"));
        if (!rows.isEmpty()) return rows.get(0);
        throw ApiException.conflict("이 엔티티에 적용 가능한 워크플로를 찾을 수 없습니다.");
    }

    // =====================================================================
    // GET /api/{entity}/{id}/transitions
    // =====================================================================

    public List<Map<String, Object>> list(String entity, long id, Actor actor) {
        EntityConfig cfg = config(entity);
        WriteSupport.parseId(id);
        Map<String, Object> ent = fetchEntity(cfg, id);
        long workflowId = resolveWorkflowId(ent);

        List<Map<String, Object>> transitions = jdbc.queryForList(
                "SELECT t.transition_id, t.name, ts.code AS to_status FROM pms_workflow_transition t "
              + "JOIN pms_workflow_status fs ON fs.status_id = t.from_status_id "
              + "JOIN pms_workflow_status ts ON ts.status_id = t.to_status_id "
              + "WHERE t.workflow_id = ? AND fs.code = ? ORDER BY t.transition_id",
                workflowId, ent.get("status"));

        ConditionEngine.EvalCtx ctx = new ConditionEngine.EvalCtx(
                jdbc, cfg.entityType(), id, ent, toLong(ent.get("project_id")), actor.userId());

        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> t : transitions) {
            long transitionId = toLong(t.get("transition_id"));
            List<ConditionEngine.ConditionRow> conditions = ConditionEngine.loadConditions(jdbc, transitionId);
            ConditionEngine.EvaluationResult eval = ConditionEngine.evaluate(conditions, ctx);

            Map<String, Object> out = new LinkedHashMap<>();
            out.put("transition_id", transitionId);
            out.put("name", t.get("name"));
            out.put("to_status", t.get("to_status"));
            out.put("allowed", eval.allowed());
            List<Map<String, Object>> failed = new ArrayList<>();
            for (ConditionEngine.FailedCondition f : eval.failedConditions()) {
                failed.add(Map.of("condition_id", f.conditionId(), "error_message", f.errorMessage()));
            }
            out.put("failed_conditions", failed);
            List<String> warnings = new ArrayList<>();
            for (ConditionEngine.FailedCondition w : eval.warnings()) warnings.add(w.errorMessage());
            out.put("warnings", warnings);
            result.add(out);
        }
        return result;
    }

    // =====================================================================
    // POST /api/{entity}/{id}/transition
    // =====================================================================

    @Transactional
    public Map<String, Object> execute(String entity, long id, Map<String, Object> body, Actor actor) {
        EntityConfig cfg = config(entity);
        WriteSupport.parseId(id);
        Object tidRaw = body == null ? null : body.get("transition_id");
        Integer transitionId = WriteSupport.intOrNull(tidRaw);
        if (transitionId == null || transitionId <= 0) {
            throw ApiException.badRequest("transition_id가 필요합니다.");
        }

        Map<String, Object> ent = fetchEntity(cfg, id);
        long workflowId = resolveWorkflowId(ent);

        List<Map<String, Object>> trRows = jdbc.queryForList(
                "SELECT t.transition_id, t.name, fs.code AS from_status, ts.code AS to_status "
              + "FROM pms_workflow_transition t "
              + "JOIN pms_workflow_status fs ON fs.status_id = t.from_status_id "
              + "JOIN pms_workflow_status ts ON ts.status_id = t.to_status_id "
              + "WHERE t.transition_id = ? AND t.workflow_id = ?", transitionId, workflowId);
        if (trRows.isEmpty()) throw ApiException.notFound("해당 워크플로에서 전이를 찾을 수 없습니다.");
        Map<String, Object> transition = trRows.get(0);

        String fromStatus = str(transition.get("from_status"));
        String toStatus = str(transition.get("to_status"));
        String currentStatus = str(ent.get("status"));
        if (!fromStatus.equals(currentStatus)) {
            throw ApiException.conflict("현재 상태(" + currentStatus + ")에서 실행할 수 없는 전이입니다(요구 상태: "
                    + fromStatus + ").");
        }

        List<ConditionEngine.ConditionRow> conditions = ConditionEngine.loadConditions(jdbc, transitionId);
        ConditionEngine.EvalCtx ctx = new ConditionEngine.EvalCtx(
                jdbc, cfg.entityType(), id, ent, toLong(ent.get("project_id")), actor.userId());
        ConditionEngine.EvaluationResult eval = ConditionEngine.evaluate(conditions, ctx);

        // COMMENT_REQUIRED 검사 (body.comment)
        boolean hasCommentRequired = conditions.stream()
                .anyMatch(c -> "COMMENT_REQUIRED".equals(c.operator()) && c.isBlocking());
        String commentBody = body != null && body.get("comment") != null ? body.get("comment").toString().trim() : "";
        if (hasCommentRequired && commentBody.isEmpty()) {
            throw ApiException.unprocessable("이 전이는 코멘트가 필요합니다.");
        }
        if (!eval.allowed()) {
            throw ApiException.unprocessable("전이 조건을 충족하지 않았습니다.");
        }

        jdbc.update("UPDATE " + cfg.table() + " SET status = ? WHERE " + cfg.idCol() + " = ?", toStatus, id);

        // 0033 ⑥ — 담당 항목 반려 전이만 알림(v1 — 승인·완료는 소음 방지 차원에서 제외)
        if ("REJECTED".equalsIgnoreCase(toStatus) || "반려".equals(toStatus)) {
            String assigneeCol = "DELIVERABLE".equals(cfg.entityType()) ? "author_name" : "assignee_name";
            Object assignee = ent.get(assigneeCol);
            Object title = ent.get("DELIVERABLE".equals(cfg.entityType()) ? "deliverable_name" : "task_name");
            if (assignee != null) {
                notify.notifyByName(toLong(ent.get("project_id")), assignee.toString(), "STATUS_CHANGED",
                        cfg.entityType(), id, "반려되었습니다: " + (title == null ? cfg.entityType() : title));
            }
        }

        jdbc.update(
                "INSERT INTO pms_audit_log (entity_type, entity_id, project_id, action, changed_fields, "
              + "`before`, `after`, changed_by_uid, reason) VALUES (?, ?, ?, 'UPDATE', ?, ?, ?, ?, ?)",
                cfg.entityType(), id, ent.get("project_id"),
                com.aetherpms.common.Json.write(List.of("status")),
                com.aetherpms.common.Json.write(Map.of("status", fromStatus)),
                com.aetherpms.common.Json.write(Map.of("status", toStatus)),
                actor.userId(),
                "워크플로 전이: " + (transition.get("name") != null ? transition.get("name") : transitionId));

        if (!commentBody.isEmpty()) {
            jdbc.update(
                    "INSERT INTO pms_comment (entity_type, entity_id, project_id, body, comment_type, "
                  + "status_from, status_to, author_uid, author_name, created_at) "
                  + "VALUES (?, ?, ?, ?, 'STATUS_CHANGE', ?, ?, ?, ?, CURRENT_TIMESTAMP(6))",
                    cfg.entityType(), id, ent.get("project_id"), commentBody,
                    fromStatus, toStatus, actor.userId(), null);
        }

        Map<String, Object> res = new LinkedHashMap<>();
        res.put("status", toStatus);
        if (!eval.warnings().isEmpty()) {
            List<String> warnings = new ArrayList<>();
            for (ConditionEngine.FailedCondition w : eval.warnings()) warnings.add(w.errorMessage());
            res.put("warnings", warnings);
        }
        return res;
    }

    private static long toLong(Object o) { return o == null ? 0 : ((Number) o).longValue(); }
    private static String str(Object o) { return o == null ? null : o.toString(); }
}
