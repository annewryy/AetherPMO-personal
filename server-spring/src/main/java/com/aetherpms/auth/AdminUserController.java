package com.aetherpms.auth;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.aetherpms.common.ApiException;

import jakarta.servlet.http.HttpServletRequest;

/**
 * 0032 §6 — 사용자 관리(SYS_ADMIN 전용, RbacInterceptor /api/admin/* 가드):
 * 목록(검색·역할 필터·페이징) / 역할·활성·인력(person) 연결 변경 / 비밀번호 발급(0034).
 * person 연결은 참여 프로젝트 스코프(0032 §2)의 판정 키 — V22 자동 백필 실패분을 수동 보정.
 */
@RestController
public class AdminUserController {

    private static final Set<String> ROLES = Set.of("SYS_ADMIN", "EXEC_ADMIN", "PM", "WORKER", "VIEWER");

    private final AuthService auth;
    private final JdbcTemplate jdbc;

    public AdminUserController(AuthService auth, JdbcTemplate jdbc) {
        this.auth = auth;
        this.jdbc = jdbc;
    }

    @GetMapping("/api/admin/users")
    public Map<String, Object> list(@RequestParam(required = false) String q,
                                    @RequestParam(required = false) String role,
                                    @RequestParam(defaultValue = "1") int page,
                                    @RequestParam(defaultValue = "20") int size) {
        if (size < 1 || size > 200) size = 20;
        if (page < 1) page = 1;
        StringBuilder where = new StringBuilder(" WHERE 1=1");
        List<Object> args = new ArrayList<>();
        if (q != null && !q.isBlank()) {
            where.append(" AND (u.username LIKE ? OR u.full_name LIKE ? OR u.email LIKE ?)");
            String like = "%" + q.trim() + "%";
            args.add(like); args.add(like); args.add(like);
        }
        if (role != null && !role.isBlank()) {
            where.append(" AND u.role = ?");
            args.add(role);
        }
        Long total = jdbc.queryForObject("SELECT COUNT(*) FROM pms_user u" + where, Long.class, args.toArray());
        args.add(size);
        args.add((page - 1) * size);
        List<Map<String, Object>> items = jdbc.query("""
                SELECT u.user_id, u.username, u.email, u.full_name, u.role, u.is_active, u.person_id,
                       p.name AS person_name,
                       (u.password LIKE 'pbkdf2-sha256$%') AS has_password,
                       (om.mber_id IS NOT NULL) AS amaranth_linked
                  FROM pms_user u
                  LEFT JOIN pms_person p ON p.person_id = u.person_id
                  LEFT JOIN pms_org_member om ON om.mber_id = u.username
                """ + where + " ORDER BY u.user_id LIMIT ? OFFSET ?",
                (rs, i) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("userId", rs.getLong("user_id"));
                    m.put("username", rs.getString("username"));
                    m.put("email", rs.getString("email"));
                    m.put("name", rs.getString("full_name"));
                    m.put("role", rs.getString("role"));
                    m.put("isActive", rs.getBoolean("is_active"));
                    m.put("personId", rs.getObject("person_id") == null ? null : rs.getLong("person_id"));
                    m.put("personName", rs.getString("person_name"));
                    m.put("hasPassword", rs.getBoolean("has_password"));
                    m.put("amaranthLinked", rs.getBoolean("amaranth_linked"));
                    return m;
                }, args.toArray());
        return Map.of("items", items, "total", total == null ? 0 : total, "page", page, "size", size);
    }

    /** 역할·활성·인력 연결 변경. 자기 자신의 SYS_ADMIN 해제·비활성화는 차단(잠금 사고 방지). */
    @PatchMapping("/api/admin/users/{id}")
    public Map<String, Object> patch(@PathVariable("id") long id,
                                     @RequestBody(required = false) Map<String, Object> body,
                                     HttpServletRequest req) {
        if (body == null || body.isEmpty()) throw ApiException.badRequest("변경할 필드가 없습니다.");
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM pms_user WHERE user_id = ?", Integer.class, id);
        if (n == null || n == 0) throw ApiException.notFound("사용자를 찾을 수 없습니다.");
        AuthContext ctx = AuthContext.of(req);
        boolean self = ctx != null && ctx.userId() == id;

        if (body.containsKey("role")) {
            String role = body.get("role") == null ? null : body.get("role").toString();
            if (!ROLES.contains(role)) throw ApiException.badRequest("role은 " + ROLES + " 중 하나여야 합니다.");
            if (self && !"SYS_ADMIN".equals(role)) {
                throw ApiException.badRequest("자기 자신의 SYS_ADMIN 역할은 해제할 수 없습니다.");
            }
            jdbc.update("UPDATE pms_user SET role = ? WHERE user_id = ?", role, id);
        }
        if (body.containsKey("isActive")) {
            boolean active = "true".equalsIgnoreCase(String.valueOf(body.get("isActive")));
            if (self && !active) throw ApiException.badRequest("자기 자신의 계정은 비활성화할 수 없습니다.");
            jdbc.update("UPDATE pms_user SET is_active = ? WHERE user_id = ?", active, id);
        }
        if (body.containsKey("personId")) {
            Object pv = body.get("personId");
            if (pv == null || String.valueOf(pv).isBlank()) {
                jdbc.update("UPDATE pms_user SET person_id = NULL WHERE user_id = ?", id);
            } else {
                long personId;
                try {
                    personId = Long.parseLong(String.valueOf(pv));
                } catch (NumberFormatException e) {
                    throw ApiException.badRequest("personId가 올바르지 않습니다.");
                }
                Integer exists = jdbc.queryForObject(
                        "SELECT COUNT(*) FROM pms_person WHERE person_id = ?", Integer.class, personId);
                if (exists == null || exists == 0) throw ApiException.badRequest("존재하지 않는 인력입니다: " + personId);
                jdbc.update("UPDATE pms_user SET person_id = ? WHERE user_id = ?", personId, id);
            }
        }
        return Map.of("ok", true, "userId", id);
    }

    @PostMapping("/api/admin/users/password")
    public Map<String, Object> setPassword(@RequestBody(required = false) Map<String, Object> body) {
        String loginId = body == null || body.get("loginId") == null ? null : body.get("loginId").toString();
        String password = body == null || body.get("password") == null ? null : body.get("password").toString();
        auth.setPasswordByAdmin(loginId, password);
        return Map.of("ok", true, "loginId", loginId);
    }
}
