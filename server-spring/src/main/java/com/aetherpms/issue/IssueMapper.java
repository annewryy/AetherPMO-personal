package com.aetherpms.issue;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * pms_issue row → 도메인 모델(camelCase). Node mappers.ts mapIssue 1:1 이식.
 * 프론트 web/src/types.ts Issue 와 필드 일치.
 */
public final class IssueMapper {

    private IssueMapper() {}

    private static String dateStr(LocalDate v) {
        return v == null ? null : v.toString();
    }

    public static Map<String, Object> mapIssue(IssueEntity i) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", i.getIssueId());
        out.put("projectId", i.getProjectId());
        out.put("title", i.getTitle());
        out.put("type", i.getType());
        out.put("priority", i.getPriority());
        out.put("owner", i.getOwnerName());
        out.put("ownerId", i.getOwnerUid());
        out.put("reportedDate", dateStr(i.getReportedDate()));
        out.put("resolvedDate", dateStr(i.getResolvedDate()));
        out.put("dueDate", dateStr(i.getDueDate()));
        out.put("status", i.getStatus());
        out.put("displayCode", i.getDisplayCode());
        out.put("reviewComment", i.getReviewComment());
        out.put("sourceRuleId", i.getSourceRuleId());
        out.put("relatedTaskId", i.getRelatedTaskId());
        return out;
    }
}
