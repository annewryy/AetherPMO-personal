package com.aetherpms.auth;

import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import jakarta.servlet.http.HttpServletRequest;

/** 0031 §B — 자체 로그인 API. */
@RestController
public class AuthController {

    private final AuthService auth;

    public AuthController(AuthService auth) {
        this.auth = auth;
    }

    @PostMapping("/api/auth/login")
    public Map<String, Object> login(@RequestBody(required = false) Map<String, Object> body) {
        String id = str(body, "loginId");
        if (id == null) id = str(body, "username");
        return auth.login(id, str(body, "password"));
    }

    @PostMapping("/api/auth/logout")
    public Map<String, Object> logout(HttpServletRequest req) {
        auth.logout(bearer(req));
        return Map.of("ok", true);
    }

    @GetMapping("/api/auth/me")
    public Map<String, Object> me(HttpServletRequest req) {
        return auth.me(bearer(req));
    }

    @PostMapping("/api/auth/password")
    public Map<String, Object> changePassword(HttpServletRequest req,
            @RequestBody(required = false) Map<String, Object> body) {
        auth.changePassword(bearer(req), str(body, "currentPassword"), str(body, "newPassword"));
        return Map.of("ok", true);
    }

    static String bearer(HttpServletRequest req) {
        String h = req.getHeader("Authorization");
        if (h != null && h.startsWith("Bearer ")) return h.substring(7).trim();
        return null;
    }

    private static String str(Map<String, Object> b, String k) {
        Object v = b == null ? null : b.get(k);
        return v == null ? null : v.toString();
    }
}
