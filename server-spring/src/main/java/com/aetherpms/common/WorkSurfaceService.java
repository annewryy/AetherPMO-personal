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
                              com.aetherpms.person.MemberAutoService memberAuto,
                              com.aetherpms.notification.NotificationService notify) {
        this.jdbc = jdbc;
        this.audit = audit;
        this.displayCodeService = displayCodeService;
        this.memberAuto = memberAuto;
        this.notify = notify;
    }

    private final com.aetherpms.notification.NotificationService notify;

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
                       "assignee_id", "assignee_name",
                       "deliverable_id")),                          // 0038: 실사용 산출물(후보 중 택1)
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
    // 0039 재개정 — 이슈/액션아이템의 관련항목 매핑(N:M). 컬럼이 아니라 링크 테이블이라
    //   patch()의 일반 컬럼 화이트리스트 밖에서 별도 동기화한다. jsonField는 PATCH/POST
    //   본문 키, linkTable(fromCol,toCol)은 pms_*_link 테이블, targetTable/targetIdCol은
    //   같은 프로젝트 소속 검증 대상.
    // =====================================================================
    private record LinkFieldSpec(String jsonField, String outKey, String linkTable, String fromCol, String toCol,
                                 String targetTable, String targetIdCol) {}

    private static final Map<Entity, List<LinkFieldSpec>> LINK_FIELDS = Map.of(
            Entity.ISSUE, List.of(
                    new LinkFieldSpec("task_ids", "taskIds", "pms_issue_task_link", "issue_id", "task_id",
                            "pms_task", "task_id"),
                    new LinkFieldSpec("deliverable_ids", "deliverableIds", "pms_issue_deliverable_link",
                            "issue_id", "deliverable_id", "pms_deliverable", "deliverable_id"),
                    new LinkFieldSpec("meeting_ids", "meetingIds", "pms_meeting_issue_link", "issue_id", "meeting_id",
                            "pms_meeting_minutes", "meeting_id"),
                    new LinkFieldSpec("action_ids", "actionItemIds", "pms_action_item_issue_link",
                            "issue_id", "action_id", "pms_action_item", "action_id")),
            Entity.ACTION_ITEM, List.of(
                    new LinkFieldSpec("task_ids", "taskIds", "pms_action_item_task_link", "action_id", "task_id",
                            "pms_task", "task_id"),
                    new LinkFieldSpec("deliverable_ids", "deliverableIds", "pms_action_item_deliverable_link",
                            "action_id", "deliverable_id", "pms_deliverable", "deliverable_id"),
                    new LinkFieldSpec("issue_ids", "issueIds", "pms_action_item_issue_link", "action_id", "issue_id",
                            "pms_issue", "issue_id"),
                    new LinkFieldSpec("meeting_ids", "meetingIds", "pms_meeting_action_link", "action_id", "meeting_id",
                            "pms_meeting_minutes", "meeting_id")));

    /** raw에서 이 엔티티의 링크 필드들을 떼어내고(있으면), 필드명→원본값 맵으로 반환. */
    private Map<String, Object> extractLinkFields(Entity cfg, Map<String, Object> raw) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (LinkFieldSpec spec : LINK_FIELDS.getOrDefault(cfg, List.of())) {
            if (raw.containsKey(spec.jsonField())) out.put(spec.jsonField(), raw.remove(spec.jsonField()));
        }
        return out;
    }

    /** 검증 + 동기화(지정된 필드만) 후, outKey(camelCase) → 최종 id 목록(미지정 필드는 현재값)을 반환. */
    private Map<String, List<Long>> syncLinkFields(Entity cfg, long id, long projectId,
                                                    Map<String, Object> linkRaw) {
        Map<String, List<Long>> out = new LinkedHashMap<>();
        for (LinkFieldSpec spec : LINK_FIELDS.getOrDefault(cfg, List.of())) {
            if (linkRaw.containsKey(spec.jsonField())) {
                List<Long> ids = LinkTableSupport.validateIds(jdbc, linkRaw.get(spec.jsonField()), spec.jsonField(),
                        spec.targetTable(), spec.targetIdCol(), projectId);
                LinkTableSupport.sync(jdbc, spec.linkTable(), spec.fromCol(), spec.toCol(), id, ids);
                out.put(spec.outKey(), ids);
            } else {
                out.put(spec.outKey(), jdbc.query(
                        "SELECT " + spec.toCol() + " FROM " + spec.linkTable() + " WHERE " + spec.fromCol() + " = ? "
                                + "ORDER BY " + spec.toCol(),
                        (rs, i) -> rs.getLong(1), id));
            }
        }
        return out;
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
        // 0039 — 관련항목 매핑(task_ids 등)은 컬럼이 아니라 링크 테이블(N:M)이라 일반 컬럼
        //   업데이트 파이프라인 밖에서 별도 동기화한다(raw에 남아있으면 "허용 필드 아님"으로 거부됨).
        Map<String, Object> linkRaw = extractLinkFields(cfg, raw);

        if (raw.isEmpty() && linkRaw.isEmpty()) {
            List<String> linkNames = LINK_FIELDS.getOrDefault(cfg, List.of()).stream().map(LinkFieldSpec::jsonField).toList();
            throw ApiException.badRequest("수정할 필드가 없습니다. 허용 필드: "
                    + String.join(", ", cfg.allowed) + (linkNames.isEmpty() ? "" : ", " + String.join(", ", linkNames)));
        }
        List<String> rejected = raw.keySet().stream().filter(k -> !cfg.allowed.contains(k)).toList();
        if (!rejected.isEmpty()) {
            throw ApiException.badRequest("허용되지 않는 필드: " + String.join(", ", rejected)
                    + " (허용: " + String.join(", ", cfg.allowed) + ")");
        }
        Map<String, Object> fields = normalize(cfg, raw);

        Map<String, Object> before = WriteSupport.findOne(jdbc, cfg.table, cfg.idCol, id);
        if (before == null) throw ApiException.notFound("대상을 찾을 수 없습니다.");

        // 0038 — 실사용 산출물은 이 태스크의 후보(pms_deliverable.task_id = 이 태스크)만 허용
        if (cfg == Entity.TASK && fields.containsKey("deliverable_id") && fields.get("deliverable_id") != null) {
            long did = ((Number) intOf(fields.get("deliverable_id"), "deliverable_id는 양의 정수여야 합니다.")).longValue();
            Integer belongs = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM pms_deliverable WHERE deliverable_id = ? AND task_id = ?",
                    Integer.class, did, id);
            if (belongs == null || belongs == 0) {
                throw ApiException.badRequest("이 태스크의 산출물 후보가 아닙니다: " + did);
            }
            fields.put("deliverable_id", did);
        }

        List<String> cols = new ArrayList<>(fields.keySet());
        Map<String, Object> after = fields.isEmpty() ? before
                : WriteSupport.updateReturning(jdbc, cfg.table, cfg.idCol, id, fields, false);

        Long projectId = toLong(before.get("project_id"));
        if (!cols.isEmpty()) {
            audit.write(cfg.type, id, projectId, "UPDATE", cols,
                    WriteSupport.pick(before, cols), WriteSupport.pick(after, cols),
                    actor, "작업 화면 필드 수정");
        }

        // 0039 — 관련항목 매핑(N:M) 동기화. 필드 미지정이면 기존 유지(빈 배열이면 전체 해제).
        Map<String, List<Long>> linkResult = syncLinkFields(cfg, id, projectId, linkRaw);
        if (!linkRaw.isEmpty()) {
            audit.write(cfg.type, id, projectId, "UPDATE", new ArrayList<>(linkRaw.keySet()), null,
                    linkResult, actor, "관련항목 매핑 수정");
        }

        // 0031: 태스크 담당자 지정 → 참여인력 자동 등록(있으면 no-op)
        if (cfg == Entity.TASK && fields.containsKey("assignee_name")
                && after.get("assignee_name") != null && projectId != null) {
            memberAuto.ensureMember(projectId, after.get("assignee_name").toString(), false, actor);
        }

        // 0033 ① — 담당자가 나로 지정·변경되면 알림(이전 담당자에게는 알리지 않음)
        String assigneeCol = switch (cfg) { case TASK, ACTION_ITEM -> "assignee_name"; case ISSUE -> "owner_name"; };
        if (fields.containsKey(assigneeCol) && after.get(assigneeCol) != null
                && !String.valueOf(after.get(assigneeCol)).equals(String.valueOf(before.get(assigneeCol)))) {
            String itemTitle = str(after.get(cfg == Entity.TASK ? "task_name" : "title"));
            notify.notifyByName(projectId, after.get(assigneeCol).toString(), "ASSIGNED",
                    cfg.type, id, "담당자로 지정되었습니다: " + (itemTitle == null ? cfg.type : itemTitle));
        }

        if (comment != null) {
            boolean statusChanged = fields.containsKey("status");
            insertComment(cfg.type, id, projectId, comment,
                    statusChanged ? str(before.get("status")) : null,
                    statusChanged ? str(after.get("status")) : null, actor);
        }

        Map<String, Object> result = switch (cfg) {
            case TASK -> RowMappers.mapTask(after);
            case ISSUE -> RowMappers.mapIssue(after);
            case ACTION_ITEM -> RowMappers.mapActionItem(after);
        };
        result.putAll(linkResult);
        return result;
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
        Map<String, Object> b = body == null ? Map.of() : new LinkedHashMap<>(body);
        List<String> allowed = List.of("project_id", "title", "assignee_uid", "assignee_name",
                "due_date", "status", "task_ids", "deliverable_ids", "issue_ids", "meeting_ids");
        rejectUnknown(b, allowed);
        long projectId = requireProjectId(b);
        String title = requireTitle(b);
        Map<String, Object> linkRaw = extractLinkFields(Entity.ACTION_ITEM, b);

        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("project_id", projectId);
        fields.put("title", title);
        fields.put("status", b.get("status") != null
                ? requireInList("status", b.get("status"), ACTION_STATUSES) : "대기");
        if (b.get("assignee_uid") != null) fields.put("assignee_uid", b.get("assignee_uid"));
        if (b.get("assignee_name") != null) fields.put("assignee_name", b.get("assignee_name"));
        if (b.get("due_date") != null) fields.put("due_date", LocalDate.parse(b.get("due_date").toString()));

        requireProjectExists(projectId);

        fields.put("display_code", displayCodeService.nextDisplayCode(projectId, "ACTION_ITEM", null));
        Map<String, Object> created = WriteSupport.insertReturning(jdbc, "pms_action_item", "action_id", fields);
        long actionId = toLong(created.get("action_id"));

        // 0039 — 관련항목 매핑(N:M): task_ids/deliverable_ids/issue_ids/meeting_ids.
        Map<String, List<Long>> linkResult = syncLinkFields(Entity.ACTION_ITEM, actionId, projectId, linkRaw);

        if (created.get("assignee_name") != null) {
            notify.notifyByName(projectId, created.get("assignee_name").toString(), "ASSIGNED",
                    "ACTION_ITEM", actionId,
                    "담당자로 지정되었습니다: " + created.get("title"));  // 0033 ①
        }
        audit.write("ACTION_ITEM", actionId, projectId, "INSERT",
                null, null, created, actor, "액션아이템 신규 등록");
        Map<String, Object> result = RowMappers.mapActionItem(created);
        result.putAll(linkResult);
        return result;
    }

    // =====================================================================
    // A-3. POST /api/meeting-minutes
    // =====================================================================

    @Transactional
    public Map<String, Object> createMeeting(Map<String, Object> body, Actor actor) {
        Map<String, Object> b = body == null ? Map.of() : body;
        List<String> allowed = List.of("project_id", "title", "meet_date", "meeting_date",
                "location", "attendees", "content", "body", "remarks",
                "issue_ids", "task_ids", "deliverable_ids", "action_ids");
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
        // 0039 — 회의 ↔ 이슈/리스크·태스크·산출물 매핑(N:M) 검증(같은 프로젝트 소속만 허용).
        List<Long> issueIds = LinkTableSupport.validateIds(jdbc, b.get("issue_ids"), "issue_ids",
                "pms_issue", "issue_id", projectId);
        List<Long> meetingTaskIds = LinkTableSupport.validateIds(jdbc, b.get("task_ids"), "task_ids",
                "pms_task", "task_id", projectId);
        List<Long> deliverableIds = LinkTableSupport.validateIds(jdbc, b.get("deliverable_ids"), "deliverable_ids",
                "pms_deliverable", "deliverable_id", projectId);
        List<Long> actionIds = LinkTableSupport.validateIds(jdbc, b.get("action_ids"), "action_ids",
                "pms_action_item", "action_id", projectId);

        fields.put("author_uid", actor.userId());
        Map<String, Object> created = WriteSupport.insertReturning(jdbc, "pms_meeting_minutes", "meeting_id", fields);
        long meetingId = toLong(created.get("meeting_id"));
        LinkTableSupport.sync(jdbc, "pms_meeting_issue_link", "meeting_id", "issue_id", meetingId, issueIds);
        LinkTableSupport.sync(jdbc, "pms_meeting_task_link", "meeting_id", "task_id", meetingId, meetingTaskIds);
        LinkTableSupport.sync(jdbc, "pms_meeting_deliverable_link", "meeting_id", "deliverable_id", meetingId, deliverableIds);
        LinkTableSupport.sync(jdbc, "pms_meeting_action_link", "meeting_id", "action_id", meetingId, actionIds);

        audit.write("MEETING_MINUTES", meetingId, projectId, "INSERT",
                null, null, created, actor, "회의록 신규 등록");
        Map<String, Object> out = RowMappers.mapMeeting(created);
        out.put("issueIds", issueIds);
        out.put("taskIds", meetingTaskIds);
        out.put("deliverableIds", deliverableIds);
        out.put("actionItemIds", actionIds);
        return out;
    }

    // =====================================================================
    // A-4. PATCH /api/meeting-minutes/{id} (0039)
    // =====================================================================

    private static final List<String> MEETING_ALLOWED = List.of(
            "title", "meet_date", "meeting_date", "location", "attendees", "content", "body", "remarks",
            "issue_ids", "task_ids", "deliverable_ids", "action_ids");

    @Transactional
    public Map<String, Object> updateMeeting(long id, Map<String, Object> body, Actor actor) {
        WriteSupport.parseId(id);
        Map<String, Object> b = body == null ? Map.of() : new LinkedHashMap<>(body);
        rejectUnknown(b, MEETING_ALLOWED);

        Map<String, Object> before = WriteSupport.findOne(jdbc, "pms_meeting_minutes", "meeting_id", id);
        if (before == null) throw ApiException.notFound("회의록을 찾을 수 없습니다.");
        long projectId = toLong(before.get("project_id"));

        boolean hasIssueIds = b.containsKey("issue_ids");
        boolean hasTaskIds = b.containsKey("task_ids");
        boolean hasDeliverableIds = b.containsKey("deliverable_ids");
        boolean hasActionIds = b.containsKey("action_ids");
        Object issueIdsRaw = b.remove("issue_ids");
        Object taskIdsRaw = b.remove("task_ids");
        Object deliverableIdsRaw = b.remove("deliverable_ids");
        Object actionIdsRaw = b.remove("action_ids");

        Map<String, Object> fields = new LinkedHashMap<>();
        if (b.get("title") != null) {
            String t = b.get("title").toString().trim();
            if (t.isEmpty()) throw ApiException.badRequest("title은 비어 있을 수 없습니다.");
            fields.put("title", t);
        }
        Object meetDateRaw = b.get("meet_date") != null ? b.get("meet_date") : b.get("meeting_date");
        if (meetDateRaw != null) fields.put("meet_date", parseDateTime(meetDateRaw.toString()));
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

        if (fields.isEmpty() && !hasIssueIds && !hasTaskIds && !hasDeliverableIds && !hasActionIds) {
            throw ApiException.badRequest("수정할 필드가 없습니다. 허용 필드: " + String.join(", ", MEETING_ALLOWED));
        }

        Map<String, Object> after = fields.isEmpty() ? before
                : WriteSupport.updateReturning(jdbc, "pms_meeting_minutes", "meeting_id", id, fields, true);

        if (!fields.isEmpty()) {
            List<String> cols = new ArrayList<>(fields.keySet());
            audit.write("MEETING_MINUTES", id, projectId, "UPDATE", cols,
                    WriteSupport.pick(before, cols), WriteSupport.pick(after, cols), actor, "회의록 수정");
        }

        List<Long> issueIds = hasIssueIds
                ? LinkTableSupport.validateIds(jdbc, issueIdsRaw, "issue_ids", "pms_issue", "issue_id", projectId)
                : linkedIds("pms_meeting_issue_link", "meeting_id", "issue_id", id);
        List<Long> taskIds = hasTaskIds
                ? LinkTableSupport.validateIds(jdbc, taskIdsRaw, "task_ids", "pms_task", "task_id", projectId)
                : linkedIds("pms_meeting_task_link", "meeting_id", "task_id", id);
        List<Long> deliverableIds = hasDeliverableIds
                ? LinkTableSupport.validateIds(jdbc, deliverableIdsRaw, "deliverable_ids",
                    "pms_deliverable", "deliverable_id", projectId)
                : linkedIds("pms_meeting_deliverable_link", "meeting_id", "deliverable_id", id);
        List<Long> actionIds = hasActionIds
                ? LinkTableSupport.validateIds(jdbc, actionIdsRaw, "action_ids",
                    "pms_action_item", "action_id", projectId)
                : linkedIds("pms_meeting_action_link", "meeting_id", "action_id", id);
        if (hasIssueIds) LinkTableSupport.sync(jdbc, "pms_meeting_issue_link", "meeting_id", "issue_id", id, issueIds);
        if (hasTaskIds) LinkTableSupport.sync(jdbc, "pms_meeting_task_link", "meeting_id", "task_id", id, taskIds);
        if (hasDeliverableIds) {
            LinkTableSupport.sync(jdbc, "pms_meeting_deliverable_link", "meeting_id", "deliverable_id", id, deliverableIds);
        }
        if (hasActionIds) {
            LinkTableSupport.sync(jdbc, "pms_meeting_action_link", "meeting_id", "action_id", id, actionIds);
        }

        Map<String, Object> out = RowMappers.mapMeeting(after);
        out.put("issueIds", issueIds);
        out.put("taskIds", taskIds);
        out.put("deliverableIds", deliverableIds);
        out.put("actionItemIds", actionIds);
        return out;
    }

    private List<Long> linkedIds(String table, String fromCol, String toCol, long fromId) {
        return jdbc.query("SELECT " + toCol + " FROM " + table + " WHERE " + fromCol + " = ? ORDER BY " + toCol,
                (rs, i) -> rs.getLong(1), fromId);
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
