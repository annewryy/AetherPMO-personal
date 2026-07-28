package com.aetherpms.engine;

import com.aetherpms.common.RowMappers;

import com.aetherpms.common.WriteSupport;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.aetherpms.common.Actor;
import com.aetherpms.common.ApiException;
import com.aetherpms.common.AuditWriter;
import com.aetherpms.engine.ConditionEngine;

/**
 * 0009 모듈3 — 워크플로 편집기. Node routes/workflows-admin.ts 이식.
 *   워크플로/상태/전이/조건 CRUD + is_initial 불변식 + 참조 가드(409).
 */
@Service
public class WorkflowAdminService {

    private final JdbcTemplate jdbc;
    private final AuditWriter audit;

    public WorkflowAdminService(JdbcTemplate jdbc, AuditWriter audit) {
        this.jdbc = jdbc;
        this.audit = audit;
    }

    private static final Set<String> WORKFLOW_FIELDS = Set.of("name", "description", "is_default");
    private static final Map<String, String> WORKFLOW_ALIASES = Map.of("isDefault", "is_default");

    private static final List<String> STATUS_CATEGORIES = List.of("TODO", "IN_PROGRESS", "DONE");
    private static final Set<String> STATUS_FIELDS = Set.of("code", "name", "color", "category",
            "is_initial", "is_final", "sort_order", "progress_weight");
    private static final Map<String, String> STATUS_ALIASES = Map.of(
            "isInitial", "is_initial", "isFinal", "is_final", "sortOrder", "sort_order",
            "progressWeight", "progress_weight");

    private static final Set<String> CONDITION_FIELDS = Set.of("subject_scope", "left_field", "operator",
            "params", "error_message", "is_blocking", "sort_order", "logic_op");
    private static final Map<String, String> CONDITION_ALIASES = Map.of(
            "subjectScope", "subject_scope", "leftField", "left_field", "errorMessage", "error_message",
            "isBlocking", "is_blocking", "sortOrder", "sort_order", "logicOp", "logic_op");

    // =====================================================================
    // 워크플로
    // =====================================================================

    @Transactional
    public Map<String, Object> createWorkflow(Map<String, Object> body, Actor actor) {
        Map<String, Object> normalized = validateWorkflowPayload(body, true);
        Map<String, Object> wf = WriteSupport.insertReturning(jdbc, "pms_workflow", "workflow_id", normalized);
        audit.write("WORKFLOW", toLong(wf.get("workflow_id")), null, "INSERT", null, null, wf,
                actor, "워크플로 생성 (워크플로 편집기)");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", toLong(wf.get("workflow_id")));
        out.put("name", wf.get("name"));
        out.put("description", wf.get("description"));
        out.put("isDefault", RowMappers.boolOrNull(wf.get("is_default")));
        out.put("statuses", new ArrayList<>());
        out.put("transitions", new ArrayList<>());
        return out;
    }

    @Transactional
    public Map<String, Object> updateWorkflow(long id, Map<String, Object> body, Actor actor) {
        WriteSupport.parseId(id);
        Map<String, Object> normalized = validateWorkflowPayload(body, false);
        Map<String, Object> before = fetchWorkflow(id);
        List<String> cols = List.copyOf(normalized.keySet());
        Map<String, Object> after = WriteSupport.updateReturning(jdbc, "pms_workflow", "workflow_id", id, normalized, true);
        audit.write("WORKFLOW", id, null, "UPDATE", cols,
                WriteSupport.pick(before, cols), WriteSupport.pick(after, cols), actor, "워크플로 수정 (워크플로 편집기)");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", toLong(after.get("workflow_id")));
        out.put("name", after.get("name"));
        out.put("description", after.get("description"));
        out.put("isDefault", RowMappers.boolOrNull(after.get("is_default")));
        return out;
    }

    @Transactional
    public Map<String, Object> deleteWorkflow(long id, Actor actor) {
        WriteSupport.parseId(id);
        Map<String, Object> wf = fetchWorkflow(id);
        int catalogNodes = count("SELECT COUNT(*) FROM pms_catalog_node WHERE workflow_id = ?", id);
        if (catalogNodes > 0) {
            throw ApiException.conflict("카탈로그 노드 " + catalogNodes
                    + "개가 이 워크플로를 참조하고 있어 삭제할 수 없습니다. 카탈로그 관리에서 연결을 해제한 뒤 다시 시도하세요.");
        }
        jdbc.update("DELETE FROM pms_workflow WHERE workflow_id = ?", id);
        audit.write("WORKFLOW", id, null, "DELETE", null, wf, null, actor, "워크플로 삭제 (워크플로 편집기, 카탈로그 참조 0건)");
        return Map.of("deleted", true, "id", id);
    }

    private Map<String, Object> validateWorkflowPayload(Map<String, Object> raw, boolean requireAll) {
        Map<String, Object> body = WriteSupport.applyAliases(raw, WORKFLOW_ALIASES);
        if (body.isEmpty()) throw ApiException.badRequest("수정할 필드가 없습니다.");
        List<String> rejected = body.keySet().stream().filter(k -> !WORKFLOW_FIELDS.contains(k)).toList();
        if (!rejected.isEmpty()) throw ApiException.badRequest("허용되지 않는 필드: " + String.join(", ", rejected));

        Map<String, Object> out = new LinkedHashMap<>();
        if (body.containsKey("name")) {
            requireNonBlank(body.get("name"), "name은 비어있지 않은 문자열이어야 합니다.");
            out.put("name", body.get("name").toString().trim());
        } else if (requireAll) {
            throw ApiException.badRequest("name은 필수입니다.");
        }
        if (body.containsKey("description")) {
            out.put("description", body.get("description") == null ? null : str(body.get("description")));
        }
        if (body.containsKey("is_default")) {
            if (!(body.get("is_default") instanceof Boolean bv)) throw ApiException.badRequest("isDefault는 boolean이어야 합니다.");
            out.put("is_default", bv);
        }
        return out;
    }

    // =====================================================================
    // 상태
    // =====================================================================

    @Transactional
    public Map<String, Object> createStatus(long workflowId, Map<String, Object> body, Actor actor) {
        WriteSupport.parseId(workflowId);
        Map<String, Object> normalized = validateStatusPayload(body, true);
        fetchWorkflow(workflowId);
        boolean isFirst = count("SELECT COUNT(*) FROM pms_workflow_status WHERE workflow_id = ?", workflowId) == 0;

        if (isFirst && !Boolean.TRUE.equals(normalized.get("is_initial"))) {
            throw ApiException.badRequest("워크플로의 첫 상태는 초기 상태(isInitial=true)여야 합니다.");
        }
        if (Boolean.TRUE.equals(normalized.get("is_initial")) && !isFirst) {
            demoteCurrentInitial(workflowId, null, actor);
        }
        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("workflow_id", workflowId);
        fields.putAll(normalized);
        Map<String, Object> status = WriteSupport.insertReturning(jdbc, "pms_workflow_status", "status_id", fields);
        audit.write("WORKFLOW_STATUS", toLong(status.get("status_id")), null, "INSERT", null, null, status,
                actor, "워크플로 상태 추가 (워크플로 편집기)");
        return RowMappers.mapWorkflowStatus(status);
    }

    @Transactional
    public Map<String, Object> updateStatus(long workflowId, long statusId, Map<String, Object> body, Actor actor) {
        WriteSupport.parseId(workflowId);
        WriteSupport.parseId(statusId);
        Map<String, Object> normalized = validateStatusPayload(body, false);
        fetchWorkflow(workflowId);
        Map<String, Object> before = fetchStatusInWorkflow(workflowId, statusId);

        if (Boolean.TRUE.equals(normalized.get("is_initial")) && !RowMappers.bool(before.get("is_initial"))) {
            demoteCurrentInitial(workflowId, statusId, actor);
        }
        if (Boolean.FALSE.equals(normalized.get("is_initial")) && RowMappers.bool(before.get("is_initial"))) {
            throw ApiException.badRequest(
                    "초기 상태 해제는 불가합니다 — 다른 상태를 초기(isInitial=true)로 지정하면 자동 해제됩니다.");
        }
        List<String> cols = List.copyOf(normalized.keySet());
        Map<String, Object> after = WriteSupport.updateReturning(jdbc, "pms_workflow_status", "status_id", statusId, normalized, true);
        audit.write("WORKFLOW_STATUS", statusId, null, "UPDATE", cols,
                WriteSupport.pick(before, cols), WriteSupport.pick(after, cols), actor, "워크플로 상태 수정 (워크플로 편집기)");
        return RowMappers.mapWorkflowStatus(after);
    }

    @Transactional
    public Map<String, Object> deleteStatus(long workflowId, long statusId, Actor actor) {
        WriteSupport.parseId(workflowId);
        WriteSupport.parseId(statusId);
        fetchWorkflow(workflowId);
        Map<String, Object> status = fetchStatusInWorkflow(workflowId, statusId);

        int[] refs = statusRefs(statusId);
        int transitions = refs[0], tasks = refs[1], deliverables = refs[2];
        if (transitions + tasks + deliverables > 0) {
            throw ApiException.conflict("참조 중인 상태는 삭제할 수 없습니다 (전이 " + transitions + " · 태스크 " + tasks
                    + " · 산출물 " + deliverables + "). 전이와 해당 상태의 엔티티를 먼저 정리하세요.");
        }
        if (RowMappers.bool(status.get("is_initial"))) {
            int others = count("SELECT COUNT(*) FROM pms_workflow_status WHERE workflow_id = ? AND status_id <> ?",
                    workflowId, statusId);
            if (others > 0) {
                throw ApiException.badRequest("초기 상태는 삭제할 수 없습니다 — 다른 상태를 초기로 지정한 뒤 삭제하세요.");
            }
        }
        jdbc.update("DELETE FROM pms_workflow_status WHERE status_id = ?", statusId);
        audit.write("WORKFLOW_STATUS", statusId, null, "DELETE", null, status, null,
                actor, "워크플로 상태 삭제 (워크플로 편집기, 참조 0건)");
        return Map.of("deleted", true, "id", statusId);
    }

    private Map<String, Object> validateStatusPayload(Map<String, Object> raw, boolean requireAll) {
        Map<String, Object> body = WriteSupport.applyAliases(raw, STATUS_ALIASES);
        if (body.isEmpty()) throw ApiException.badRequest("수정할 필드가 없습니다.");
        List<String> rejected = body.keySet().stream().filter(k -> !STATUS_FIELDS.contains(k)).toList();
        if (!rejected.isEmpty()) throw ApiException.badRequest("허용되지 않는 필드: " + String.join(", ", rejected));

        Map<String, Object> out = new LinkedHashMap<>();
        if (body.containsKey("name")) {
            requireNonBlank(body.get("name"), "name은 비어있지 않은 문자열이어야 합니다.");
            out.put("name", body.get("name").toString().trim());
        } else if (requireAll) {
            throw ApiException.badRequest("name은 필수입니다.");
        }
        for (String k : List.of("code", "color")) {
            if (body.containsKey(k)) out.put(k, body.get(k) == null ? null : str(body.get(k)));
        }
        if (body.containsKey("category")) {
            if (body.get("category") == null) {
                out.put("category", null);
            } else if (!STATUS_CATEGORIES.contains(str(body.get("category")))) {
                throw ApiException.badRequest("유효하지 않은 category: " + body.get("category")
                        + " (허용: " + String.join(", ", STATUS_CATEGORIES) + ")");
            } else {
                out.put("category", body.get("category"));
            }
        }
        for (String k : List.of("is_initial", "is_final")) {
            if (!body.containsKey(k)) continue;
            if (!(body.get(k) instanceof Boolean bv)) throw ApiException.badRequest(k + "는 boolean이어야 합니다.");
            out.put(k, bv);
        }
        if (body.containsKey("sort_order")) {
            Integer n = WriteSupport.intOrNull(body.get("sort_order"));
            if (n == null) throw ApiException.badRequest("sortOrder는 정수여야 합니다.");
            out.put("sort_order", n);
        }
        // 0039 — 상태별 진척률(%) 0~100. 산출물 기반 태스크 진척 산정에 쓰인다.
        if (body.containsKey("progress_weight")) {
            if (body.get("progress_weight") == null) {
                out.put("progress_weight", null);
            } else {
                Integer n = WriteSupport.intOrNull(body.get("progress_weight"));
                if (n == null || n < 0 || n > 100) {
                    throw ApiException.badRequest("progressWeight는 0~100 정수여야 합니다.");
                }
                out.put("progress_weight", n);
            }
        }
        return out;
    }

    private void demoteCurrentInitial(long workflowId, Long keepStatusId, Actor actor) {
        List<Map<String, Object>> rows = keepStatusId != null
                ? jdbc.queryForList("SELECT status_id, name FROM pms_workflow_status "
                        + "WHERE workflow_id = ? AND is_initial = 1 AND status_id <> ?", workflowId, keepStatusId)
                : jdbc.queryForList("SELECT status_id, name FROM pms_workflow_status "
                        + "WHERE workflow_id = ? AND is_initial = 1", workflowId);
        if (rows.isEmpty()) return;
        if (keepStatusId != null) {
            jdbc.update("UPDATE pms_workflow_status SET is_initial = 0 "
                    + "WHERE workflow_id = ? AND is_initial = 1 AND status_id <> ?", workflowId, keepStatusId);
        } else {
            jdbc.update("UPDATE pms_workflow_status SET is_initial = 0 "
                    + "WHERE workflow_id = ? AND is_initial = 1", workflowId);
        }
        for (Map<String, Object> r : rows) {
            audit.write("WORKFLOW_STATUS", toLong(r.get("status_id")), null, "UPDATE",
                    List.of("is_initial"), Map.of("is_initial", true), Map.of("is_initial", false),
                    actor, "초기 상태 이관 — 다른 상태가 초기로 지정됨 (워크플로 편집기)");
        }
    }

    /** [transitions, tasks, deliverables] — Node STATUS_REFS_SQL MariaDB 이식. */
    private int[] statusRefs(long statusId) {
        Map<String, Object> target = jdbc.queryForMap(
                "SELECT workflow_id, code FROM pms_workflow_status WHERE status_id = ?", statusId);
        Long workflowId = toLong(target.get("workflow_id"));
        String code = str(target.get("code"));

        int transitions = count("SELECT COUNT(*) FROM pms_workflow_transition "
                + "WHERE from_status_id = ? OR to_status_id = ?", statusId, statusId);
        if (code == null) return new int[]{transitions, 0, 0};

        Long fallbackWf = null;
        List<Map<String, Object>> fb = jdbc.queryForList(
                "SELECT ws.workflow_id FROM pms_workflow_status ws "
              + "JOIN pms_workflow w ON w.workflow_id = ws.workflow_id "
              + "WHERE ws.code = ? ORDER BY w.is_default DESC, w.workflow_id LIMIT 1", code);
        if (!fb.isEmpty()) fallbackWf = toLong(fb.get(0).get("workflow_id"));

        int tasks = count(
                "SELECT COUNT(*) FROM pms_task k LEFT JOIN pms_catalog_node n ON n.node_id = k.catalog_node_id "
              + "WHERE k.status = ? AND COALESCE(n.workflow_id, ?) = ?", code, fallbackWf, workflowId);
        int deliverables = count(
                "SELECT COUNT(*) FROM pms_deliverable d LEFT JOIN pms_catalog_node n ON n.node_id = d.catalog_node_id "
              + "WHERE d.status = ? AND COALESCE(n.workflow_id, ?) = ?", code, fallbackWf, workflowId);
        return new int[]{transitions, tasks, deliverables};
    }

    // =====================================================================
    // 전이
    // =====================================================================

    @Transactional
    public Map<String, Object> createTransition(long workflowId, Map<String, Object> body, Actor actor) {
        WriteSupport.parseId(workflowId);
        Map<String, Object> b = WriteSupport.applyAliases(body, Map.of(
                "fromStatusId", "from_status_id", "toStatusId", "to_status_id"));
        Integer fromId = WriteSupport.intOrNull(b.get("from_status_id"));
        Integer toId = WriteSupport.intOrNull(b.get("to_status_id"));
        if (fromId == null || fromId <= 0 || toId == null || toId <= 0) {
            throw ApiException.badRequest("fromStatusId·toStatusId는 양의 정수여야 합니다.");
        }
        if (fromId.equals(toId)) throw ApiException.badRequest("시작 상태와 도착 상태는 달라야 합니다 (from≠to).");
        String name = b.get("name") == null ? null : str(b.get("name"));

        fetchWorkflow(workflowId);
        fetchStatusInWorkflow(workflowId, fromId);
        fetchStatusInWorkflow(workflowId, toId);

        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("workflow_id", workflowId);
        fields.put("from_status_id", fromId);
        fields.put("to_status_id", toId);
        fields.put("name", name);
        Map<String, Object> tr = WriteSupport.insertReturning(jdbc, "pms_workflow_transition", "transition_id", fields);
        audit.write("WORKFLOW_TRANSITION", toLong(tr.get("transition_id")), null, "INSERT", null, null, tr,
                actor, "워크플로 전이 추가 (워크플로 편집기)");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", toLong(tr.get("transition_id")));
        out.put("workflowId", toLong(tr.get("workflow_id")));
        out.put("fromStatusId", toLong(tr.get("from_status_id")));
        out.put("toStatusId", toLong(tr.get("to_status_id")));
        out.put("name", tr.get("name"));
        out.put("conditions", new ArrayList<>());
        return out;
    }

    @Transactional
    public Map<String, Object> deleteTransition(long workflowId, long transitionId, Actor actor) {
        WriteSupport.parseId(workflowId);
        WriteSupport.parseId(transitionId);
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT * FROM pms_workflow_transition WHERE transition_id = ? AND workflow_id = ?",
                transitionId, workflowId);
        if (rows.isEmpty()) throw ApiException.notFound("해당 워크플로에서 전이를 찾을 수 없습니다.");
        Map<String, Object> tr = rows.get(0);
        int condCnt = count("SELECT COUNT(*) FROM pms_workflow_transition_condition WHERE transition_id = ?", transitionId);
        jdbc.update("DELETE FROM pms_workflow_transition WHERE transition_id = ?", transitionId);
        audit.write("WORKFLOW_TRANSITION", transitionId, null, "DELETE", null, tr, null,
                actor, "워크플로 전이 삭제 (워크플로 편집기, 조건 " + condCnt + "건 cascade)");
        return Map.of("deleted", true, "id", transitionId);
    }

    // =====================================================================
    // 조건
    // =====================================================================

    @Transactional
    public Map<String, Object> createCondition(long transitionId, Map<String, Object> body, Actor actor) {
        WriteSupport.parseId(transitionId);
        Map<String, Object> normalized = validateConditionPayload(body, true);
        fetchTransition(transitionId);

        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("transition_id", transitionId);
        for (Map.Entry<String, Object> e : normalized.entrySet()) {
            if ("logic_op".equals(e.getKey())) continue;
            fields.put(e.getKey(), e.getValue());
        }
        Map<String, Object> cond = WriteSupport.insertReturning(jdbc, "pms_workflow_transition_condition", "condition_id", fields);
        audit.write("TRANSITION_CONDITION", toLong(cond.get("condition_id")), null, "INSERT", null, null, cond,
                actor, "전이 조건 추가 (조건 빌더)");
        return RowMappers.mapTransitionCondition(cond);
    }

    @Transactional
    public Map<String, Object> updateCondition(long transitionId, long conditionId, Map<String, Object> body, Actor actor) {
        WriteSupport.parseId(transitionId);
        WriteSupport.parseId(conditionId);
        Map<String, Object> normalized = validateConditionPayload(body, false);
        normalized.remove("logic_op");
        if (normalized.isEmpty()) throw ApiException.badRequest("수정할 필드가 없습니다.");

        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT * FROM pms_workflow_transition_condition WHERE condition_id = ? AND transition_id = ?",
                conditionId, transitionId);
        if (rows.isEmpty()) throw ApiException.notFound("해당 전이에서 조건을 찾을 수 없습니다.");
        Map<String, Object> before = rows.get(0);

        List<String> cols = List.copyOf(normalized.keySet());
        Map<String, Object> after = WriteSupport.updateReturning(jdbc, "pms_workflow_transition_condition",
                "condition_id", conditionId, normalized, false);
        audit.write("TRANSITION_CONDITION", conditionId, null, "UPDATE", cols,
                WriteSupport.pick(before, cols), WriteSupport.pick(after, cols), actor, "전이 조건 수정 (조건 빌더)");
        return RowMappers.mapTransitionCondition(after);
    }

    @Transactional
    public Map<String, Object> deleteCondition(long transitionId, long conditionId, Actor actor) {
        WriteSupport.parseId(transitionId);
        WriteSupport.parseId(conditionId);
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT * FROM pms_workflow_transition_condition WHERE condition_id = ? AND transition_id = ?",
                conditionId, transitionId);
        if (rows.isEmpty()) throw ApiException.notFound("해당 전이에서 조건을 찾을 수 없습니다.");
        Map<String, Object> deleted = rows.get(0);
        jdbc.update("DELETE FROM pms_workflow_transition_condition WHERE condition_id = ?", conditionId);
        audit.write("TRANSITION_CONDITION", conditionId, null, "DELETE", null, deleted, null,
                actor, "전이 조건 삭제 (조건 빌더)");
        return Map.of("deleted", true, "id", conditionId);
    }

    private Map<String, Object> validateConditionPayload(Map<String, Object> raw, boolean requireAll) {
        Map<String, Object> body = WriteSupport.applyAliases(raw, CONDITION_ALIASES);
        if (body.isEmpty()) throw ApiException.badRequest("수정할 필드가 없습니다.");
        List<String> rejected = body.keySet().stream().filter(k -> !CONDITION_FIELDS.contains(k)).toList();
        if (!rejected.isEmpty()) throw ApiException.badRequest("허용되지 않는 필드: " + String.join(", ", rejected));

        Map<String, Object> out = new LinkedHashMap<>();
        if (body.containsKey("operator")) {
            if (!ConditionEngine.OPERATORS.contains(str(body.get("operator")))) {
                throw ApiException.badRequest("유효하지 않은 operator: " + body.get("operator")
                        + " (허용: " + String.join(", ", ConditionEngine.OPERATORS) + ")");
            }
            out.put("operator", body.get("operator"));
        } else if (requireAll) {
            throw ApiException.badRequest("operator는 필수입니다. (허용: " + String.join(", ", ConditionEngine.OPERATORS) + ")");
        }
        if (body.containsKey("subject_scope")) {
            if (!ConditionEngine.SCOPES.contains(str(body.get("subject_scope")))) {
                throw ApiException.badRequest("유효하지 않은 subjectScope: " + body.get("subject_scope")
                        + " (허용: " + String.join(", ", ConditionEngine.SCOPES) + ")");
            }
            out.put("subject_scope", body.get("subject_scope"));
        }
        if (body.containsKey("logic_op") && !"AND".equals(body.get("logic_op"))) {
            throw ApiException.badRequest("v1 조건은 AND만 지원합니다 (그룹/OR는 추후 확장).");
        }
        if (body.containsKey("left_field")) {
            out.put("left_field", body.get("left_field") == null ? null : str(body.get("left_field")));
        }
        if (body.containsKey("error_message")) {
            out.put("error_message", body.get("error_message") == null ? null : str(body.get("error_message")));
        }
        if (body.containsKey("params")) {
            if (!(body.get("params") instanceof Map)) throw ApiException.badRequest("params는 JSON 객체여야 합니다.");
            out.put("params", com.aetherpms.common.Json.write(body.get("params")));
        }
        if (body.containsKey("is_blocking")) {
            if (!(body.get("is_blocking") instanceof Boolean bv)) throw ApiException.badRequest("isBlocking은 boolean이어야 합니다.");
            out.put("is_blocking", bv);
        }
        if (body.containsKey("sort_order")) {
            Integer n = WriteSupport.intOrNull(body.get("sort_order"));
            if (n == null) throw ApiException.badRequest("sortOrder는 정수여야 합니다.");
            out.put("sort_order", n);
        }
        return out;
    }

    // ---- 공용 조회 --------------------------------------------------------

    private Map<String, Object> fetchWorkflow(long id) {
        Map<String, Object> wf = WriteSupport.findOne(jdbc, "pms_workflow", "workflow_id", id);
        if (wf == null) throw ApiException.notFound("워크플로를 찾을 수 없습니다.");
        return wf;
    }

    private Map<String, Object> fetchStatusInWorkflow(long workflowId, long statusId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT * FROM pms_workflow_status WHERE status_id = ? AND workflow_id = ?", statusId, workflowId);
        if (rows.isEmpty()) throw ApiException.notFound("해당 워크플로에서 상태를 찾을 수 없습니다.");
        return rows.get(0);
    }

    private void fetchTransition(long transitionId) {
        if (WriteSupport.findOne(jdbc, "pms_workflow_transition", "transition_id", transitionId) == null) {
            throw ApiException.notFound("전이를 찾을 수 없습니다.");
        }
    }

    private int count(String sql, Object... args) {
        Integer c = jdbc.queryForObject(sql, Integer.class, args);
        return c == null ? 0 : c;
    }

    private static void requireNonBlank(Object v, String msg) {
        if (!(v instanceof String s) || s.trim().isEmpty()) throw ApiException.badRequest(msg);
    }

    private static Long toLong(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return n.longValue();
        return Long.parseLong(o.toString());
    }

    private static String str(Object o) { return o == null ? null : o.toString(); }
}
