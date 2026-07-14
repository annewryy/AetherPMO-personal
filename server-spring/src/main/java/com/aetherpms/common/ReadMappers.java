package com.aetherpms.common;

import com.aetherpms.actionitem.ActionItemEntity;
import com.aetherpms.activity.ActivityEntity;
import com.aetherpms.catalog.CatalogNodeEntity;
import com.aetherpms.company.CompanyEntity;
import com.aetherpms.deliverable.DeliverableEntity;
import com.aetherpms.engine.TransitionConditionEntity;
import com.aetherpms.engine.WorkflowEntity;
import com.aetherpms.engine.WorkflowStatusEntity;
import com.aetherpms.engine.WorkflowTransitionEntity;
import com.aetherpms.meeting.MeetingEntity;
import com.aetherpms.officialdoc.OfficialDocEntity;
import com.aetherpms.person.ProjectMemberEntity;
import com.aetherpms.project.VrbInfoEntity;
import com.aetherpms.task.TaskEntity;


import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * pms_* row(엔티티) → 도메인 모델(camelCase) 변환.
 * Node server/src/mappers.ts 의 매퍼 전부를 1:1 이식.
 * 프론트 web/src/types.ts 와 필드·순서가 일치해야 한다(프론트 무매핑 사용).
 */
public final class ReadMappers {

    private ReadMappers() {}

    // ---- Node num()/dateStr() 헬퍼 이식 ----------------------------------
    // num(v): Number(v || 0). null/빈값 → 0.
    static double num(Integer v) { return v == null ? 0 : v.doubleValue(); }
    static double num(java.math.BigDecimal v) { return v == null ? 0 : v.doubleValue(); }

    // dateStr(v): null/빈 → null, 아니면 yyyy-MM-dd.
    static String dateStr(LocalDate v) { return v == null ? null : v.toString(); }

    // ISO-8601 (Node: Date.toISOString() → UTC 'Z'). DATETIME(6)은 UTC 저장 규약.
    static String iso(LocalDateTime v) {
        if (v == null) return null;
        return v.atOffset(java.time.ZoneOffset.UTC)
                .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
    }

    // submitDate: Node는 submitted_at를 ISO로 만든 뒤 'T' 앞(날짜부)만. 없으면 ''.
    static String submitDate(LocalDateTime v) {
        if (v == null) return "";
        return v.toLocalDate().toString();
    }

    // MariaDB JSON(longtext 별칭) 컬럼은 String으로 읽어 여기서 배열/객체 원형 복원.
    //   Node는 jsonb를 pg가 파싱한 JS 값 그대로 반환 → 프론트 무매핑. 이를 재현한다.
    private static final ObjectMapper JSON = new ObjectMapper();

    /** JSON 문자열 → 배열(List). null/공백/파싱실패 → 빈 배열([]) (Node coalesce '[]'). */
    static Object jsonArray(String raw) {
        if (raw == null || raw.isBlank()) return new ArrayList<>();
        try {
            return JSON.readValue(raw, List.class);
        } catch (Exception e) {
            return new ArrayList<>();
        }
    }

    /** JSON 문자열 → 객체(Map). null/공백/파싱실패 → 빈 객체({}) (Node coalesce '{}'). */
    static Object jsonObject(String raw) {
        if (raw == null || raw.isBlank()) return new LinkedHashMap<>();
        try {
            return JSON.readValue(raw, Map.class);
        } catch (Exception e) {
            return new LinkedHashMap<>();
        }
    }

    /** JSON 문자열 → 원형(배열/객체/스칼라). null/공백 → null (Node: v ?? null 재현). */
    static Object jsonAny(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return JSON.readValue(raw, Object.class);
        } catch (Exception e) {
            return null;
        }
    }

    // ---- 매퍼 ------------------------------------------------------------

    public static Map<String, Object> mapArtifact(DeliverableEntity a) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", a.getDeliverableId());
        out.put("projectId", a.getProjectId());
        out.put("name", a.getDeliverableName());
        out.put("category", a.getDeliverableType());
        out.put("version", a.getVersionNo());
        out.put("author", a.getAuthorName());
        out.put("authorId", a.getSubmittedBy());
        out.put("dueDate", dateStr(a.getDueDate()));
        out.put("submitDate", submitDate(a.getSubmittedAt()));
        out.put("status", a.getStatus());
        out.put("displayCode", a.getDisplayCode());
        out.put("fileName", a.getFileName());
        return out;
    }

    public static Map<String, Object> mapActionItem(ActionItemEntity a) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", a.getActionId());
        out.put("projectId", a.getProjectId());
        out.put("title", a.getTitle());
        out.put("assignee", a.getAssigneeName());
        out.put("assigneeId", a.getAssigneeUid());
        out.put("dueDate", dateStr(a.getDueDate()));
        out.put("status", a.getStatus());
        out.put("displayCode", a.getDisplayCode());
        out.put("confirmComment", a.getConfirmComment());
        out.put("relatedIssueId", a.getRelatedIssueId());
        return out;
    }

    public static Map<String, Object> mapMeeting(MeetingEntity m) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", m.getMeetingId());
        out.put("projectId", m.getProjectId());
        out.put("title", m.getTitle());
        out.put("meetDate", iso(m.getMeetDate()));
        out.put("attendees", jsonArray(m.getAttendees()));
        out.put("content", m.getContent());
        out.put("remarks", m.getRemarks());
        out.put("authorId", m.getAuthorUid());
        return out;
    }

    public static Map<String, Object> mapOfficialDoc(OfficialDocEntity d) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", d.getDocId());
        out.put("projectId", d.getProjectId());
        out.put("docNumber", d.getDocNumber());
        out.put("title", d.getTitle());
        out.put("category", d.getCategory());
        out.put("draftDept", d.getDraftDept());
        out.put("drafter", d.getDrafterName());
        out.put("drafterId", d.getDrafterUid());
        out.put("draftDate", dateStr(d.getDraftDate()));
        out.put("approvalLine", jsonArray(d.getApprovalLine()));
        out.put("currentApprover", d.getCurrentApprover());
        out.put("currentStatus", d.getCurrentStatus());
        return out;
    }

    public static Map<String, Object> mapActivity(ActivityEntity a) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", a.getAuditId());
        out.put("projectId", a.getProjectId());
        out.put("userId", a.getChangedByUid());
        out.put("type", a.getAction());
        out.put("text", a.getReason() == null ? "" : a.getReason());
        out.put("date", iso(a.getChangedAt()));
        out.put("entityType", a.getEntityType());
        out.put("entityId", a.getEntityId());
        out.put("userName", a.getChangedByName());
        return out;
    }

    public static Map<String, Object> mapTask(TaskEntity t) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", t.getTaskId());
        out.put("parentId", t.getParentTaskId());
        out.put("projectId", t.getProjectId());
        out.put("name", t.getTaskName());
        out.put("status", t.getStatus());
        out.put("progress", num(t.getProgressRate()));
        out.put("plannedStartDate", dateStr(t.getPlannedStartDate()));
        out.put("plannedEndDate", dateStr(t.getPlannedEndDate()));
        out.put("depth", num(t.getDepth()));
        out.put("sortOrder", num(t.getSortOrder()));
        out.put("displayCode", t.getDisplayCode());
        out.put("catalogNodeId", t.getCatalogNodeId());
        out.put("assignee", t.getAssigneeName());   // 담당자명(직접 저장). 조직도 선택으로 채움
        out.put("assigneeId", t.getAssigneeId());
        return out;
    }

    public static Map<String, Object> mapVrbInfo(VrbInfoEntity v) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("projectId", v.getProjectId());
        out.put("status", v.getStatus());
        out.put("plannedDate", dateStr(v.getPlannedDate()));
        out.put("submittedDate", dateStr(v.getSubmittedDate()));
        out.put("approvedDate", dateStr(v.getApprovedDate()));
        out.put("vrbNumber", v.getVrbNumber());
        out.put("memo", v.getMemo());
        return out;
    }

    public static Map<String, Object> mapCatalogNode(CatalogNodeEntity n) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", n.getNodeId());
        out.put("parentId", n.getParentNodeId());
        out.put("nodeType", n.getNodeType());
        out.put("code", n.getCode());
        out.put("name", n.getName());
        out.put("description", n.getDescription());
        out.put("isOptional", n.getIsOptional());
        out.put("sortOrder", n.getSortOrder());
        out.put("seqNo", n.getSeqNo());
        out.put("deliverableCategory", n.getDeliverableCategory());
        out.put("stage", n.getStage());
        out.put("templateFileRef", n.getTemplateFileRef());
        // templateTags: Node는 n.template_tags ?? null. 값 있으면 파싱 원형(배열/객체).
        out.put("templateTags", jsonAny(n.getTemplateTags()));
        out.put("workflowId", n.getWorkflowId());
        // is_active !== false (컬럼 null → 활성). 여기선 NOT NULL DEFAULT 1이지만 방어.
        out.put("isActive", n.getIsActive() == null || n.getIsActive());
        out.put("children", new ArrayList<>());
        return out;
    }

    public static Map<String, Object> mapWorkflowStatus(WorkflowStatusEntity s) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", s.getStatusId());
        out.put("workflowId", s.getWorkflowId());
        out.put("code", s.getCode());
        out.put("name", s.getName());
        out.put("color", s.getColor());
        out.put("category", s.getCategory());
        out.put("isInitial", s.getIsInitial());
        out.put("isFinal", s.getIsFinal());
        out.put("sortOrder", s.getSortOrder());
        return out;
    }

    public static Map<String, Object> mapTransitionCondition(TransitionConditionEntity c) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", c.getConditionId());
        out.put("transitionId", c.getTransitionId());
        out.put("groupId", c.getGroupId());
        out.put("logicOp", c.getLogicOp());
        out.put("subjectScope", c.getSubjectScope());
        out.put("leftField", c.getLeftField());
        out.put("operator", c.getOperator());
        out.put("params", jsonObject(c.getParams()));
        out.put("errorMessage", c.getErrorMessage());
        out.put("isBlocking", c.getIsBlocking());
        out.put("sortOrder", c.getSortOrder());
        return out;
    }

    public static Map<String, Object> mapCompany(CompanyEntity c) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", c.getCompanyId());
        out.put("name", c.getCompanyName());
        out.put("type", c.getCompanyType());
        out.put("isActive", c.getIsActive() == null || c.getIsActive());
        out.put("agencyCode", c.getAgencyCode()); // 배치16 — 기관코드(없으면 null)
        return out;
    }

    public static Map<String, Object> mapProjectMember(ProjectMemberEntity m) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("memberId", m.getMemberId());
        out.put("projectId", m.getProjectId());
        out.put("memberType", m.getMemberType());
        out.put("userUid", m.getUserUid());
        out.put("name", m.getName());
        out.put("personId", m.getPersonId());
        out.put("company", m.getCompany());
        out.put("companyId", m.getCompanyId());
        out.put("position", m.getPosition());
        out.put("role", m.getParticipationRole());               // @멘션 ref 호환(기존)
        out.put("participationRole", m.getParticipationRole());  // 상세/편집(0014)
        out.put("roleName", m.getRoleName());
        out.put("department", m.getDepartment());
        out.put("employmentType", m.getEmploymentType());
        out.put("isProjectManager", m.getIsProjectManager() != null && m.getIsProjectManager());
        out.put("isActive", m.getIsActive() == null || m.getIsActive());
        return out;
    }
}
