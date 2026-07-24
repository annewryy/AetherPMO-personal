package com.aetherpms.auth;

import jakarta.servlet.http.HttpServletRequest;

/**
 * 0031 — 요청 스코프 인증 컨텍스트. AuthInterceptor가 request attribute에 세팅,
 * CurrentActor·RbacInterceptor가 읽는다. 세션 사용자(userUid 대체) + 역할.
 */
public record AuthContext(long userId, String username, String role, Long personId, String name) {

    public static final String ATTR = "aether.auth";

    public static AuthContext of(HttpServletRequest req) {
        Object v = req == null ? null : req.getAttribute(ATTR);
        return v instanceof AuthContext ac ? ac : null;
    }

    public boolean isSysAdmin() { return "SYS_ADMIN".equals(role); }
}
