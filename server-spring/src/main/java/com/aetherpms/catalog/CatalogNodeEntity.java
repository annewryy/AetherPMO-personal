package com.aetherpms.catalog;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** pms_catalog_node — GET /api/catalog/tree (mapCatalogNode). */
@Entity
@Table(name = "pms_catalog_node")
public class CatalogNodeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "node_id")
    private Long nodeId;

    @Column(name = "parent_node_id")
    private Long parentNodeId;

    @Column(name = "node_type")
    private String nodeType;

    @Column(name = "code")
    private String code;

    @Column(name = "name")
    private String name;

    @Column(name = "description")
    private String description;

    @Column(name = "is_optional")
    private Boolean isOptional;

    @Column(name = "sort_order")
    private Integer sortOrder;

    @Column(name = "seq_no")
    private Integer seqNo;

    @Column(name = "deliverable_category")
    private String deliverableCategory;

    @Column(name = "stage")
    private String stage;

    // 0044 §E — 고객사 분류(공통코드 CLIENT_CATEGORY, 'default'=표준)
    @Column(name = "client_category")
    private String clientCategory;

    @Column(name = "template_file_ref")
    private String templateFileRef;

    @Column(name = "template_tags", columnDefinition = "json")
    private String templateTags;

    @Column(name = "workflow_id")
    private Long workflowId;

    @Column(name = "is_active")
    private Boolean isActive;

    // 0029 — 테일러링 표준 트리(V15): 방법론 구분·규모별 필수·문서형식·표준 파일명
    @Column(name = "methodology")
    private String methodology;

    @Column(name = "required_small")
    private Boolean requiredSmall;

    @Column(name = "required_medium")
    private Boolean requiredMedium;

    @Column(name = "required_large")
    private Boolean requiredLarge;

    @Column(name = "doc_format")
    private String docFormat;

    @Column(name = "file_name_base")
    private String fileNameBase;

    @Column(name = "doc_template_id")
    private Long docTemplateId;

    public Long getNodeId() { return nodeId; }
    public Long getParentNodeId() { return parentNodeId; }
    public String getNodeType() { return nodeType; }
    public String getCode() { return code; }
    public String getName() { return name; }
    public String getDescription() { return description; }
    public Boolean getIsOptional() { return isOptional; }
    public Integer getSortOrder() { return sortOrder; }
    public Integer getSeqNo() { return seqNo; }
    public String getDeliverableCategory() { return deliverableCategory; }
    public String getStage() { return stage; }
    public String getClientCategory() { return clientCategory; }
    public String getTemplateFileRef() { return templateFileRef; }
    public String getTemplateTags() { return templateTags; }
    public Long getWorkflowId() { return workflowId; }
    public Boolean getIsActive() { return isActive; }
    public String getMethodology() { return methodology; }
    public Boolean getRequiredSmall() { return requiredSmall; }
    public Boolean getRequiredMedium() { return requiredMedium; }
    public Boolean getRequiredLarge() { return requiredLarge; }
    public String getDocFormat() { return docFormat; }
    public String getFileNameBase() { return fileNameBase; }
    public Long getDocTemplateId() { return docTemplateId; }
}
