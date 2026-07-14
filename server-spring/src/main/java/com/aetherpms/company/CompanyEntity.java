package com.aetherpms.company;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** pms_company — GET /api/companies (mapCompany, 0009 모듈4 기준정보). */
@Entity
@Table(name = "pms_company")
public class CompanyEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "company_id")
    private Long companyId;

    @Column(name = "company_name")
    private String companyName;

    @Column(name = "company_type")
    private String companyType;

    @Column(name = "is_active")
    private Boolean isActive;

    /** 기관코드(나라장터 수요기관코드) — 배치16, V10 추가. 코드 없는 회사는 null. */
    @Column(name = "agency_code")
    private String agencyCode;

    public Long getCompanyId() { return companyId; }
    public String getCompanyName() { return companyName; }
    public String getCompanyType() { return companyType; }
    public Boolean getIsActive() { return isActive; }
    public String getAgencyCode() { return agencyCode; }
}
