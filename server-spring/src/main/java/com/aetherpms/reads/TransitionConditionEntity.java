package com.aetherpms.reads;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** pms_workflow_transition_condition — GET /api/workflows (mapTransitionCondition). */
@Entity
@Table(name = "pms_workflow_transition_condition")
public class TransitionConditionEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "condition_id")
    private Long conditionId;

    @Column(name = "transition_id")
    private Long transitionId;

    @Column(name = "group_id")
    private Long groupId;

    @Column(name = "logic_op")
    private String logicOp;

    @Column(name = "subject_scope")
    private String subjectScope;

    @Column(name = "left_field")
    private String leftField;

    @Column(name = "operator")
    private String operator;

    @Column(name = "params", columnDefinition = "json")
    private String params;

    @Column(name = "error_message")
    private String errorMessage;

    @Column(name = "is_blocking")
    private Boolean isBlocking;

    @Column(name = "sort_order")
    private Integer sortOrder;

    public Long getConditionId() { return conditionId; }
    public Long getTransitionId() { return transitionId; }
    public Long getGroupId() { return groupId; }
    public String getLogicOp() { return logicOp; }
    public String getSubjectScope() { return subjectScope; }
    public String getLeftField() { return leftField; }
    public String getOperator() { return operator; }
    public String getParams() { return params; }
    public String getErrorMessage() { return errorMessage; }
    public Boolean getIsBlocking() { return isBlocking; }
    public Integer getSortOrder() { return sortOrder; }
}
