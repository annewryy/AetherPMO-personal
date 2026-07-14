package com.aetherpms.person;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** pms_project_member — GET /api/projects/:id/members (mapProjectMember). */
@Entity
@Table(name = "pms_project_member")
public class ProjectMemberEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "member_id")
    private Long memberId;

    @Column(name = "project_id")
    private Long projectId;

    @Column(name = "member_type")
    private String memberType;

    @Column(name = "user_uid", columnDefinition = "char(36)")
    private String userUid;

    @Column(name = "name")
    private String name;

    @Column(name = "person_id")
    private Long personId;

    @Column(name = "company")
    private String company;

    @Column(name = "company_id")
    private Long companyId;

    @Column(name = "position")
    private String position;

    @Column(name = "participation_role")
    private String participationRole;

    @Column(name = "role_name")
    private String roleName;

    @Column(name = "department")
    private String department;

    @Column(name = "employment_type")
    private String employmentType;

    @Column(name = "is_active")
    private Boolean isActive;

    @Column(name = "is_project_manager")
    private Boolean isProjectManager;

    public Long getMemberId() { return memberId; }
    public Long getProjectId() { return projectId; }
    public String getMemberType() { return memberType; }
    public String getUserUid() { return userUid; }
    public String getName() { return name; }
    public Long getPersonId() { return personId; }
    public String getCompany() { return company; }
    public Long getCompanyId() { return companyId; }
    public String getPosition() { return position; }
    public String getParticipationRole() { return participationRole; }
    public String getRoleName() { return roleName; }
    public String getDepartment() { return department; }
    public String getEmploymentType() { return employmentType; }
    public Boolean getIsActive() { return isActive; }
    public Boolean getIsProjectManager() { return isProjectManager; }
}
