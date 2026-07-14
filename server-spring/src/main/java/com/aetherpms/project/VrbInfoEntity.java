package com.aetherpms.project;

import java.time.LocalDate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** pms_vrb_info — GET /api/projects/:id/vrb (mapVrbInfo). project_id가 PK(프로젝트당 0~1건). */
@Entity
@Table(name = "pms_vrb_info")
public class VrbInfoEntity {

    @Id
    @Column(name = "project_id")
    private Long projectId;

    @Column(name = "status")
    private String status;

    @Column(name = "planned_date")
    private LocalDate plannedDate;

    @Column(name = "submitted_date")
    private LocalDate submittedDate;

    @Column(name = "approved_date")
    private LocalDate approvedDate;

    @Column(name = "vrb_number")
    private String vrbNumber;

    @Column(name = "memo")
    private String memo;

    public Long getProjectId() { return projectId; }
    public String getStatus() { return status; }
    public LocalDate getPlannedDate() { return plannedDate; }
    public LocalDate getSubmittedDate() { return submittedDate; }
    public LocalDate getApprovedDate() { return approvedDate; }
    public String getVrbNumber() { return vrbNumber; }
    public String getMemo() { return memo; }
}
