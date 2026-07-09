package com.aetherpms.project;

import java.math.BigDecimal;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** pms_project_company — 컨소시엄(고객사 제외) 결합용. */
@Entity
@Table(name = "pms_project_company")
public class ProjectCompanyEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "project_company_id")
    private Long projectCompanyId;

    @Column(name = "project_id")
    private Long projectId;

    @Column(name = "company_name")
    private String companyName;

    @Column(name = "role")
    private String role;

    @Column(name = "share_rate")
    private BigDecimal shareRate;

    @Column(name = "description")
    private String description;

    public Long getProjectCompanyId() { return projectCompanyId; }
    public Long getProjectId() { return projectId; }
    public String getCompanyName() { return companyName; }
    public String getRole() { return role; }
    public BigDecimal getShareRate() { return shareRate; }
    public String getDescription() { return description; }
}
