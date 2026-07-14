package com.aetherpms.common;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Map;

import com.aetherpms.common.Json;

/**
 * pms_* row(JdbcTemplate SELECT * → Map, snake_case) → 도메인 모델(camelCase).
 * Node mappers.ts 를 row 기반으로 1:1 이식(쓰기 응답 전용 — 읽기는 JPA 엔티티 매퍼 사용).
 * 프론트 web/src/types.ts 와 필드 일치.
 */
public final class RowMappers {

    private RowMappers() {}

    // ---- 값 헬퍼 (Node num()/dateStr() 재현) --------------------------------

    static Object v(Map<String, Object> r, String k) { return r.get(k); }

    static Long asLong(Object o) {
        if (o == null) return null;
        return ((Number) o).longValue();
    }

    static Integer asInt(Object o) {
        if (o == null) return null;
        return ((Number) o).intValue();
    }

    /** num(v): Number(v||0). null → 0. */
    static double num(Object o) {
        if (o == null) return 0;
        return ((Number) o).doubleValue();
    }

    /** dateStr(v): null/빈 → null, 아니면 yyyy-MM-dd. */
    static String dateStr(Object o) {
        if (o == null) return null;
        if (o instanceof LocalDate d) return d.toString();
        if (o instanceof java.sql.Date d) return d.toLocalDate().toString();
        if (o instanceof LocalDateTime dt) return dt.toLocalDate().toString();
        if (o instanceof java.sql.Timestamp ts) return ts.toLocalDateTime().toLocalDate().toString();
        String s = o.toString();
        return s.length() >= 10 ? s.substring(0, 10) : s;
    }

    /** ISO-8601 UTC (Node Date.toISOString()). */
    static String iso(Object o) {
        LocalDateTime dt = toDateTime(o);
        if (dt == null) return null;
        return dt.atOffset(ZoneOffset.UTC).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
    }

    static LocalDateTime toDateTime(Object o) {
        if (o == null) return null;
        if (o instanceof LocalDateTime dt) return dt;
        if (o instanceof java.sql.Timestamp ts) return ts.toLocalDateTime();
        return null;
    }

    public static boolean bool(Object o) {
        if (o == null) return false;
        if (o instanceof Boolean b) return b;
        if (o instanceof Number n) return n.intValue() != 0;
        return Boolean.parseBoolean(o.toString());
    }

    /** is_active !== false — 컬럼 null(미적용 DB)이면 활성. */
    static boolean activeDefault(Object o) {
        return o == null || bool(o);
    }

    // ---- 매퍼 ------------------------------------------------------------

    public static Map<String, Object> mapIssue(Map<String, Object> i) {
        Map<String, Object> o = new LinkedHashMap<>();
        o.put("id", asLong(v(i, "issue_id")));
        o.put("projectId", asLong(v(i, "project_id")));
        o.put("title", v(i, "title"));
        o.put("type", v(i, "type"));
        o.put("priority", v(i, "priority"));
        o.put("owner", v(i, "owner_name"));
        o.put("ownerId", v(i, "owner_uid"));
        o.put("reportedDate", dateStr(v(i, "reported_date")));
        o.put("resolvedDate", dateStr(v(i, "resolved_date")));
        o.put("dueDate", dateStr(v(i, "due_date")));
        o.put("status", v(i, "status"));
        o.put("displayCode", v(i, "display_code"));
        o.put("reviewComment", v(i, "review_comment"));
        o.put("sourceRuleId", asLong(v(i, "source_rule_id")));
        o.put("relatedTaskId", asLong(v(i, "related_task_id")));
        return o;
    }

    public static Map<String, Object> mapActionItem(Map<String, Object> a) {
        Map<String, Object> o = new LinkedHashMap<>();
        o.put("id", asLong(v(a, "action_id")));
        o.put("projectId", asLong(v(a, "project_id")));
        o.put("title", v(a, "title"));
        o.put("assignee", v(a, "assignee_name"));
        o.put("assigneeId", v(a, "assignee_uid"));
        o.put("dueDate", dateStr(v(a, "due_date")));
        o.put("status", v(a, "status"));
        o.put("displayCode", v(a, "display_code"));
        o.put("confirmComment", v(a, "confirm_comment"));
        o.put("relatedIssueId", asLong(v(a, "related_issue_id")));
        return o;
    }

    public static Map<String, Object> mapTask(Map<String, Object> t) {
        Map<String, Object> o = new LinkedHashMap<>();
        o.put("id", asLong(v(t, "task_id")));
        o.put("parentId", asLong(v(t, "parent_task_id")));
        o.put("projectId", asLong(v(t, "project_id")));
        o.put("name", v(t, "task_name"));
        o.put("status", v(t, "status"));
        o.put("progress", num(v(t, "progress_rate")));
        o.put("plannedStartDate", dateStr(v(t, "planned_start_date")));
        o.put("plannedEndDate", dateStr(v(t, "planned_end_date")));
        o.put("depth", num(v(t, "depth")));
        o.put("sortOrder", num(v(t, "sort_order")));
        o.put("displayCode", v(t, "display_code"));
        o.put("catalogNodeId", asLong(v(t, "catalog_node_id")));
        return o;
    }

    public static Map<String, Object> mapMeeting(Map<String, Object> m) {
        Map<String, Object> o = new LinkedHashMap<>();
        o.put("id", asLong(v(m, "meeting_id")));
        o.put("projectId", asLong(v(m, "project_id")));
        o.put("title", v(m, "title"));
        o.put("meetDate", iso(v(m, "meet_date")));
        o.put("attendees", Json.readArray(str(v(m, "attendees"))));
        o.put("content", v(m, "content"));
        o.put("remarks", v(m, "remarks"));
        o.put("authorId", v(m, "author_uid"));
        return o;
    }

    public static Map<String, Object> mapCatalogNode(Map<String, Object> n) {
        Map<String, Object> o = new LinkedHashMap<>();
        o.put("id", asLong(v(n, "node_id")));
        o.put("parentId", asLong(v(n, "parent_node_id")));
        o.put("nodeType", v(n, "node_type"));
        o.put("code", v(n, "code"));
        o.put("name", v(n, "name"));
        o.put("description", v(n, "description"));
        o.put("isOptional", boolOrNull(v(n, "is_optional")));
        o.put("sortOrder", asInt(v(n, "sort_order")));
        o.put("seqNo", asInt(v(n, "seq_no")));
        o.put("deliverableCategory", v(n, "deliverable_category"));
        o.put("stage", v(n, "stage"));
        o.put("templateFileRef", v(n, "template_file_ref"));
        o.put("templateTags", Json.readAny(str(v(n, "template_tags"))));
        o.put("workflowId", asLong(v(n, "workflow_id")));
        o.put("isActive", activeDefault(v(n, "is_active")));
        o.put("children", new java.util.ArrayList<>());
        return o;
    }

    public static Map<String, Object> mapCompany(Map<String, Object> c) {
        Map<String, Object> o = new LinkedHashMap<>();
        o.put("id", asLong(v(c, "company_id")));
        o.put("name", v(c, "company_name"));
        o.put("type", v(c, "company_type"));
        o.put("isActive", activeDefault(v(c, "is_active")));
        return o;
    }

    public static Map<String, Object> mapWorkflowStatus(Map<String, Object> s) {
        Map<String, Object> o = new LinkedHashMap<>();
        o.put("id", asLong(v(s, "status_id")));
        o.put("workflowId", asLong(v(s, "workflow_id")));
        o.put("code", v(s, "code"));
        o.put("name", v(s, "name"));
        o.put("color", v(s, "color"));
        o.put("category", v(s, "category"));
        o.put("isInitial", boolOrNull(v(s, "is_initial")));
        o.put("isFinal", boolOrNull(v(s, "is_final")));
        o.put("sortOrder", asInt(v(s, "sort_order")));
        return o;
    }

    public static Map<String, Object> mapTransitionCondition(Map<String, Object> c) {
        Map<String, Object> o = new LinkedHashMap<>();
        o.put("id", asLong(v(c, "condition_id")));
        o.put("transitionId", asLong(v(c, "transition_id")));
        o.put("groupId", asLong(v(c, "group_id")));
        o.put("logicOp", v(c, "logic_op"));
        o.put("subjectScope", v(c, "subject_scope"));
        o.put("leftField", v(c, "left_field"));
        o.put("operator", v(c, "operator"));
        o.put("params", Json.readObject(str(v(c, "params"))));
        o.put("errorMessage", v(c, "error_message"));
        o.put("isBlocking", boolOrNull(v(c, "is_blocking")));
        o.put("sortOrder", asInt(v(c, "sort_order")));
        return o;
    }

    public static Map<String, Object> mapSignalRule(Map<String, Object> r) {
        Map<String, Object> o = new LinkedHashMap<>();
        o.put("ruleId", asLong(v(r, "rule_id")));
        o.put("projectId", asLong(v(r, "project_id")));
        o.put("name", v(r, "name"));
        o.put("metric", v(r, "metric"));
        o.put("operator", v(r, "operator"));
        Object th = v(r, "threshold");
        o.put("threshold", th == null ? null : ((Number) th).doubleValue());
        o.put("params", Json.readObject(str(v(r, "params"))));
        o.put("action", v(r, "action"));
        o.put("enabled", bool(v(r, "enabled")));
        return o;
    }

    public static Map<String, Object> mapComment(Map<String, Object> c) {
        Map<String, Object> o = new LinkedHashMap<>();
        o.put("commentId", asLong(v(c, "comment_id")));
        o.put("entityType", v(c, "entity_type"));
        o.put("entityId", asLong(v(c, "entity_id")));
        o.put("projectId", asLong(v(c, "project_id")));
        o.put("body", v(c, "body"));
        o.put("commentType", v(c, "comment_type"));
        o.put("statusFrom", v(c, "status_from"));
        o.put("statusTo", v(c, "status_to"));
        o.put("parentCommentId", asLong(v(c, "parent_comment_id")));
        o.put("authorUid", v(c, "author_uid"));
        o.put("authorName", v(c, "author_name"));
        o.put("createdAt", iso(v(c, "created_at")));
        return o;
    }

    public static Map<String, Object> mapNotification(Map<String, Object> n) {
        Map<String, Object> o = new LinkedHashMap<>();
        o.put("notificationId", asLong(v(n, "notification_id")));
        o.put("recipientUid", v(n, "recipient_uid"));
        o.put("type", v(n, "type"));
        o.put("projectId", asLong(v(n, "project_id")));
        o.put("entityType", v(n, "entity_type"));
        o.put("entityId", asLong(v(n, "entity_id")));
        o.put("commentId", asLong(v(n, "comment_id")));
        o.put("actorUid", v(n, "actor_uid"));
        o.put("actorName", v(n, "actor_name"));
        o.put("preview", v(n, "preview"));
        o.put("isRead", bool(v(n, "is_read")));
        o.put("createdAt", iso(v(n, "created_at")));
        return o;
    }

    public static Boolean boolOrNull(Object o) {
        if (o == null) return null;
        return bool(o);
    }

    static String str(Object o) {
        return o == null ? null : o.toString();
    }
}
