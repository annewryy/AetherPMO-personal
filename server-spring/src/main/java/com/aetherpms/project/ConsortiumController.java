package com.aetherpms.project;

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
import org.springframework.web.bind.annotation.RestController;
import org.springframework.transaction.annotation.Transactional;

import com.aetherpms.auth.AuthContext;
import com.aetherpms.auth.ProjectScopeService;
import com.aetherpms.common.Actor;
import com.aetherpms.common.ApiException;
import com.aetherpms.common.AuditWriter;
import com.aetherpms.common.CurrentActor;
import com.aetherpms.common.ReadSupport;
import com.aetherpms.common.WriteSupport;

import jakarta.servlet.http.HttpServletRequest;

/**
 * 0039 — 컨소시엄 구성원 CRUD (/api/projects/{id}/consortium).
 *   역할은 주사업자·부사업자·협력사 3종(DB CHECK는 고객사·기타도 허용하지만 등록 UI 어휘는 3종).
 *   지분율 합계는 화면에서 경고로만 안내한다(한 건씩 추가하는 도중에는 100%가 될 수 없으므로
 *   저장 자체를 막지 않는다) — 응답에 shareTotal을 함께 실어 화면이 즉시 판단할 수 있게 한다.
 */
@RestController
public class ConsortiumController {

    private static final List<String> ROLES = List.of("주사업자", "부사업자", "협력사");

    private final JdbcTemplate jdbc;
    private final ProjectScopeService scope;
    private final AuditWriter audit;

    public ConsortiumController(JdbcTemplate jdbc, ProjectScopeService scope, AuditWriter audit) {
        this.jdbc = jdbc;
        this.scope = scope;
        this.audit = audit;
    }

    @GetMapping("/api/projects/{id}/consortium")
    public Map<String, Object> list(@PathVariable("id") long rawId, HttpServletRequest req) {
        long projectId = ReadSupport.parseId(rawId);
        ReadSupport.requireProject(jdbc, projectId);
        scope.assertCanView(AuthContext.of(req), projectId);
        return payload(projectId);
    }

    @PostMapping("/api/projects/{id}/consortium")
    @Transactional
    public ResponseEntity<Map<String, Object>> create(@PathVariable("id") long rawId,
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        long projectId = ReadSupport.parseId(rawId);
        ReadSupport.requireProject(jdbc, projectId);
        AuthContext ctx = AuthContext.of(req);
        scope.assertCanEditProject(ctx, projectId);
        Actor actor = CurrentActor.resolve(req);

        Map<String, Object> fields = normalize(body, true);
        fields.put("project_id", projectId);
        Map<String, Object> created = WriteSupport.insertReturning(
                jdbc, "pms_project_company", "project_company_id", fields);
        audit.write("PROJECT", projectId, projectId, "INSERT", null, null, created, actor,
                "컨소시엄 구성원 추가: " + created.get("company_name"));
        return ResponseEntity.status(HttpStatus.CREATED).body(payload(projectId));
    }

    @PatchMapping("/api/projects/{id}/consortium/{memberId}")
    @Transactional
    public Map<String, Object> update(@PathVariable("id") long rawId, @PathVariable long memberId,
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        long projectId = ReadSupport.parseId(rawId);
        ReadSupport.requireProject(jdbc, projectId);
        scope.assertCanEditProject(AuthContext.of(req), projectId);
        Actor actor = CurrentActor.resolve(req);

        Map<String, Object> before = requireMember(projectId, memberId);
        Map<String, Object> fields = normalize(body, false);
        if (fields.isEmpty()) throw ApiException.badRequest("수정할 필드가 없습니다.");
        Map<String, Object> after = WriteSupport.updateReturning(
                jdbc, "pms_project_company", "project_company_id", memberId, fields, true);
        List<String> cols = List.copyOf(fields.keySet());
        audit.write("PROJECT", projectId, projectId, "UPDATE", cols,
                WriteSupport.pick(before, cols), WriteSupport.pick(after, cols), actor, "컨소시엄 구성원 수정");
        return payload(projectId);
    }

    @DeleteMapping("/api/projects/{id}/consortium/{memberId}")
    @Transactional
    public Map<String, Object> delete(@PathVariable("id") long rawId, @PathVariable long memberId,
            HttpServletRequest req) {
        long projectId = ReadSupport.parseId(rawId);
        ReadSupport.requireProject(jdbc, projectId);
        scope.assertCanEditProject(AuthContext.of(req), projectId);
        Actor actor = CurrentActor.resolve(req);

        Map<String, Object> before = requireMember(projectId, memberId);
        jdbc.update("DELETE FROM pms_project_company WHERE project_company_id = ?", memberId);
        audit.write("PROJECT", projectId, projectId, "DELETE", null, before, null, actor,
                "컨소시엄 구성원 삭제: " + before.get("company_name"));
        return payload(projectId);
    }

    // ---- 내부 ----------------------------------------------------------------

    private Map<String, Object> requireMember(long projectId, long memberId) {
        Map<String, Object> row = WriteSupport.findOne(jdbc, "pms_project_company", "project_company_id", memberId);
        if (row == null || ((Number) row.get("project_id")).longValue() != projectId) {
            throw ApiException.notFound("컨소시엄 구성원을 찾을 수 없습니다.");
        }
        return row;
    }

    /** 목록 + 지분율 합계(화면 경고용). */
    private Map<String, Object> payload(long projectId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT project_company_id, project_id, company_name, role, share_rate, description, "
              + "contact_name, contact_phone, contact_email FROM pms_project_company "
              + "WHERE project_id = ? ORDER BY project_company_id", projectId);
        List<Map<String, Object>> members = new java.util.ArrayList<>();
        double total = 0;
        for (Map<String, Object> r : rows) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", ((Number) r.get("project_company_id")).longValue());
            m.put("projectId", ((Number) r.get("project_id")).longValue());
            m.put("companyName", r.get("company_name"));
            m.put("role", r.get("role"));
            double share = r.get("share_rate") == null ? 0 : ((Number) r.get("share_rate")).doubleValue();
            m.put("shareRate", share);
            m.put("description", r.get("description"));
            m.put("contactName", r.get("contact_name"));
            m.put("contactPhone", r.get("contact_phone"));
            m.put("contactEmail", r.get("contact_email"));
            members.add(m);
            total += share;
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("projectId", projectId);
        out.put("members", members);
        out.put("shareTotal", Math.round(total * 100.0) / 100.0);
        out.put("shareBalanced", Math.abs(total - 100.0) < 0.005);
        return out;
    }

    /** 화이트리스트 + 어휘·범위 검증. create=true면 회사명·역할·지분율 필수. */
    private Map<String, Object> normalize(Map<String, Object> raw, boolean create) {
        Map<String, Object> b = raw == null ? Map.of() : raw;
        List<String> allowed = List.of("companyName", "role", "shareRate", "description",
                "contactName", "contactPhone", "contactEmail");
        List<String> unknown = b.keySet().stream().filter(k -> !allowed.contains(k)).toList();
        if (!unknown.isEmpty()) {
            throw ApiException.badRequest("허용되지 않는 필드: " + String.join(", ", unknown)
                    + " (허용: " + String.join(", ", allowed) + ")");
        }

        Map<String, Object> out = new LinkedHashMap<>();
        if (b.containsKey("companyName") || create) {
            Object v = b.get("companyName");
            String name = v == null ? "" : v.toString().trim();
            if (name.isEmpty()) throw ApiException.badRequest("회사명은 필수입니다.");
            out.put("company_name", name);
        }
        if (b.containsKey("role") || create) {
            String role = b.get("role") == null ? "" : b.get("role").toString().trim();
            if (!ROLES.contains(role)) {
                throw ApiException.badRequest("역할은 " + String.join(", ", ROLES) + " 중 하나여야 합니다.");
            }
            out.put("role", role);
        }
        if (b.containsKey("shareRate") || create) {
            Object v = b.get("shareRate");
            if (v == null) throw ApiException.badRequest("지분율은 필수입니다.");
            double share;
            try {
                share = v instanceof Number n ? n.doubleValue() : Double.parseDouble(v.toString());
            } catch (NumberFormatException e) {
                throw ApiException.badRequest("지분율은 숫자여야 합니다.");
            }
            if (share < 0 || share > 100) throw ApiException.badRequest("지분율은 0~100 사이여야 합니다.");
            out.put("share_rate", share);
        }
        putTrimmed(out, b, "description", "description");
        putTrimmed(out, b, "contactName", "contact_name");
        putTrimmed(out, b, "contactPhone", "contact_phone");
        putTrimmed(out, b, "contactEmail", "contact_email");
        return out;
    }

    private static void putTrimmed(Map<String, Object> out, Map<String, Object> b, String key, String col) {
        if (!b.containsKey(key)) return;
        Object v = b.get(key);
        String s = v == null ? null : v.toString().trim();
        out.put(col, s == null || s.isEmpty() ? null : s);
    }
}
