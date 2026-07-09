package com.aetherpms.reads;

import java.time.LocalDate;
import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** pms_deliverable — GET /api/projects/:id/deliverables (mapArtifact). */
@Entity
@Table(name = "pms_deliverable")
public class DeliverableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "deliverable_id")
    private Long deliverableId;

    @Column(name = "project_id")
    private Long projectId;

    @Column(name = "deliverable_name")
    private String deliverableName;

    @Column(name = "deliverable_type")
    private String deliverableType;

    @Column(name = "version_no")
    private String versionNo;

    @Column(name = "author_name")
    private String authorName;

    @Column(name = "submitted_by", columnDefinition = "char(36)")
    private String submittedBy;

    @Column(name = "due_date")
    private LocalDate dueDate;

    @Column(name = "submitted_at")
    private LocalDateTime submittedAt;

    @Column(name = "status")
    private String status;

    @Column(name = "display_code")
    private String displayCode;

    @Column(name = "file_name")
    private String fileName;

    public Long getDeliverableId() { return deliverableId; }
    public Long getProjectId() { return projectId; }
    public String getDeliverableName() { return deliverableName; }
    public String getDeliverableType() { return deliverableType; }
    public String getVersionNo() { return versionNo; }
    public String getAuthorName() { return authorName; }
    public String getSubmittedBy() { return submittedBy; }
    public LocalDate getDueDate() { return dueDate; }
    public LocalDateTime getSubmittedAt() { return submittedAt; }
    public String getStatus() { return status; }
    public String getDisplayCode() { return displayCode; }
    public String getFileName() { return fileName; }
}
