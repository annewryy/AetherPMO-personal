package com.aetherpms.auth;

import java.util.Map;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * 0034 — 사용자 관리(최소): 비밀번호 발급/재설정.
 * 아마란스 연동이 안 되는 자사 직원·외부 인력의 PW 로그인 경로(설계 0005 §H).
 * RBAC 시행 시 SYS_ADMIN 전용(RbacInterceptor /api/admin/users). 사용자 관리 화면은 후속.
 */
@RestController
public class AdminUserController {

    private final AuthService auth;

    public AdminUserController(AuthService auth) {
        this.auth = auth;
    }

    @PostMapping("/api/admin/users/password")
    public Map<String, Object> setPassword(@RequestBody(required = false) Map<String, Object> body) {
        String loginId = body == null || body.get("loginId") == null ? null : body.get("loginId").toString();
        String password = body == null || body.get("password") == null ? null : body.get("password").toString();
        auth.setPasswordByAdmin(loginId, password);
        return Map.of("ok", true, "loginId", loginId);
    }
}
