package com.aetherpms.engine;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** pms_workflow — GET /api/workflows. */
@Entity
@Table(name = "pms_workflow")
public class WorkflowEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "workflow_id")
    private Long workflowId;

    @Column(name = "name")
    private String name;

    @Column(name = "description")
    private String description;

    @Column(name = "is_default")
    private Boolean isDefault;

    public Long getWorkflowId() { return workflowId; }
    public String getName() { return name; }
    public String getDescription() { return description; }
    public Boolean getIsDefault() { return isDefault; }
}
