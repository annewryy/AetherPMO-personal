package com.aetherpms.reads;

import java.time.LocalDate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** pms_official_doc — GET /api/projects/:id/official-docs (mapOfficialDoc). */
@Entity
@Table(name = "pms_official_doc")
public class OfficialDocEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "doc_id")
    private Long docId;

    @Column(name = "project_id")
    private Long projectId;

    @Column(name = "doc_number")
    private String docNumber;

    @Column(name = "title")
    private String title;

    @Column(name = "category")
    private String category;

    @Column(name = "draft_dept")
    private String draftDept;

    @Column(name = "drafter_name")
    private String drafterName;

    @Column(name = "drafter_uid", columnDefinition = "char(36)")
    private String drafterUid;

    @Column(name = "draft_date")
    private LocalDate draftDate;

    @Column(name = "approval_line", columnDefinition = "json")
    private String approvalLine;

    @Column(name = "current_approver")
    private String currentApprover;

    @Column(name = "current_status")
    private String currentStatus;

    public Long getDocId() { return docId; }
    public Long getProjectId() { return projectId; }
    public String getDocNumber() { return docNumber; }
    public String getTitle() { return title; }
    public String getCategory() { return category; }
    public String getDraftDept() { return draftDept; }
    public String getDrafterName() { return drafterName; }
    public String getDrafterUid() { return drafterUid; }
    public LocalDate getDraftDate() { return draftDate; }
    public String getApprovalLine() { return approvalLine; }
    public String getCurrentApprover() { return currentApprover; }
    public String getCurrentStatus() { return currentStatus; }
}
