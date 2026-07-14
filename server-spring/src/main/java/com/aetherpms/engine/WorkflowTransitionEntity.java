package com.aetherpms.engine;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** pms_workflow_transition — GET /api/workflows. */
@Entity
@Table(name = "pms_workflow_transition")
public class WorkflowTransitionEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "transition_id")
    private Long transitionId;

    @Column(name = "workflow_id")
    private Long workflowId;

    @Column(name = "from_status_id")
    private Long fromStatusId;

    @Column(name = "to_status_id")
    private Long toStatusId;

    @Column(name = "name")
    private String name;

    public Long getTransitionId() { return transitionId; }
    public Long getWorkflowId() { return workflowId; }
    public Long getFromStatusId() { return fromStatusId; }
    public Long getToStatusId() { return toStatusId; }
    public String getName() { return name; }
}
