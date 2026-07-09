package com.aetherpms.reads;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** pms_audit_log — GET /api/projects/:id/activities (mapActivity). */
@Entity
@Table(name = "pms_audit_log")
public class ActivityEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "audit_id")
    private Long auditId;

    @Column(name = "project_id")
    private Long projectId;

    @Column(name = "changed_by_uid", columnDefinition = "char(36)")
    private String changedByUid;

    @Column(name = "action")
    private String action;

    @Column(name = "reason")
    private String reason;

    @Column(name = "changed_at")
    private LocalDateTime changedAt;

    @Column(name = "entity_type")
    private String entityType;

    @Column(name = "entity_id")
    private Long entityId;

    @Column(name = "changed_by_name")
    private String changedByName;

    public Long getAuditId() { return auditId; }
    public Long getProjectId() { return projectId; }
    public String getChangedByUid() { return changedByUid; }
    public String getAction() { return action; }
    public String getReason() { return reason; }
    public LocalDateTime getChangedAt() { return changedAt; }
    public String getEntityType() { return entityType; }
    public Long getEntityId() { return entityId; }
    public String getChangedByName() { return changedByName; }
}
