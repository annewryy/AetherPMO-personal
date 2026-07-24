package com.aetherpms.catalog;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.transaction.annotation.Transactional;

import com.aetherpms.common.ApiException;
import com.aetherpms.common.AuditWriter;
import com.aetherpms.common.CurrentActor;
import com.aetherpms.common.WriteSupport;

import jakarta.servlet.http.HttpServletRequest;

/**
 * 0030 — 산출물 양식(pms_doc_template) CRUD.
 * 테일러링 노드와 1:N — 노드가 기본 양식을 선택(doc_template_id). 삭제는 참조 노드 있으면 409.
 * RBAC 도입 전까지 개방(요구 0004 §1-1: 템플릿 생성은 SYS_ADMIN 예정).
 */
@RestController
public class DocTemplateController {

    private final JdbcTemplate jdbc;
    private final AuditWriter audit;

    public DocTemplateController(JdbcTemplate jdbc, AuditWriter audit) {
        this.jdbc = jdbc;
        this.audit = audit;
    }

    @GetMapping("/api/doc-templates")
    public List<Map<String, Object>> list(@RequestParam(required = false) String category) {
        String base = "SELECT t.*, "
                + "(SELECT COUNT(*) FROM pms_catalog_node c WHERE c.doc_template_id = t.template_id) AS node_count "
                + "FROM pms_doc_template t";
        List<Map<String, Object>> rows = (category != null && !category.isBlank())
                ? jdbc.queryForList(base + " WHERE t.category = ? ORDER BY t.name, t.template_id", category.trim())
                : jdbc.queryForList(base + " ORDER BY t.name, t.template_id");
        return rows.stream().map(DocTemplateController::shape).toList();
    }

    @PostMapping("/api/doc-templates")
    @Transactional
    public ResponseEntity<Map<String, Object>> create(
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        Map<String, Object> fields = normalize(body, true);
        Map<String, Object> row = WriteSupport.insertReturning(jdbc, "pms_doc_template", "template_id", fields);
        audit.write("DOC_TEMPLATE", ((Number) row.get("template_id")).longValue(), null, "INSERT",
                null, null, row, CurrentActor.resolve(req), "산출물 양식 등록");
        row.put("node_count", 0L);
        return ResponseEntity.status(HttpStatus.CREATED).body(shape(row));
    }

    @PatchMapping("/api/doc-templates/{id}")
    @Transactional
    public Map<String, Object> update(@PathVariable("id") long id,
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        Map<String, Object> before = WriteSupport.findOne(jdbc, "pms_doc_template", "template_id", id);
        if (before == null) throw ApiException.notFound("양식을 찾을 수 없습니다.");
        Map<String, Object> fields = normalize(body, false);
        if (fields.isEmpty()) throw ApiException.badRequest("수정할 필드가 없습니다.");
        Map<String, Object> after = WriteSupport.updateReturning(
                jdbc, "pms_doc_template", "template_id", id, fields, false);
        List<String> cols = List.copyOf(fields.keySet());
        audit.write("DOC_TEMPLATE", id, null, "UPDATE", cols,
                AuditWriter.pick(before, cols), AuditWriter.pick(after, cols),
                CurrentActor.resolve(req), "산출물 양식 수정");
        Integer cnt = jdbc.queryForObject(
                "SELECT COUNT(*) FROM pms_catalog_node WHERE doc_template_id = ?", Integer.class, id);
        after.put("node_count", cnt == null ? 0 : cnt);
        return shape(after);
    }

    @DeleteMapping("/api/doc-templates/{id}")
    @Transactional
    public Map<String, Object> delete(@PathVariable("id") long id, HttpServletRequest req) {
        Map<String, Object> before = WriteSupport.findOne(jdbc, "pms_doc_template", "template_id", id);
        if (before == null) throw ApiException.notFound("양식을 찾을 수 없습니다.");
        Integer refs = jdbc.queryForObject(
                "SELECT COUNT(*) FROM pms_catalog_node WHERE doc_template_id = ?", Integer.class, id);
        if (refs != null && refs > 0) {
            throw ApiException.conflict("테일러링 노드 " + refs + "건이 이 양식을 사용 중입니다 — 연결 해제 후 삭제하세요.");
        }
        jdbc.update("DELETE FROM pms_doc_template WHERE template_id = ?", id);
        audit.write("DOC_TEMPLATE", id, null, "DELETE", null, before, null,
                CurrentActor.resolve(req), "산출물 양식 삭제");
        return Map.of("deleted", true);
    }

    private static Map<String, Object> normalize(Map<String, Object> body, boolean requireName) {
        Map<String, Object> b = body == null ? Map.of() : body;
        Map<String, Object> out = new LinkedHashMap<>();
        if (b.containsKey("name")) {
            String v = b.get("name") == null ? null : b.get("name").toString().trim();
            if (v == null || v.isEmpty()) throw ApiException.badRequest("name(양식명)은 비울 수 없습니다.");
            out.put("name", v);
        } else if (requireName) {
            throw ApiException.badRequest("name(양식명)은 필수입니다.");
        }
        for (String k : List.of("category", "doc_format", "file_ref", "description")) {
            String camel = switch (k) {
                case "doc_format" -> "docFormat";
                case "file_ref" -> "fileRef";
                default -> k;
            };
            if (b.containsKey(camel)) {
                Object v = b.get(camel);
                out.put(k, v == null || v.toString().trim().isEmpty() ? null : v.toString().trim());
            }
        }
        if (b.containsKey("isActive")) {
            if (!(b.get("isActive") instanceof Boolean bv)) throw ApiException.badRequest("isActive는 boolean이어야 합니다.");
            out.put("is_active", bv ? 1 : 0);
        }
        return out;
    }

    private static Map<String, Object> shape(Map<String, Object> r) {
        Map<String, Object> o = new LinkedHashMap<>();
        o.put("id", ((Number) r.get("template_id")).longValue());
        o.put("name", r.get("name"));
        o.put("category", r.get("category"));
        o.put("docFormat", r.get("doc_format"));
        o.put("fileRef", r.get("file_ref"));
        o.put("description", r.get("description"));
        Object act = r.get("is_active");
        o.put("isActive", act == null || (act instanceof Boolean bo ? bo : ((Number) act).intValue() != 0));
        o.put("nodeCount", r.get("node_count") == null ? 0 : ((Number) r.get("node_count")).intValue());
        return o;
    }
}
