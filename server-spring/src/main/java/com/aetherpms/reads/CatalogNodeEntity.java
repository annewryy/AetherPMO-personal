package com.aetherpms.reads;

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

    @Column(name = "template_file_ref")
    private String templateFileRef;

    @Column(name = "template_tags", columnDefinition = "json")
    private String templateTags;

    @Column(name = "workflow_id")
    private Long workflowId;

    @Column(name = "is_active")
    private Boolean isActive;

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
    public String getTemplateFileRef() { return templateFileRef; }
    public String getTemplateTags() { return templateTags; }
    public Long getWorkflowId() { return workflowId; }
    public Boolean getIsActive() { return isActive; }
}
