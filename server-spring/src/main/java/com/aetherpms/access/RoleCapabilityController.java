package com.aetherpms.access;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.aetherpms.common.ApiException;
import com.aetherpms.common.Json;

/**
 * 0034 §4 — 관리자 콘솔 '프로젝트 역할 권한'(④ participation_role별 전역 기본 capability).
 * SYS_ADMIN 전용(RbacInterceptor /api/admin/*).
 */
@RestController
public class RoleCapabilityController {

    static final List<String> CAP_KEYS = List.of(
            "project.edit", "member.manage", "task.edit", "issue.edit",
            "action.edit", "deliverable.edit", "meeting.write", "doc.write");
    private static final List<String> TRISTATE = List.of("task.edit", "issue.edit", "action.edit", "deliverable.edit");

    private final JdbcTemplate jdbc;

    public RoleCapabilityController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/api/admin/role-capabilities")
    public Map<String, Object> list() {
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT * FROM pms_role_capability ORDER BY role_code");
        List<Map<String, Object>> out = new java.util.ArrayList<>();
        for (Map<String, Object> r : rows) {
            Map<String, Object> o = new LinkedHashMap<>();
            o.put("roleCode", r.get("role_code"));
            Object parsed = Json.readObject(String.valueOf(r.get("capabilities")));
            o.put("capabilities", parsed);
            out.add(o);
        }
        return Map.of("roles", out, "capabilityKeys", CAP_KEYS, "tristateKeys", TRISTATE);
    }

    @PatchMapping("/api/admin/role-capabilities/{roleCode}")
    public Map<String, Object> update(@PathVariable String roleCode, @RequestBody(required = false) Map<String, Object> body) {
        if (body == null) throw ApiException.badRequest("요청 본문이 없습니다.");
        for (String k : body.keySet()) {
            if (!CAP_KEYS.contains(k)) throw ApiException.badRequest("알 수 없는 권한 키: " + k);
        }
        for (var e : body.entrySet()) {
            if (TRISTATE.contains(e.getKey())) {
                Object v = e.getValue();
                if (!("all".equals(v) || "own".equals(v) || Boolean.FALSE.equals(v) || "false".equals(v))) {
                    throw ApiException.badRequest(e.getKey() + "는 all/own/false 중 하나여야 합니다.");
                }
            }
        }
        List<Map<String, Object>> existingRows = jdbc.queryForList(
                "SELECT capabilities FROM pms_role_capability WHERE role_code = ?", roleCode);
        if (existingRows.isEmpty()) throw ApiException.notFound("역할 코드를 찾을 수 없습니다: " + roleCode);
        Object existing = Json.readObject(String.valueOf(existingRows.get(0).get("capabilities")));
        Map<String, Object> merged = new LinkedHashMap<>();
        if (existing instanceof Map<?, ?> m) for (var e : m.entrySet()) merged.put(String.valueOf(e.getKey()), e.getValue());
        merged.putAll(body); // 부분 PATCH — 나머지 키는 유지
        jdbc.update("UPDATE pms_role_capability SET capabilities = ? WHERE role_code = ?",
                Json.write(merged), roleCode);
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT * FROM pms_role_capability WHERE role_code = ?", roleCode);
        Map<String, Object> o = new LinkedHashMap<>();
        o.put("roleCode", rows.get(0).get("role_code"));
        o.put("capabilities", Json.readObject(String.valueOf(rows.get(0).get("capabilities"))));
        return o;
    }
}
