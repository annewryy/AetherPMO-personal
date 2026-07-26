package com.aetherpms.auth;

import java.util.List;
import java.util.Set;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import com.aetherpms.common.ApiException;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * 0031 §C — 경로·메서드 기반 RBAC(첫 슬라이스).
 *   시행 스위치 pms_app_setting('rbac.enforce')=false면 게이트 안 함(dev 점진 적용).
 *   ON일 때:
 *    - 쓰기(POST/PATCH/PUT/DELETE)는 인증 필수(401). /api/auth/* 예외.
 *    - 방법론·시스템 마스터 경로는 SYS_ADMIN 전용(403).
 *   읽기(GET)·기타 세부 스코프는 프론트 게이트 + 후속 배치.
 */
@Component
public class RbacInterceptor implements HandlerInterceptor {

    /** SYS_ADMIN 전용 경로 prefix(0004 §1-1: 방법론·시스템 마스터). */
    private static final List<String> SYS_ADMIN_PREFIXES = List.of(
            "/api/catalog/nodes", "/api/doc-templates", "/api/admin/settings",
            "/api/workflows", "/api/signal-rules");
    private static final Set<String> WRITE = Set.of("POST", "PATCH", "PUT", "DELETE");

    private final JdbcTemplate jdbc;

    public RbacInterceptor(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public boolean preHandle(HttpServletRequest req, HttpServletResponse res, Object handler) {
        if (!enforce()) return true;
        String path = req.getRequestURI();
        String method = req.getMethod();
        if (path.startsWith("/api/auth/")) return true;

        AuthContext ctx = AuthContext.of(req);
        boolean write = WRITE.contains(method);
        boolean sysAdminPath = SYS_ADMIN_PREFIXES.stream().anyMatch(path::startsWith);

        if (write && ctx == null) {
            throw ApiException.unauthorized("로그인이 필요합니다.");
        }
        if (sysAdminPath && write) {
            if (ctx == null) throw ApiException.unauthorized("로그인이 필요합니다.");
            if (!ctx.isSysAdmin()) {
                throw ApiException.forbidden("이 작업은 시스템 관리자(SYS_ADMIN)만 수행할 수 있습니다.");
            }
        }
        return true;
    }

    private boolean enforce() {
        try {
            String v = jdbc.queryForObject(
                    "SELECT setting_value FROM pms_app_setting WHERE setting_key = 'rbac.enforce'", String.class);
            return "true".equalsIgnoreCase(v);
        } catch (Exception e) {
            return false; // 설정 없으면 미시행(안전 기본 — dev)
        }
    }
}
