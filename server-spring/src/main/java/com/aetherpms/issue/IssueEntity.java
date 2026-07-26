package com.aetherpms.issue;

import java.time.LocalDate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** pms_issue — 쓰기 슬라이스(POST /api/issues) + mapIssue 응답에 필요한 컬럼. */
@Entity
@Table(name = "pms_issue")
public class IssueEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "issue_id")
    private Long issueId;

    @Column(name = "project_id")
    private Long projectId;

    @Column(name = "title")
    private String title;

    @Column(name = "type")
    private String type;

    @Column(name = "priority")
    private String priority;

    @Column(name = "owner_uid", columnDefinition = "char(36)")
    private String ownerUid;

    @Column(name = "owner_name")
    private String ownerName;

    @Column(name = "reported_date")
    private LocalDate reportedDate;

    @Column(name = "resolved_date")
    private LocalDate resolvedDate;

    @Column(name = "due_date")
    private LocalDate dueDate;

    @Column(name = "status")
    private String status;

    @Column(name = "review_comment")
    private String reviewComment;

    @Column(name = "source_rule_id")
    private Long sourceRuleId;

    @Column(name = "related_task_id")
    private Long relatedTaskId;

    @Column(name = "display_code")
    private String displayCode;

    public Long getIssueId() { return issueId; }
    public Long getProjectId() { return projectId; }
    public String getTitle() { return title; }
    public String getType() { return type; }
    public String getPriority() { return priority; }
    public String getOwnerUid() { return ownerUid; }
    public String getOwnerName() { return ownerName; }
    public LocalDate getReportedDate() { return reportedDate; }
    public LocalDate getResolvedDate() { return resolvedDate; }
    public LocalDate getDueDate() { return dueDate; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getReviewComment() { return reviewComment; }
    public Long getSourceRuleId() { return sourceRuleId; }
    public Long getRelatedTaskId() { return relatedTaskId; }
    public String getDisplayCode() { return displayCode; }

    public void setProjectId(Long v) { this.projectId = v; }
    public void setTitle(String v) { this.title = v; }
    public void setType(String v) { this.type = v; }
    public void setPriority(String v) { this.priority = v; }
    public void setOwnerUid(String v) { this.ownerUid = v; }
    public void setOwnerName(String v) { this.ownerName = v; }
    public void setReportedDate(LocalDate v) { this.reportedDate = v; }
    public void setDueDate(LocalDate v) { this.dueDate = v; }
    public void setSourceRuleId(Long v) { this.sourceRuleId = v; }
    public void setDisplayCode(String v) { this.displayCode = v; }
}
