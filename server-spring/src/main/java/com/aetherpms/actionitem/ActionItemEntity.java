package com.aetherpms.actionitem;

import java.time.LocalDate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** pms_action_item — GET /api/projects/:id/action-items (mapActionItem). */
@Entity
@Table(name = "pms_action_item")
public class ActionItemEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "action_id")
    private Long actionId;

    @Column(name = "project_id")
    private Long projectId;

    @Column(name = "title")
    private String title;

    @Column(name = "assignee_name")
    private String assigneeName;

    @Column(name = "assignee_uid", columnDefinition = "char(36)")
    private String assigneeUid;

    @Column(name = "due_date")
    private LocalDate dueDate;

    @Column(name = "status")
    private String status;

    @Column(name = "display_code")
    private String displayCode;

    @Column(name = "confirm_comment")
    private String confirmComment;

    @Column(name = "related_issue_id")
    private Long relatedIssueId;

    @Column(name = "source_meeting_id")
    private Long sourceMeetingId;

    public Long getActionId() { return actionId; }
    public Long getProjectId() { return projectId; }
    public String getTitle() { return title; }
    public String getAssigneeName() { return assigneeName; }
    public String getAssigneeUid() { return assigneeUid; }
    public LocalDate getDueDate() { return dueDate; }
    public String getStatus() { return status; }
    public String getDisplayCode() { return displayCode; }
    public String getConfirmComment() { return confirmComment; }
    public Long getRelatedIssueId() { return relatedIssueId; }
    public Long getSourceMeetingId() { return sourceMeetingId; }
}
