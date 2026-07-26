package com.aetherpms.catalog;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.aetherpms.common.ApiException;

/**
 * 0029 §C — 앱 설정(pms_app_setting) 읽기/수정.
 * 요구 0004 §4: 파일명 패턴 등 코드 체계 설정을 관리자 화면에서 수정한다.
 * 허용 키 화이트리스트 외 접근은 400. (RBAC 도입 전까지 관리자 콘솔 게이트 — 0004 §1-1 SYS_ADMIN 전용 예정)
 */
@RestController
public class AppSettingController {

    /** 편집 허용 설정 키 — 무분별한 key-value 남용 방지. */
    private static final Set<String> ALLOWED_KEYS = Set.of("deliverable.filename.pattern", "project.code.pattern");

    private final JdbcTemplate jdbc;

    public AppSettingController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/api/admin/settings/{key}")
    public Map<String, Object> get(@PathVariable("key") String key) {
        requireAllowed(key);
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT setting_key, setting_value, updated_at FROM pms_app_setting WHERE setting_key = ?", key);
        if (rows.isEmpty()) throw ApiException.notFound("설정을 찾을 수 없습니다: " + key);
        return shape(rows.get(0));
    }

    @PutMapping("/api/admin/settings/{key}")
    public Map<String, Object> put(@PathVariable("key") String key,
                                   @RequestBody(required = false) Map<String, Object> body) {
        requireAllowed(key);
        Object v = body == null ? null : body.get("value");
        if (v == null || v.toString().trim().isEmpty()) {
            throw ApiException.badRequest("value는 비울 수 없습니다.");
        }
        if ("project.code.pattern".equals(key) && !v.toString().contains("{순번}")) {
            throw ApiException.badRequest("프로젝트 코드 패턴에는 {순번} 토큰이 반드시 포함되어야 합니다(코드 유일성).");
        }
        int n = jdbc.update("UPDATE pms_app_setting SET setting_value = ? WHERE setting_key = ?",
                v.toString().trim(), key);
        if (n == 0) {
            jdbc.update("INSERT INTO pms_app_setting (setting_key, setting_value) VALUES (?, ?)",
                    key, v.toString().trim());
        }
        return get(key);
    }

    private static void requireAllowed(String key) {
        if (!ALLOWED_KEYS.contains(key)) throw ApiException.badRequest("허용되지 않는 설정 키입니다: " + key);
    }

    private static Map<String, Object> shape(Map<String, Object> row) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("key", row.get("setting_key"));
        out.put("value", row.get("setting_value"));
        out.put("updatedAt", row.get("updated_at") == null ? null : row.get("updated_at").toString());
        return out;
    }
}
