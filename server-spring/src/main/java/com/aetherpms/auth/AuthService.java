package com.aetherpms.auth;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.aetherpms.common.ApiException;

/**
 * 0031 §B — 자체 로그인/세션. 세션 토큰(32B hex) 발급·검증·폐기, 비밀번호 변경.
 * 사람 마스터(pms_person) 조인으로 표시명 제공(0005 §G — person 우선).
 */
@Service
public class AuthService {

    private static final SecureRandom RNG = new SecureRandom();
    private static final long SESSION_HOURS = 12;

    private final JdbcTemplate jdbc;

    public AuthService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional
    public Map<String, Object> login(String loginId, String password) {
        if (loginId == null || loginId.isBlank() || password == null || password.isEmpty()) {
            throw ApiException.badRequest("아이디와 비밀번호를 입력하세요.");
        }
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT * FROM pms_user WHERE (username = ? OR email = ?) AND is_active = 1",
                loginId.trim(), loginId.trim());
        Map<String, Object> user = rows.isEmpty() ? null : rows.get(0);
        // 0038 개정(너울님 2026-07-27): 아마란스 연동 구현 전까지 전 계정 PW 로그인 허용.
        //   비밀번호 미설정/레거시 해시 계정은 "연동 대상" 차단 대신 발급 안내만 한다.
        if (user != null && (user.get("password") == null || str(user.get("password")).isBlank()
                || !str(user.get("password")).startsWith("pbkdf2-sha256$"))) {
            throw ApiException.unauthorized(
                "비밀번호가 설정되지 않은 계정입니다. 시스템 관리자에게 비밀번호 발급을 요청하세요.");
        }
        if (user == null || !PasswordHasher.verify(password, str(user.get("password")))) {
            throw ApiException.unauthorized("아이디 또는 비밀번호가 올바르지 않습니다.");
        }
        String token = newToken();
        jdbc.update("INSERT INTO pms_session (token, user_id, expires_at) VALUES (?, ?, ?)",
                token, user.get("user_id"), LocalDateTime.now().plusHours(SESSION_HOURS));
        Map<String, Object> out = me(token);
        out.put("token", token);
        return out;
    }

    /** 0034 — 관리자 비밀번호 발급/재설정(아마란스 연동 불가 자사 직원·외부 인력 PW 경로). */
    @Transactional
    public void setPasswordByAdmin(String loginId, String newPassword) {
        if (loginId == null || loginId.isBlank()) throw ApiException.badRequest("loginId는 필수입니다.");
        if (newPassword == null || newPassword.length() < 8) {
            throw ApiException.badRequest("비밀번호는 8자 이상이어야 합니다.");
        }
        int n = jdbc.update("UPDATE pms_user SET password = ? WHERE (username = ? OR email = ?) AND is_active = 1",
                PasswordHasher.hash(newPassword), loginId.trim(), loginId.trim());
        if (n == 0) throw ApiException.notFound("사용자를 찾을 수 없습니다: " + loginId);
    }

    @Transactional
    public void logout(String token) {
        if (token != null) jdbc.update("DELETE FROM pms_session WHERE token = ?", token);
    }

    /** 토큰 → 사용자(역할·표시명). 없거나 만료면 null. */
    public Map<String, Object> resolveByToken(String token) {
        if (token == null || token.isBlank()) return null;
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT u.user_id, u.username, u.email, u.role, u.person_id, u.full_name,
                       p.name AS person_name, s.expires_at
                  FROM pms_session s JOIN pms_user u ON u.user_id = s.user_id
                  LEFT JOIN pms_person p ON p.person_id = u.person_id
                 WHERE s.token = ? AND u.is_active = 1""", token);
        if (rows.isEmpty()) return null;
        Map<String, Object> r = rows.get(0);
        LocalDateTime exp = toDateTime(r.get("expires_at"));
        if (exp != null && exp.isBefore(LocalDateTime.now())) {
            jdbc.update("DELETE FROM pms_session WHERE token = ?", token);
            return null;
        }
        Map<String, Object> shaped = userShape(r);
        // 0034 — 아마란스 연동 가능 여부(조직 미러 매칭): 위임 기능(전자결재 등) 게이트 표시용
        Integer org = jdbc.queryForObject(
                "SELECT COUNT(*) FROM pms_org_member WHERE mber_id = ?",
                Integer.class, str(r.get("username")));
        shaped.put("amaranthLinked", org != null && org > 0);
        return shaped;
    }

    public Map<String, Object> me(String token) {
        Map<String, Object> u = resolveByToken(token);
        if (u == null) throw ApiException.unauthorized("로그인이 필요합니다.");
        return u;
    }

    @Transactional
    public void changePassword(String token, String current, String next) {
        Map<String, Object> u = resolveByToken(token);
        if (u == null) throw ApiException.unauthorized("로그인이 필요합니다.");
        if (next == null || next.length() < 8) {
            throw ApiException.badRequest("새 비밀번호는 8자 이상이어야 합니다.");
        }
        long userId = ((Number) u.get("id")).longValue();
        String stored = jdbc.queryForObject("SELECT password FROM pms_user WHERE user_id = ?", String.class, userId);
        if (!PasswordHasher.verify(current == null ? "" : current, stored)) {
            throw ApiException.badRequest("현재 비밀번호가 올바르지 않습니다.");
        }
        jdbc.update("UPDATE pms_user SET password = ?, password_algo = 'pbkdf2-sha256' WHERE user_id = ?",
                PasswordHasher.hash(next), userId);
        // 다른 세션 무효화(현재 토큰은 유지)
        jdbc.update("DELETE FROM pms_session WHERE user_id = ? AND token <> ?", userId, token);
    }

    private static Map<String, Object> userShape(Map<String, Object> r) {
        Map<String, Object> o = new LinkedHashMap<>();
        o.put("id", ((Number) r.get("user_id")).longValue());
        o.put("username", r.get("username"));
        o.put("email", r.get("email"));
        o.put("role", r.get("role"));
        o.put("personId", r.get("person_id") == null ? null : ((Number) r.get("person_id")).longValue());
        // 표시명: person.name 우선, 없으면 full_name, 없으면 username (0005 §G)
        Object name = r.get("person_name") != null ? r.get("person_name")
                : (r.get("full_name") != null ? r.get("full_name") : r.get("username"));
        o.put("name", name);
        return o;
    }

    private static String newToken() {
        byte[] b = new byte[32];
        RNG.nextBytes(b);
        return HexFormat.of().formatHex(b);
    }

    private static String str(Object o) { return o == null ? null : o.toString(); }

    private static LocalDateTime toDateTime(Object o) {
        if (o instanceof LocalDateTime dt) return dt;
        if (o instanceof java.sql.Timestamp ts) return ts.toLocalDateTime();
        return null;
    }
}
