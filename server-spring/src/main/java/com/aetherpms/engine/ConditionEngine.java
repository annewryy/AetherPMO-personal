package com.aetherpms.engine;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;

import com.aetherpms.common.Json;

/**
 * 전이 조건 룰 엔진 — Node engine/evaluate.ts 이식(전략 패턴 레지스트리).
 * 각 조건 = (subject_scope.left_field) operator (params). 한 전이의 조건은 전부 AND.
 * is_blocking=false는 실패해도 통과(warning). 평가 불능은 fail-closed(false).
 */
public final class ConditionEngine {

    private ConditionEngine() {}

    /** 조건 빌더 허용 operator — 레지스트리 단일 원천(workflows-admin 검증이 참조). */
    public static final List<String> OPERATORS = List.of(
            "GTE", "EXISTS", "CHANGED_SINCE", "ROLE_IN", "ALL_CHILDREN_IN", "COMMENT_REQUIRED");

    /** subject_scope vocabulary. */
    public static final List<String> SCOPES = List.of("SELF", "TASK", "PROJECT", "ACTION_ITEM", "ISSUE", "ACTOR");

    public record EvalCtx(JdbcTemplate db, String entityType, long entityId,
                          Map<String, Object> entity, long projectId, String actorUid) {}

    public record ConditionRow(long conditionId, String subjectScope, String leftField,
                               String operator, Map<String, Object> params,
                               String errorMessage, boolean isBlocking, int sortOrder) {}

    public record FailedCondition(long conditionId, String errorMessage) {}

    public record EvaluationResult(boolean allowed, List<FailedCondition> failedConditions,
                                   List<FailedCondition> warnings) {}

    // ---- scope 해석 --------------------------------------------------------

    private static Map<String, Object> resolveScopeRow(String scope, EvalCtx ctx) {
        switch (scope) {
            case "SELF": return ctx.entity();
            case "TASK": {
                if ("TASK".equals(ctx.entityType())) return ctx.entity();
                Object taskId = ctx.entity().get("task_id");
                if (taskId == null) return null;
                List<Map<String, Object>> rows = ctx.db().queryForList(
                        "SELECT * FROM pms_task WHERE task_id = ?", taskId);
                return rows.isEmpty() ? null : rows.get(0);
            }
            case "PROJECT": {
                List<Map<String, Object>> rows = ctx.db().queryForList(
                        "SELECT * FROM pms_project WHERE project_id = ?", ctx.projectId());
                return rows.isEmpty() ? null : rows.get(0);
            }
            default: return null;
        }
    }

    private static Object resolveLeftValue(String scope, String field, EvalCtx ctx) {
        Map<String, Object> row = resolveScopeRow(scope, ctx);
        if (row == null || field == null) return null;
        if ("version_count".equals(field)) {
            Object deliverableId = row.get("deliverable_id");
            if (deliverableId == null) return null;
            Integer cnt = ctx.db().queryForObject(
                    "SELECT COUNT(*) FROM pms_deliverable_version WHERE deliverable_id = ?",
                    Integer.class, deliverableId);
            return cnt == null ? 0 : cnt;
        }
        return row.get(field);
    }

    // ---- operator 구현 -----------------------------------------------------

    private static boolean gte(String scope, String field, Map<String, Object> params, EvalCtx ctx) {
        Object left = resolveLeftValue(scope, field, ctx);
        if (left == null) return false;
        try {
            double l = num(left), r = num(params.get("value"));
            return l >= r;
        } catch (NumberFormatException e) {
            return false;
        }
    }

    private static boolean exists(String scope, String field, Map<String, Object> params, EvalCtx ctx) {
        Object left = resolveLeftValue(scope, field, ctx);
        if (left == null) return false;
        if (left instanceof String s) return !s.trim().isEmpty();
        if (left instanceof List<?> l) return !l.isEmpty();
        return true;
    }

    private static boolean changedSince(String scope, Map<String, Object> params, EvalCtx ctx) {
        Map<String, Object> row = resolveScopeRow(scope, ctx);
        Object deliverableId = row == null ? null : row.get("deliverable_id");
        if (deliverableId == null) return false;
        Object sinceStatus = params.get("since_status");
        if (sinceStatus == null) return false;
        List<java.sql.Timestamp> entered = ctx.db().query(
                "SELECT MAX(changed_at) AS entered_at FROM pms_audit_log "
              + "WHERE entity_type = 'DELIVERABLE' AND entity_id = ? "
              + "AND JSON_UNQUOTE(JSON_EXTRACT(`after`, '$.status')) = ?",
                (rs, i) -> rs.getTimestamp("entered_at"), deliverableId, sinceStatus.toString());
        if (entered.isEmpty() || entered.get(0) == null) return false;
        Integer cnt = ctx.db().queryForObject(
                "SELECT COUNT(*) FROM pms_deliverable_version WHERE deliverable_id = ? AND created_at > ?",
                Integer.class, deliverableId, entered.get(0));
        return cnt != null && cnt > 0;
    }

    private static boolean roleIn(Map<String, Object> params, EvalCtx ctx) {
        if (ctx.actorUid() == null) return false;
        List<String> roles = asStringList(params.get("roles"));
        if (roles.isEmpty()) return false;
        List<String> found = ctx.db().query(
                "SELECT role_name FROM pms_project_member "
              + "WHERE project_id = ? AND user_uid = ? AND COALESCE(is_active, 1)",
                (rs, i) -> rs.getString("role_name"), ctx.projectId(), ctx.actorUid());
        return found.stream().anyMatch(r -> r != null && roles.contains(r));
    }

    private static boolean allChildrenIn(String scope, Map<String, Object> params, EvalCtx ctx) {
        Map<String, Object> row = resolveScopeRow(scope, ctx);
        Object taskId = row == null ? null : row.get("task_id");
        if (taskId == null) return false;
        List<String> statuses = asStringList(params.get("statuses"));
        if (statuses.isEmpty()) return false;
        List<String> childStatuses = ctx.db().query(
                "SELECT status FROM pms_deliverable WHERE task_id = ?",
                (rs, i) -> rs.getString("status"), taskId);
        return childStatuses.stream().allMatch(statuses::contains);
    }

    /** 한 전이의 조건 전부(AND)를 평가. */
    public static EvaluationResult evaluate(List<ConditionRow> conditions, EvalCtx ctx) {
        List<FailedCondition> failed = new ArrayList<>();
        List<FailedCondition> warnings = new ArrayList<>();
        List<ConditionRow> sorted = new ArrayList<>(conditions);
        sorted.sort((a, b) -> Integer.compare(a.sortOrder(), b.sortOrder()));

        for (ConditionRow c : sorted) {
            boolean ok;
            Map<String, Object> params = c.params() == null ? Map.of() : c.params();
            try {
                ok = switch (c.operator()) {
                    case "GTE" -> gte(c.subjectScope(), c.leftField(), params, ctx);
                    case "EXISTS" -> exists(c.subjectScope(), c.leftField(), params, ctx);
                    case "CHANGED_SINCE" -> changedSince(c.subjectScope(), params, ctx);
                    case "ROLE_IN" -> roleIn(params, ctx);
                    case "ALL_CHILDREN_IN" -> allChildrenIn(c.subjectScope(), params, ctx);
                    case "COMMENT_REQUIRED" -> true; // 실제 검증은 호출부(전이 실행)
                    default -> false; // 미지 operator → fail-closed
                };
            } catch (Exception e) {
                ok = false; // 평가 중 예외 → fail-closed
            }
            if (!ok) {
                FailedCondition item = new FailedCondition(c.conditionId(),
                        c.errorMessage() != null ? c.errorMessage()
                                : "전이 조건(" + c.operator() + ")을 충족하지 않았습니다.");
                if (c.isBlocking()) failed.add(item); else warnings.add(item);
            }
        }
        return new EvaluationResult(failed.isEmpty(), failed, warnings);
    }

    /** transition_id의 조건 로드(정렬). params/is_blocking은 DB에서 파싱. */
    public static List<ConditionRow> loadConditions(JdbcTemplate db, long transitionId) {
        return db.query(
                "SELECT condition_id, subject_scope, left_field, operator, params, "
              + "error_message, is_blocking, sort_order FROM pms_workflow_transition_condition "
              + "WHERE transition_id = ? ORDER BY sort_order, condition_id",
                (rs, i) -> {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> params = (Map<String, Object>) Json.readObject(rs.getString("params"));
                    return new ConditionRow(
                            rs.getLong("condition_id"), rs.getString("subject_scope"),
                            rs.getString("left_field"), rs.getString("operator"), params,
                            rs.getString("error_message"), rs.getBoolean("is_blocking"),
                            rs.getObject("sort_order") == null ? 0 : rs.getInt("sort_order"));
                }, transitionId);
    }

    private static double num(Object o) {
        if (o == null) return Double.NaN;
        if (o instanceof Number n) return n.doubleValue();
        return Double.parseDouble(o.toString());
    }

    @SuppressWarnings("unchecked")
    private static List<String> asStringList(Object o) {
        if (!(o instanceof List)) return List.of();
        List<String> out = new ArrayList<>();
        for (Object e : (List<Object>) o) out.add(String.valueOf(e));
        return out;
    }
}
