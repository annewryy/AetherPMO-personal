package com.aetherpms.engine;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** pms_workflow_status — GET /api/workflows (mapWorkflowStatus). */
@Entity
@Table(name = "pms_workflow_status")
public class WorkflowStatusEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "status_id")
    private Long statusId;

    @Column(name = "workflow_id")
    private Long workflowId;

    @Column(name = "code")
    private String code;

    @Column(name = "name")
    private String name;

    @Column(name = "color")
    private String color;

    @Column(name = "category")
    private String category;

    @Column(name = "is_initial")
    private Boolean isInitial;

    @Column(name = "is_final")
    private Boolean isFinal;

    @Column(name = "sort_order")
    private Integer sortOrder;

    // 0039 — 이 상태의 진척률(%) 0~100. 산출물 기반 태스크 진척 산정에 사용(미지정=null).
    @Column(name = "progress_weight")
    private Integer progressWeight;

    public Long getStatusId() { return statusId; }
    public Long getWorkflowId() { return workflowId; }
    public String getCode() { return code; }
    public String getName() { return name; }
    public String getColor() { return color; }
    public String getCategory() { return category; }
    public Boolean getIsInitial() { return isInitial; }
    public Boolean getIsFinal() { return isFinal; }
    public Integer getSortOrder() { return sortOrder; }
    public Integer getProgressWeight() { return progressWeight; }
}
