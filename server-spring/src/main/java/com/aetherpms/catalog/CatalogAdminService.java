package com.aetherpms.catalog;

import static com.aetherpms.common.WriteSupport.applyAliases;
import static com.aetherpms.common.WriteSupport.intOrNull;
import static com.aetherpms.common.WriteSupport.toLong;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.aetherpms.common.Actor;
import com.aetherpms.common.ApiException;
import com.aetherpms.common.AuditWriter;
import com.aetherpms.common.RowMappers;
import com.aetherpms.common.WriteSupport;

/**
 * 테일러링 노드 관리(0009 모듈2) — 구 AdminService의 노드 CRUD 분리.
 * 계층 규칙·code 중복·참조 가드를 그대로 재현.
 */
@Service
public class CatalogAdminService {

    private final JdbcTemplate jdbc;
    private final AuditWriter audit;

    public CatalogAdminService(JdbcTemplate jdbc, AuditWriter audit) {
        this.jdbc = jdbc;
        this.audit = audit;
    }

    private static final List<String> NODE_TYPES = List.of("PHASE", "ACTIVITY", "TASK", "DELIVERABLE");
    private static final List<String> CATALOG_STAGES = List.of("BIDDING", "EXECUTION");

    private static final Set<String> NODE_FIELDS = Set.of(
            "parent_node_id", "node_type", "code", "name", "description", "is_optional",
            "sort_order", "seq_no", "deliverable_category", "stage",
            "template_file_ref", "template_tags", "workflow_id", "is_active",
            // 0029 — 테일러링 표준 트리 필드(관리자 편집 — 요구 0004 §4)
            "methodology", "required_small", "required_medium", "required_large",
            "doc_format", "file_name_base", "doc_template_id");
    private static final Map<String, String> NODE_ALIASES = Map.ofEntries(
            Map.entry("parentId", "parent_node_id"), Map.entry("nodeType", "node_type"),
            Map.entry("isOptional", "is_optional"), Map.entry("sortOrder", "sort_order"),
            Map.entry("seqNo", "seq_no"), Map.entry("deliverableCategory", "deliverable_category"),
            Map.entry("templateFileRef", "template_file_ref"), Map.entry("templateTags", "template_tags"),
            Map.entry("workflowId", "workflow_id"), Map.entry("isActive", "is_active"),
            Map.entry("requiredSmall", "required_small"), Map.entry("requiredMedium", "required_medium"),
            Map.entry("requiredLarge", "required_large"), Map.entry("docFormat", "doc_format"),
            Map.entry("fileNameBase", "file_name_base"), Map.entry("docTemplateId", "doc_template_id"));

    private static final List<String> METHODOLOGIES = List.of("OPMS", "ODS", "OMS", "BIS");

    @Transactional
    public Map<String, Object> createNode(Map<String, Object> body, Actor actor) {
        Map<String, Object> normalized = validateNodePayload(body, true);

        String parentType = normalized.get("parent_node_id") != null
                ? fetchNodeType(toLong(normalized.get("parent_node_id"))) : null;
        validateNodeHierarchy(str(normalized.get("node_type")), parentType);

        if (normalized.get("code") != null) assertCodeUnique(str(normalized.get("code")), null);
        if (normalized.get("workflow_id") != null) assertWorkflowExists(toLong(normalized.get("workflow_id")));

        Map<String, Object> node = WriteSupport.insertReturning(jdbc, "pms_catalog_node", "node_id",
                toDbFields(normalized));
        audit.write("CATALOG_NODE", toLong(node.get("node_id")), null, "INSERT",
                null, null, node, actor, "테일러링 노드 생성 (관리자)");
        return RowMappers.mapCatalogNode(node);
    }

    @Transactional
    public Map<String, Object> updateNode(long id, Map<String, Object> body, Actor actor) {
        WriteSupport.parseId(id);
        Map<String, Object> normalized = validateNodePayload(body, false);

        Map<String, Object> before = WriteSupport.findOne(jdbc, "pms_catalog_node", "node_id", id);
        if (before == null) throw ApiException.notFound("테일러링 노드를 찾을 수 없습니다.");

        String effType = str(normalized.containsKey("node_type") ? normalized.get("node_type") : before.get("node_type"));
        Object effParentId = normalized.containsKey("parent_node_id")
                ? normalized.get("parent_node_id") : before.get("parent_node_id");
        if (normalized.containsKey("node_type") || normalized.containsKey("parent_node_id")) {
            if (effParentId != null && toLong(effParentId) == id) {
                throw ApiException.badRequest("자기 자신을 부모로 지정할 수 없습니다.");
            }
            String parentType = effParentId != null ? fetchNodeType(toLong(effParentId)) : null;
            validateNodeHierarchy(effType, parentType);
        }
        if (normalized.get("code") != null) assertCodeUnique(str(normalized.get("code")), id);
        if (normalized.get("workflow_id") != null) assertWorkflowExists(toLong(normalized.get("workflow_id")));

        List<String> cols = List.copyOf(normalized.keySet());
        Map<String, Object> after = WriteSupport.updateReturning(jdbc, "pms_catalog_node", "node_id", id,
                toDbFields(normalized), false);
        audit.write("CATALOG_NODE", id, null, "UPDATE", cols,
                WriteSupport.pick(before, cols), WriteSupport.pick(after, cols),
                actor, "테일러링 노드 수정 (관리자)");
        return RowMappers.mapCatalogNode(after);
    }

    @Transactional
    public Map<String, Object> deleteNode(long id, Actor actor) {
        WriteSupport.parseId(id);
        Map<String, Object> node = WriteSupport.findOne(jdbc, "pms_catalog_node", "node_id", id);
        if (node == null) throw ApiException.notFound("테일러링 노드를 찾을 수 없습니다.");

        int tailorings = count("SELECT COUNT(*) FROM pms_project_tailoring WHERE catalog_node_id = ?", id);
        int tasks = count("SELECT COUNT(*) FROM pms_task WHERE catalog_node_id = ?", id);
        int deliverables = count("SELECT COUNT(*) FROM pms_deliverable WHERE catalog_node_id = ?", id);
        int children = count("SELECT COUNT(*) FROM pms_catalog_node WHERE parent_node_id = ?", id);
        if (tailorings + tasks + deliverables + children > 0) {
            throw ApiException.conflict(
                    "참조 중인 노드는 삭제할 수 없습니다 (테일러링 " + tailorings + " · 태스크 " + tasks
                  + " · 산출물 " + deliverables + " · 하위 노드 " + children
                  + "). 비활성(is_active=false)을 사용하세요.");
        }
        jdbc.update("DELETE FROM pms_catalog_node WHERE node_id = ?", id);
        audit.write("CATALOG_NODE", id, null, "DELETE", null, node, null,
                actor, "테일러링 노드 삭제 (관리자, 참조 0건)");
        return Map.of("deleted", true, "id", id);
    }

    private Map<String, Object> validateNodePayload(Map<String, Object> raw, boolean requireAll) {
        Map<String, Object> body = applyAliases(raw, NODE_ALIASES);
        if (body.isEmpty()) throw ApiException.badRequest("수정할 필드가 없습니다.");
        List<String> rejected = body.keySet().stream().filter(k -> !NODE_FIELDS.contains(k)).toList();
        if (!rejected.isEmpty()) throw ApiException.badRequest("허용되지 않는 필드: " + String.join(", ", rejected));

        Map<String, Object> out = new LinkedHashMap<>();
        if (body.containsKey("name")) {
            Object n = body.get("name");
            if (!(n instanceof String s) || s.trim().isEmpty()) {
                throw ApiException.badRequest("name은 비어있지 않은 문자열이어야 합니다.");
            }
            out.put("name", ((String) n).trim());
        } else if (requireAll) {
            throw ApiException.badRequest("name은 필수입니다.");
        }
        if (body.containsKey("node_type")) {
            if (!NODE_TYPES.contains(str(body.get("node_type")))) {
                throw ApiException.badRequest("유효하지 않은 node_type: " + body.get("node_type")
                        + " (허용: " + String.join(", ", NODE_TYPES) + ")");
            }
            out.put("node_type", body.get("node_type"));
        } else if (requireAll) {
            throw ApiException.badRequest("node_type은 필수입니다. (허용: " + String.join(", ", NODE_TYPES) + ")");
        }
        for (String k : List.of("parent_node_id", "workflow_id", "sort_order", "seq_no", "doc_template_id")) {
            if (!body.containsKey(k)) continue;
            if (body.get(k) == null) { out.put(k, null); continue; }
            Integer n = intOrNull(body.get(k));
            if (n == null) throw ApiException.badRequest(k + "는 정수 또는 null이어야 합니다.");
            out.put(k, n);
        }
        for (String k : List.of("is_optional", "is_active")) {
            if (!body.containsKey(k)) continue;
            if (!(body.get(k) instanceof Boolean bv)) throw ApiException.badRequest(k + "는 boolean이어야 합니다.");
            out.put(k, bv);
        }
        // 0029 — 규모별 필수(boolean 또는 null=해당없음)
        for (String k : List.of("required_small", "required_medium", "required_large")) {
            if (!body.containsKey(k)) continue;
            Object v = body.get(k);
            if (v != null && !(v instanceof Boolean)) throw ApiException.badRequest(k + "는 boolean 또는 null이어야 합니다.");
            out.put(k, v);
        }
        // 0039 — PHASE의 입찰/수행 구분. DB CHECK에만 맡기면 500이 나므로 여기서 400으로 거른다.
        if (body.containsKey("stage")) {
            Object v = body.get("stage");
            if (v != null && !CATALOG_STAGES.contains(str(v))) {
                throw ApiException.badRequest("stage는 " + String.join("/", CATALOG_STAGES) + " 또는 null이어야 합니다.");
            }
            out.put("stage", v);
        }
        if (body.containsKey("methodology")) {
            Object v = body.get("methodology");
            if (v != null && !METHODOLOGIES.contains(str(v))) {
                throw ApiException.badRequest("methodology는 " + String.join("/", METHODOLOGIES) + " 또는 null이어야 합니다.");
            }
            out.put("methodology", v == null ? null : str(v));
        }
        for (String k : List.of("code", "description", "deliverable_category", "stage", "template_file_ref",
                "doc_format", "file_name_base")) {
            if (!body.containsKey(k)) continue;
            out.put(k, body.get(k) == null ? null : str(body.get(k)));
        }
        if (body.containsKey("template_tags")) out.put("template_tags", body.get("template_tags"));
        return out;
    }

    private Map<String, Object> toDbFields(Map<String, Object> normalized) {
        Map<String, Object> out = new LinkedHashMap<>(normalized);
        if (out.containsKey("template_tags")) {
            Object t = out.get("template_tags");
            out.put("template_tags", t == null ? null : com.aetherpms.common.Json.write(t));
        }
        return out;
    }

    static void validateNodeHierarchy(String nodeType, String parentType) {
        Map<String, String> requiredParent = new LinkedHashMap<>();
        requiredParent.put("PHASE", null);
        requiredParent.put("ACTIVITY", "PHASE");
        requiredParent.put("TASK", "ACTIVITY");
        requiredParent.put("DELIVERABLE", "TASK");
        if (!requiredParent.containsKey(nodeType)) {
            throw ApiException.badRequest("유효하지 않은 node_type: " + nodeType
                    + " (허용: " + String.join(", ", NODE_TYPES) + ")");
        }
        String required = requiredParent.get(nodeType);
        if (required == null) {
            if (parentType != null) {
                throw ApiException.badRequest("계층 규칙 위반: PHASE는 최상위여야 합니다 (부모: " + parentType + ").");
            }
            return;
        }
        if (!required.equals(parentType)) {
            throw ApiException.badRequest("계층 규칙 위반: " + nodeType + "의 부모는 " + required
                    + "여야 합니다 (현재: " + (parentType == null ? "없음" : parentType) + ").");
        }
    }

    private String fetchNodeType(long nodeId) {
        List<String> rows = jdbc.query("SELECT node_type FROM pms_catalog_node WHERE node_id = ?",
                (rs, i) -> rs.getString("node_type"), nodeId);
        if (rows.isEmpty()) throw ApiException.badRequest("존재하지 않는 parent_node_id: " + nodeId);
        return rows.get(0);
    }

    private void assertCodeUnique(String code, Long excludeNodeId) {
        int c = excludeNodeId != null
                ? count("SELECT COUNT(*) FROM pms_catalog_node WHERE code = ? AND node_id <> ?", code, excludeNodeId)
                : count("SELECT COUNT(*) FROM pms_catalog_node WHERE code = ?", code);
        if (c > 0) throw ApiException.conflict("이미 존재하는 code입니다: " + code);
    }

    private void assertWorkflowExists(long workflowId) {
        int c = count("SELECT COUNT(*) FROM pms_workflow WHERE workflow_id = ?", workflowId);
        if (c == 0) throw ApiException.badRequest("존재하지 않는 workflow_id: " + workflowId);
    }

    private int count(String sql, Object... args) {
        Integer c = jdbc.queryForObject(sql, Integer.class, args);
        return c == null ? 0 : c;
    }

    static String str(Object o) { return o == null ? null : o.toString(); }
}
