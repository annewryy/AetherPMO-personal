package com.aetherpms.access;

import java.util.ArrayList;
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

import com.aetherpms.common.ApiException;
import com.aetherpms.common.Json;

/**
 * 0034 §4 → 0039 — 관리자 콘솔 '프로젝트 역할 권한'.
 *   pms_role_capability가 참여역할 마스터다(코드·표시명·정렬 + 관리포인트 capability).
 *   역할 추가·수정·삭제를 여기서 하며, participation_role의 DB CHECK 제약은 V38에서 제거해
 *   어휘 검증은 이 마스터 조회로 일원화했다(MemberService).
 *   경영진(EXEC)은 직급이지 프로젝트 내 역할이 아니라 마스터에서 제외한다 — 전사 조회 권한은
 *   접근 규칙(position_code='EXEC' + project_scope='ALL')이 담당한다.
 *   SYS_ADMIN 전용(RbacInterceptor /api/admin/*).
 */
@RestController
public class RoleCapabilityController {

    static final List<String> CAP_KEYS = List.of(
            "project.edit", "member.manage", "task.edit", "issue.edit",
            "action.edit", "deliverable.edit", "meeting.write", "doc.write");
    private static final List<String> TRISTATE = List.of("task.edit", "issue.edit", "action.edit", "deliverable.edit");
    /** 신규 역할 기본값 — 본인 담당만 편집(가장 보수적인 실무자 기본). */
    private static final String DEFAULT_CAPABILITIES =
            "{\"project.edit\":false,\"member.manage\":false,\"task.edit\":\"own\",\"issue.edit\":\"own\","
          + "\"action.edit\":\"own\",\"deliverable.edit\":\"own\",\"meeting.write\":true,\"doc.write\":false}";

    private final JdbcTemplate jdbc;

    public RoleCapabilityController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/api/admin/role-capabilities")
    public Map<String, Object> list() {
        return Map.of("roles", roles(), "capabilityKeys", CAP_KEYS, "tristateKeys", TRISTATE);
    }

    @PostMapping("/api/admin/role-capabilities")
    public ResponseEntity<Map<String, Object>> create(@RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> b = body == null ? Map.of() : body;
        String code = normalizeCode(b.get("roleCode"));
        if (exists(code)) throw ApiException.conflict("이미 있는 역할 코드입니다: " + code);

        jdbc.update("INSERT INTO pms_role_capability (role_code, label, sort_order, capabilities) VALUES (?, ?, ?, ?)",
                code, labelOf(b, code), sortOf(b, 500), DEFAULT_CAPABILITIES);
        return ResponseEntity.status(HttpStatus.CREATED).body(one(code));
    }

    @PatchMapping("/api/admin/role-capabilities/{roleCode}")
    public Map<String, Object> update(@PathVariable String roleCode, @RequestBody(required = false) Map<String, Object> body) {
        if (body == null) throw ApiException.badRequest("요청 본문이 없습니다.");
        List<Map<String, Object>> existingRows = jdbc.queryForList(
                "SELECT capabilities FROM pms_role_capability WHERE role_code = ?", roleCode);
        if (existingRows.isEmpty()) throw ApiException.notFound("역할 코드를 찾을 수 없습니다: " + roleCode);

        // 메타(표시명·정렬)와 capability는 같은 PATCH로 받되 저장은 나눠 처리한다.
        Map<String, Object> caps = new LinkedHashMap<>();
        for (var e : body.entrySet()) {
            String k = e.getKey();
            if (k.equals("label") || k.equals("sortOrder")) continue;
            if (!CAP_KEYS.contains(k)) throw ApiException.badRequest("알 수 없는 권한 키: " + k);
            if (TRISTATE.contains(k)) {
                Object v = e.getValue();
                if (!("all".equals(v) || "own".equals(v) || Boolean.FALSE.equals(v) || "false".equals(v))) {
                    throw ApiException.badRequest(k + "는 all/own/false 중 하나여야 합니다.");
                }
            }
            caps.put(k, e.getValue());
        }
        if (body.containsKey("label")) {
            jdbc.update("UPDATE pms_role_capability SET label = ? WHERE role_code = ?",
                    labelOf(body, roleCode), roleCode);
        }
        if (body.containsKey("sortOrder")) {
            jdbc.update("UPDATE pms_role_capability SET sort_order = ? WHERE role_code = ?",
                    sortOf(body, 500), roleCode);
        }
        if (!caps.isEmpty()) {
            Object existing = Json.readObject(String.valueOf(existingRows.get(0).get("capabilities")));
            Map<String, Object> merged = new LinkedHashMap<>();
            if (existing instanceof Map<?, ?> m) {
                for (var e : m.entrySet()) merged.put(String.valueOf(e.getKey()), e.getValue());
            }
            merged.putAll(caps); // 부분 PATCH — 나머지 키는 유지
            jdbc.update("UPDATE pms_role_capability SET capabilities = ? WHERE role_code = ?",
                    Json.write(merged), roleCode);
        }
        return one(roleCode);
    }

    @DeleteMapping("/api/admin/role-capabilities/{roleCode}")
    public Map<String, Object> delete(@PathVariable String roleCode) {
        if (!exists(roleCode)) throw ApiException.notFound("역할 코드를 찾을 수 없습니다: " + roleCode);
        Integer inUse = jdbc.queryForObject(
                "SELECT COUNT(*) FROM pms_project_member WHERE participation_role = ?", Integer.class, roleCode);
        if (inUse != null && inUse > 0) {
            throw ApiException.conflict("이 역할을 쓰는 참여인력이 " + inUse + "명 있어 삭제할 수 없습니다. "
                    + "먼저 해당 인력의 역할을 바꿔주세요.");
        }
        jdbc.update("DELETE FROM pms_role_capability WHERE role_code = ?", roleCode);
        return Map.of("deleted", true, "roleCode", roleCode);
    }

    // ---- 내부 -----------------------------------------------------------------

    private List<Map<String, Object>> roles() {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT role_code, label, sort_order, capabilities FROM pms_role_capability "
              + "ORDER BY sort_order, role_code");
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            Map<String, Object> o = new LinkedHashMap<>();
            o.put("roleCode", r.get("role_code"));
            o.put("label", r.get("label"));
            o.put("sortOrder", r.get("sort_order"));
            o.put("capabilities", Json.readObject(String.valueOf(r.get("capabilities"))));
            out.add(o);
        }
        return out;
    }

    private Map<String, Object> one(String code) {
        for (Map<String, Object> r : roles()) {
            if (code.equals(r.get("roleCode"))) return r;
        }
        throw ApiException.notFound("역할 코드를 찾을 수 없습니다: " + code);
    }

    private boolean exists(String code) {
        Integer c = jdbc.queryForObject(
                "SELECT COUNT(*) FROM pms_role_capability WHERE role_code = ?", Integer.class, code);
        return c != null && c > 0;
    }

    /** 코드는 참여인력 행에 그대로 저장되는 식별자 — 영문 대문자·숫자·언더스코어만 허용. */
    private static String normalizeCode(Object raw) {
        String code = raw == null ? "" : raw.toString().trim().toUpperCase();
        if (code.isEmpty()) throw ApiException.badRequest("역할 코드는 필수입니다.");
        if (code.length() > 30) throw ApiException.badRequest("역할 코드는 30자 이내여야 합니다.");
        if (!code.matches("[A-Z0-9_]+")) {
            throw ApiException.badRequest("역할 코드는 영문 대문자·숫자·밑줄만 사용할 수 있습니다: " + code);
        }
        if ("EXEC".equals(code)) {
            throw ApiException.badRequest("EXEC(경영진)은 직급이라 프로젝트 역할로 쓸 수 없습니다. "
                    + "전사 권한은 접근 규칙에서 직책 EXEC으로 지정하세요.");
        }
        return code;
    }

    private static String labelOf(Map<String, Object> b, String fallback) {
        Object v = b.get("label");
        String s = v == null ? "" : v.toString().trim();
        if (s.length() > 50) throw ApiException.badRequest("표시명은 50자 이내여야 합니다.");
        return s.isEmpty() ? fallback : s;
    }

    private static int sortOf(Map<String, Object> b, int fallback) {
        Object v = b.get("sortOrder");
        if (v == null) return fallback;
        try {
            return v instanceof Number n ? n.intValue() : Integer.parseInt(v.toString());
        } catch (NumberFormatException e) {
            throw ApiException.badRequest("정렬 순서는 정수여야 합니다.");
        }
    }
}
