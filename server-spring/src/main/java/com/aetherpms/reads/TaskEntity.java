package com.aetherpms.reads;

import java.time.LocalDate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** pms_task — GET /api/projects/:id/tasks (mapTask, 0004 BIDDING 제안 태스크 트리). */
@Entity
@Table(name = "pms_task")
public class TaskEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "task_id")
    private Long taskId;

    @Column(name = "parent_task_id")
    private Long parentTaskId;

    @Column(name = "project_id")
    private Long projectId;

    @Column(name = "task_name")
    private String taskName;

    @Column(name = "status")
    private String status;

    @Column(name = "progress_rate")
    private Integer progressRate;

    @Column(name = "planned_start_date")
    private LocalDate plannedStartDate;

    @Column(name = "planned_end_date")
    private LocalDate plannedEndDate;

    @Column(name = "depth")
    private Integer depth;

    @Column(name = "sort_order")
    private Integer sortOrder;

    @Column(name = "display_code")
    private String displayCode;

    @Column(name = "catalog_node_id")
    private Long catalogNodeId;

    public Long getTaskId() { return taskId; }
    public Long getParentTaskId() { return parentTaskId; }
    public Long getProjectId() { return projectId; }
    public String getTaskName() { return taskName; }
    public String getStatus() { return status; }
    public Integer getProgressRate() { return progressRate; }
    public LocalDate getPlannedStartDate() { return plannedStartDate; }
    public LocalDate getPlannedEndDate() { return plannedEndDate; }
    public Integer getDepth() { return depth; }
    public Integer getSortOrder() { return sortOrder; }
    public String getDisplayCode() { return displayCode; }
    public Long getCatalogNodeId() { return catalogNodeId; }
}
