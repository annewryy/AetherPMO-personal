package com.aetherpms.auth;

import java.util.Map;

import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * 0031 §B — Bearer 토큰 → AuthContext를 request attribute에 세팅(모든 요청).
 * 인가(차단)는 RbacInterceptor가 담당. 여기서는 신원 확인만(미인증도 통과).
 */
@Component
public class AuthInterceptor implements HandlerInterceptor {

    private final AuthService auth;

    public AuthInterceptor(AuthService auth) {
        this.auth = auth;
    }

    @Override
    public boolean preHandle(HttpServletRequest req, HttpServletResponse res, Object handler) {
        String token = AuthController.bearer(req);
        Map<String, Object> u = token == null ? null : auth.resolveByToken(token);
        if (u != null) {
            req.setAttribute(AuthContext.ATTR, new AuthContext(
                    ((Number) u.get("id")).longValue(),
                    str(u.get("username")), str(u.get("role")),
                    u.get("personId") == null ? null : ((Number) u.get("personId")).longValue(),
                    str(u.get("name"))));
        }
        return true;
    }

    private static String str(Object o) { return o == null ? null : o.toString(); }
}
