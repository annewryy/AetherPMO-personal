package com.aetherpms.project;

import java.math.BigDecimal;
import java.time.LocalDate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * pms_project — 목록/상세 읽기 슬라이스에 필요한 컬럼만 매핑.
 * (ddl-auto=validate이므로 매핑한 컬럼은 V1 스키마와 정확히 일치해야 한다.)
 */
@Entity
@Table(name = "pms_project")
public class ProjectEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "project_id")
    private Long projectId;

    @Column(name = "project_code")
    private String projectCode;

    @Column(name = "project_name")
    private String projectName;

    @Column(name = "description")
    private String description;

    @Column(name = "dept")
    private String dept;

    @Column(name = "pm_name")
    private String pmName;

    @Column(name = "pm_id", columnDefinition = "char(36)")
    private String pmId;

    @Column(name = "planned_start_date")
    private LocalDate plannedStartDate;

    @Column(name = "planned_end_date")
    private LocalDate plannedEndDate;

    @Column(name = "customer_name")
    private String customerName;

    @Column(name = "location")
    private String location;

    @Column(name = "budget")
    private BigDecimal budget;

    @Column(name = "milestones")
    private String milestones;

    @Column(name = "inspection_date")
    private LocalDate inspectionDate;

    @Column(name = "remarks")
    private String remarks;

    @Column(name = "status")
    private String status;

    @Column(name = "bid_status")
    private String bidStatus;

    @Column(name = "progress_rate")
    private Integer progressRate;

    @Column(name = "resources")
    private BigDecimal resources;

    @Column(name = "bid_number")
    private String bidNumber;

    @Column(name = "announcement_no")
    private String announcementNo;

    @Column(name = "contract_amount")
    private BigDecimal contractAmount;

    @Column(name = "business_type")
    private String businessType;

    @Column(name = "team")
    private String team;

    @Column(name = "proposal_deadline")
    private LocalDate proposalDeadline;

    @Column(name = "project_stage")
    private String projectStage;

    @Column(name = "source_project_id")
    private Long sourceProjectId;

    public Long getProjectId() { return projectId; }
    public String getProjectCode() { return projectCode; }
    public String getProjectName() { return projectName; }
    public String getDescription() { return description; }
    public String getDept() { return dept; }
    public String getPmName() { return pmName; }
    public String getPmId() { return pmId; }
    public LocalDate getPlannedStartDate() { return plannedStartDate; }
    public LocalDate getPlannedEndDate() { return plannedEndDate; }
    public String getCustomerName() { return customerName; }
    public String getLocation() { return location; }
    public BigDecimal getBudget() { return budget; }
    public String getMilestones() { return milestones; }
    public LocalDate getInspectionDate() { return inspectionDate; }
    public String getRemarks() { return remarks; }
    public String getStatus() { return status; }
    public String getBidStatus() { return bidStatus; }
    public Integer getProgressRate() { return progressRate; }
    public BigDecimal getResources() { return resources; }
    public String getBidNumber() { return bidNumber; }
    public String getAnnouncementNo() { return announcementNo; }
    public BigDecimal getContractAmount() { return contractAmount; }
    public String getBusinessType() { return businessType; }
    public String getTeam() { return team; }
    public LocalDate getProposalDeadline() { return proposalDeadline; }
    public String getProjectStage() { return projectStage; }
    public Long getSourceProjectId() { return sourceProjectId; }
}
