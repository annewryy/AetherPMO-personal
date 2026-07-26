package com.aetherpms.common;



import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.aetherpms.issue.DisplayCodeService;

/**
 * 0011 A. 작업 화면 쓰기 — Node routes/work-surface.ts 이식.
 *   PATCH /api/tasks|issues|action-items/:id  (화이트리스트·audit·선택 comment)
 *   POST  /api/issues/:id/convert-to-issue     (리스크→이슈, 이미 이슈면 400)
 *   POST  /api/action-items                     (A-{순번} 발번)
 *   POST  /api/meeting-minutes
 * (POST /api/issues 는 배치1 IssueService에 이미 존재 — 여기서 재구현하지 않음)
 */
@Service
public class WorkSurfaceService {

    private final JdbcTemplate jdbc;
    private final AuditWriter audit;
    private final DisplayCodeService displayCodeService;

    public WorkSurfaceService(JdbcTemplate jdbc, AuditWriter audit, DisplayCodeService displayCodeService,
                              com.aetherpms.person.MemberAutoService memberAuto) {
        this.jdbc = jdbc;
        this.audit = audit;
        this.displayCodeService = displayCodeService;
        this.memberAuto = memberAuto;
    }

    private final com.aetherpms.person.MemberAutoService memberAuto;

    // ---- enum vocabulary (Node work-surface.ts) ---------------------------
    private static final List<String> TASK_STATUSES = List.of("TODO", "IN_PROGRESS", "REVIEW", "REJECTED", "DONE");
    private static final List<String> ISSUE_STATUSES = List.of("발생", "조치중", "완료");
    private static final List<String> ISSUE_PRIORITIES = List.of("상", "중", "하");
    private static final List<String> ACTION_STATUSES = List.of("대기", "진행", "완료");

    private enum Entity {
        TASK("pms_task", "task_id", "TASK",
                Set.of("progress_rate", "status", "actual_start_date", "actual_end_date",
                       "planned_start_date", "planned_end_date",   // 0031: 태스크 일정 지정
                       "assignee_id", "assignee_name")),
        ISSUE("pms_issue", "issue_id", "ISSUE",
                Set.of("status", "priority", "due_date", "resolved_date", "owner_uid", "owner_name", "title")),
        ACTION_ITEM("pms_action_item", "action_id", "ACTION_ITEM",
                Set.of("status", "assignee_uid", "assignee_name", "due_date", "title"));

        final String table, idCol, type;
        final Set<String> allowed;
        Entity(String t, String id, String type, Set<String> allowed) {
            this.table = t; this.idCol = id; this.type = type; this.allowed = allowed;
        }
    }

    private static Entity entityFor(String path) {
        return switch (path) {
            case "tasks" -> Entity.TASK;
            case "issues" -> Entity.ISSUE;
            case "action-items" -> Entity.ACTION_ITEM;
            default -> throw ApiException.badRequest("지원하지 않는 엔티티입니다: " + path);
        };
    }

    // =====================================================================
    // A-1. PATCH /api/{entity}/{id}
    // =====================================================================

    @Transactional
    public Map<String, Object> patch(String entityPath, long id, Map<String, Object> body, Actor actor) {
        Entity cfg = entityFor(entityPath);
        WriteSupport.parseId(id);

        Map<String, Object> raw = body == null ? Map.of() : new LinkedHashMap<>(body);
        // comment 분리
        Object rawComment = raw.remove("comment");
        String comment = (rawComment instanceof String s && !s.trim().isEmpty()) ? s.trim() : null;

        if (raw.isEmpty()) {
            throw ApiException.badRequest("수정할 필드가 없습니다. 허용 필드: " + String.join(", ", cfg.allowed));
        }
        List<String> rejected = raw.keySet().stream().filter(k -> !cfg.allowed.contains(k)).toList();
        if (!rejected.isEmpty()) {
            throw ApiException.badRequest("허용되지 않는 필드: " + String.join(", ", rejected)
                    + " (허용: " + String.join(", ", cfg.allowed) + ")");
        }
        Map<String, Object> fields = normalize(cfg, raw);

        Map<String, Object> before = WriteSupport.findOne(jdbc, cfg.table, cfg.idCol, id);
        if (before == null) throw ApiException.notFound("대상을 찾을 수 없습니다.");

        List<String> cols = new ArrayList<>(fields.keySet());
        Map<String, Object> after = WriteSupport.updateReturning(jdbc, cfg.table, cfg.idCol, id, fields, false);

        Long projectId = toLong(before.get("project_id"));
        audit.write(cfg.type, id, projectId, "UPDATE", cols,
                WriteSupport.pick(before, cols), WriteSupport.pick(after, cols),
                actor, "작업 화면 필드 수정");

        // 0031: 태스크 담당자 지정 → 참여인력 자동 등록(있으면 no-op)
        if (cfg == Entity.TASK && fields.containsKey("assignee_name")
                && after.get("assignee_name") != null && projectId != null) {
            memberAuto.ensureMember(projectId, after.get("assignee_name").toString(), false, actor);
        }

        if (comment != null) {
            boolean statusChanged = fields.containsKey("status");
            insertComment(cfg.type, id, projectId, comment,
                    statusChanged ? str(before.get("status")) : null,
                    statusChanged ? str(after.get("status")) : null, actor);
        }

        return switch (cfg) {
            case TASK -> RowMappers.mapTask(after);
            case ISSUE -> RowMappers.mapIssue(after);
            case ACTION_ITEM -> RowMappers.mapActionItem(after);
        };
    }

    private Map<String, Object> normalize(Entity cfg, Map<String, Object> in) {
        Map<String, Object> out = new LinkedHashMap<>(in);
        switch (cfg) {
            case TASK -> {
                if (out.get("progress_rate") != null) {
                    int p = intOf(out.get("progress_rate"), "progress_rate는 0~100 정수여야 합니다.");
                    if (p < 0 || p > 100) throw ApiException.badRequest("progress_rate는 0~100 정수여야 합니다.");
                    out.put("progress_rate", p);
                }
                if (out.get("status") != null) out.put("status", requireInList("status", out.get("status"), TASK_STATUSES));
                for (String dcol : List.of("planned_start_date", "planned_end_date",
                        "actual_start_date", "actual_end_date")) {
                    if (out.get(dcol) != null) {
                        try {
                            java.time.LocalDate.parse(out.get(dcol).toString());
                        } catch (java.time.format.DateTimeParseException e) {
                            throw ApiException.badRequest(dcol + "는 yyyy-MM-dd 형식이어야 합니다.");
                        }
                    }
                }
                if (out.get("assignee_id") != null) {
                    int a = intOf(out.get("assignee_id"), "assignee_id는 양의 정수여야 합니다.");
                    if (a <= 0) throw ApiException.badRequest("assignee_id는 양의 정수여야 합니다.");
                    out.put("assignee_id", a);
                }
            }
            case ISSUE -> {
                if (out.get("status") != null) out.put("status", requireInList("status", out.get("status"), ISSUE_STATUSES));
                if (out.get("priority") != null) out.put("priority", requireInList("priority", out.get("priority"), ISSUE_PRIORITIES));
                if (out.get("title") != null) {
                    String t = out.get("title").toString().trim();
                    if (t.isEmpty()) throw ApiException.badRequest("title은 비어 있을 수 없습니다.");
                    out.put("title", t);
                }
            }
            case ACTION_ITEM -> {
                if (out.get("status") != null) out.put("status", requireInList("status", out.get("status"), ACTION_STATUSES));
                if (out.get("title") != null) {
                    String t = out.get("title").toString().trim();
                    if (t.isEmpty()) throw ApiException.badRequest("title은 비어 있을 수 없습니다.");
                    out.put("title", t);
                }
            }
        }
        return out;
    }

    // =====================================================================
    // A-2. POST /api/issues/{id}/convert-to-issue
    // =====================================================================

    @Transactional
    public Map<String, Object> convertToIssue(long id, Map<String, Object> body, Actor actor) {
        WriteSupport.parseId(id);
        String comment = strTrimOrNull(body == null ? null : body.get("comment"));
        String reason = strTrimOrNull(body == null ? null : body.get("reason"));

        Map<String, Object> before = WriteSupport.findOne(jdbc, "pms_issue", "issue_id", id);
        if (before == null) throw ApiException.notFound("이슈를 찾을 수 없습니다.");

        String type = str(before.get("type"));
        if ("이슈".equals(type)) throw ApiException.badRequest("이미 이슈로 전환된 항목입니다.");
        if (!"리스크".equals(type)) {
            throw ApiException.badRequest("리스크만 이슈로 전환할 수 있습니다(현재 type=" + type + ").");
        }

        Map<String, Object> after = WriteSupport.updateReturning(jdbc, "pms_issue", "issue_id", id,
                new LinkedHashMap<>(Map.of("type", "이슈")), false);

        Long projectId = toLong(before.get("project_id"));
        audit.write("ISSUE", id, projectId, "UPDATE", List.of("type"),
                Map.of("type", str(before.get("type"))), Map.of("type", str(after.get("type"))),
                actor, reason != null ? "수동 리스크→이슈 전환: " + reason : "수동 리스크→이슈 전환");

        if (comment != null) {
            insertComment("ISSUE", id, projectId, comment, null, null, actor);
        }
        return RowMappers.mapIssue(after);
    }

    // =====================================================================
    // A-3. POST /api/action-items
    // =====================================================================

    @Transactional
    public Map<String, Object> createActionItem(Map<String, Object> body, Actor actor) {
        Map<String, Object> b = body == null ? Map.of() : body;
        List<String> allowed = List.of("project_id", "title", "assignee_uid", "assignee_name",
                "due_date", "related_issue_id", "status");
        rejectUnknown(b, allowed);
        long projectId = requireProjectId(b);
        String title = requireTitle(b);

        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("project_id", projectId);
        fields.put("title", title);
        fields.put("status", b.get("status") != null
                ? requireInList("status", b.get("status"), ACTION_STATUSES) : "대기");
        if (b.get("assignee_uid") != null) fields.put("assignee_uid", b.get("assignee_uid"));
        if (b.get("assignee_name") != null) fields.put("assignee_name", b.get("assignee_name"));
        if (b.get("due_date") != null) fields.put("due_date", LocalDate.parse(b.get("due_date").toString()));
        Long relatedIssueId = null;
        if (b.get("related_issue_id") != null) {
            int rid = intOf(b.get("related_issue_id"), "related_issue_id는 양의 정수여야 합니다.");
            if (rid <= 0) throw ApiException.badRequest("related_issue_id는 양의 정수여야 합니다.");
            relatedIssueId = (long) rid;
            fields.put("related_issue_id", rid);
        }

        requireProjectExists(projectId);
        if (relatedIssueId != null) {
            Integer c = jdbc.queryForObject("SELECT COUNT(*) FROM pms_issue WHERE issue_id = ?",
                    Integer.class, relatedIssueId);
            if (c == null || c == 0) throw ApiException.badRequest("존재하지 않는 related_issue_id입니다.");
        }

        fields.put("display_code", displayCodeService.nextDisplayCode(projectId, "ACTION_ITEM", null));
        Map<String, Object> created = WriteSupport.insertReturning(jdbc, "pms_action_item", "action_id", fields);

        audit.write("ACTION_ITEM", toLong(created.get("action_id")), projectId, "INSERT",
                null, null, created, actor, "액션아이템 신규 등록");
        return RowMappers.mapActionItem(created);
    }

    // =====================================================================
    // A-3. POST /api/meeting-minutes
    // =====================================================================

    @Transactional
    public Map<String, Object> createMeeting(Map<String, Object> body, Actor actor) {
        Map<String, Object> b = body == null ? Map.of() : body;
        List<String> allowed = List.of("project_id", "title", "meet_date", "meeting_date",
                "location", "attendees", "content", "body", "remarks");
        rejectUnknown(b, allowed);
        long projectId = requireProjectId(b);
        String title = requireTitle(b);
        Object meetDateRaw = b.get("meet_date") != null ? b.get("meet_date") : b.get("meeting_date");
        if (meetDateRaw == null || meetDateRaw.toString().trim().isEmpty()) {
            throw ApiException.badRequest("meet_date(회의 일시)는 필수입니다.");
        }

        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("project_id", projectId);
        fields.put("title", title);
        fields.put("meet_date", parseDateTime(meetDateRaw.toString()));
        if (b.get("location") != null) fields.put("location", b.get("location"));
        if (b.get("attendees") != null) {
            if (!(b.get("attendees") instanceof List)) {
                throw ApiException.badRequest("attendees는 배열이어야 합니다.");
            }
            fields.put("attendees", com.aetherpms.common.Json.write(b.get("attendees")));
        }
        Object content = b.get("content") != null ? b.get("content") : b.get("body");
        if (content != null) fields.put("content", content);
        if (b.get("remarks") != null) fields.put("remarks", b.get("remarks"));

        requireProjectExists(projectId);
        fields.put("author_uid", actor.userId());
        Map<String, Object> created = WriteSupport.insertReturning(jdbc, "pms_meeting_minutes", "meeting_id", fields);

        audit.write("MEETING_MINUTES", toLong(created.get("meeting_id")), projectId, "INSERT",
                null, null, created, actor, "회의록 신규 등록");
        return RowMappers.mapMeeting(created);
    }

    // ---- 공용 헬퍼 --------------------------------------------------------

    private void insertComment(String entityType, long entityId, Long projectId, String body,
                               String statusFrom, String statusTo, Actor actor) {
        boolean isStatusChange = statusFrom != null && statusTo != null && !statusFrom.equals(statusTo);
        jdbc.update(
                "INSERT INTO pms_comment (entity_type, entity_id, project_id, body, comment_type, "
              + "status_from, status_to, author_uid, author_name, created_at) "
              + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(6))",
                entityType, entityId, projectId, body,
                isStatusChange ? "STATUS_CHANGE" : "COMMENT",
                isStatusChange ? statusFrom : null, isStatusChange ? statusTo : null,
                actor.userId(), null);
    }

    private void requireProjectExists(long projectId) {
        Integer c = jdbc.queryForObject("SELECT COUNT(*) FROM pms_project WHERE project_id = ?",
                Integer.class, projectId);
        if (c == null || c == 0) throw ApiException.notFound("프로젝트를 찾을 수 없습니다.");
    }

    private static long requireProjectId(Map<String, Object> b) {
        Object v = b.get("project_id");
        long pid = v == null ? 0 : toLongLoose(v);
        if (pid <= 0) throw ApiException.badRequest("project_id는 필수이며 양의 정수여야 합니다.");
        return pid;
    }

    private static String requireTitle(Map<String, Object> b) {
        Object t = b.get("title");
        String title = t == null ? "" : t.toString().trim();
        if (title.isEmpty()) throw ApiException.badRequest("title은 필수입니다.");
        return title;
    }

    private static void rejectUnknown(Map<String, Object> b, List<String> allowed) {
        List<String> unknown = b.keySet().stream().filter(k -> !allowed.contains(k)).toList();
        if (!unknown.isEmpty()) {
            throw ApiException.badRequest("허용되지 않는 필드: " + String.join(", ", unknown)
                    + " (허용: " + String.join(", ", allowed) + ")");
        }
    }

    static String requireInList(String field, Object value, List<String> list) {
        String s = String.valueOf(value);
        if (!list.contains(s)) {
            throw ApiException.badRequest("유효하지 않은 " + field + " 값: " + value
                    + " (허용: " + String.join(", ", list) + ")");
        }
        return s;
    }

    private static int intOf(Object v, String msg) {
        try {
            if (v instanceof Number n) {
                double d = n.doubleValue();
                if (d != Math.floor(d)) throw ApiException.badRequest(msg);
                return (int) d;
            }
            return Integer.parseInt(v.toString());
        } catch (NumberFormatException e) {
            throw ApiException.badRequest(msg);
        }
    }

    private static java.time.LocalDateTime parseDateTime(String s) {
        String t = s.trim();
        try {
            if (t.length() <= 10) return LocalDate.parse(t).atStartOfDay();
            return java.time.LocalDateTime.parse(t.replace(" ", "T").replace("Z", ""));
        } catch (Exception e) {
            throw ApiException.badRequest("meet_date 형식이 올바르지 않습니다.");
        }
    }

    private static Long toLong(Object o) { return o == null ? null : ((Number) o).longValue(); }
    private static long toLongLoose(Object o) {
        if (o instanceof Number n) return n.longValue();
        try { return Long.parseLong(o.toString()); } catch (NumberFormatException e) { return 0; }
    }
    private static String str(Object o) { return o == null ? null : o.toString(); }
    private static String strTrimOrNull(Object o) {
        if (o instanceof String s && !s.trim().isEmpty()) return s.trim();
        return null;
    }
}
