package com.aetherpms.notification;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.aetherpms.auth.AuthContext;
import com.aetherpms.common.Actor;
import com.aetherpms.common.ApiException;
import com.aetherpms.common.CurrentActor;
import com.aetherpms.common.Json;
import com.aetherpms.common.RowMappers;
import com.aetherpms.common.WriteSupport;

import jakarta.servlet.http.HttpServletRequest;

/**
 * 0012 B-3 → 0033 개정 — 알림 API(수신자 person 축, 로그인 방식 무관).
 *   GET   /api/notifications           — 세션 person(아마란스·자체 공통) 또는 레거시 X-User-Id
 *   PATCH /api/notifications/{id}/read / POST /api/notifications/read-all
 *   GET/PUT /api/me/notification-prefs — 유형별 on/off(3차, pms_user.notification_prefs)
 */
@RestController
public class NotificationController {

    private static final String COLS =
            "notification_id, recipient_uid, recipient_person_id, type, project_id, entity_type, entity_id, "
          + "comment_id, actor_uid, actor_person_id, actor_name, preview, is_read, created_at";

    private final JdbcTemplate jdbc;

    public NotificationController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 수신자 조건 — 세션 person 우선, 없으면 레거시 uid. (조건 SQL, 인자) */
    private record Recipient(String cond, Object arg) {}

    private Recipient recipient(HttpServletRequest req, boolean required) {
        AuthContext ctx = AuthContext.of(req);
        if (ctx != null && ctx.personId() != null) {
            return new Recipient("recipient_person_id = ?", ctx.personId());
        }
        Actor actor = CurrentActor.resolve(req);
        if (actor.userId() != null) {
            return new Recipient("recipient_uid = ?", actor.userId());
        }
        if (ctx != null) {
            // 로그인은 했으나 person 미연결 — 수신함이 비어 있는 상태(0033 §2: 관리자 연결 필요)
            return new Recipient("1 = 0", 0);
        }
        if (required) throw ApiException.unauthorized("로그인이 필요합니다.");
        return null;
    }

    @GetMapping("/api/notifications")
    public List<Map<String, Object>> list(HttpServletRequest req) {
        Recipient r = recipient(req, false);
        if (r == null) return List.of();
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT " + COLS + " FROM pms_notification WHERE " + r.cond()
              + " ORDER BY is_read ASC, created_at DESC LIMIT 100", r.arg());
        return rows.stream().map(RowMappers::mapNotification).toList();
    }

    @PatchMapping("/api/notifications/{id}/read")
    public Map<String, Object> markRead(@PathVariable("id") long id, HttpServletRequest req) {
        Recipient r = recipient(req, true);
        WriteSupport.parseId(id);
        int updated = jdbc.update(
                "UPDATE pms_notification SET is_read = 1 WHERE notification_id = ? AND " + r.cond(),
                id, r.arg());
        if (updated == 0) throw ApiException.notFound("알림을 찾을 수 없습니다.");
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT " + COLS + " FROM pms_notification WHERE notification_id = ?", id);
        return RowMappers.mapNotification(rows.get(0));
    }

    @PostMapping("/api/notifications/read-all")
    public Map<String, Object> markAllRead(HttpServletRequest req) {
        Recipient r = recipient(req, true);
        int updated = jdbc.update(
                "UPDATE pms_notification SET is_read = 1 WHERE is_read = 0 AND " + r.cond(), r.arg());
        return Map.of("updated", updated);
    }

    // ---- 0033 3차 — 개인 알림 설정(유형별 on/off) --------------------------------

    @GetMapping("/api/me/notification-prefs")
    public Map<String, Object> getPrefs(HttpServletRequest req) {
        AuthContext ctx = AuthContext.of(req);
        if (ctx == null) throw ApiException.unauthorized("로그인이 필요합니다.");
        Map<String, Object> prefs = new LinkedHashMap<>();
        for (String t : NotificationService.TYPES) prefs.put(t, true);
        List<String> rows = jdbc.query("SELECT notification_prefs FROM pms_user WHERE user_id = ?",
                (rs, i) -> rs.getString(1), ctx.userId());
        if (!rows.isEmpty() && rows.get(0) != null && !rows.get(0).isBlank()
                && Json.readObject(rows.get(0)) instanceof Map<?, ?> m) {
            for (Map.Entry<?, ?> e : m.entrySet()) {
                if (prefs.containsKey(String.valueOf(e.getKey()))) {
                    prefs.put(String.valueOf(e.getKey()), !Boolean.FALSE.equals(e.getValue()));
                }
            }
        }
        return Map.of("prefs", prefs, "types", NotificationService.TYPES);
    }

    @PutMapping("/api/me/notification-prefs")
    public Map<String, Object> putPrefs(@RequestBody(required = false) Map<String, Object> body,
                                        HttpServletRequest req) {
        AuthContext ctx = AuthContext.of(req);
        if (ctx == null) throw ApiException.unauthorized("로그인이 필요합니다.");
        if (body == null) throw ApiException.badRequest("변경할 설정이 없습니다.");
        List<String> unknown = body.keySet().stream()
                .filter(k -> !NotificationService.TYPES.contains(k)).toList();
        if (!unknown.isEmpty()) {
            throw ApiException.badRequest("허용되지 않는 알림 유형: " + String.join(", ", unknown)
                    + " (허용: " + String.join(", ", NotificationService.TYPES) + ")");
        }
        Map<String, Object> store = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : body.entrySet()) {
            boolean on = !(Boolean.FALSE.equals(e.getValue()) || "false".equals(String.valueOf(e.getValue())));
            if (!on) store.put(e.getKey(), false); // on이 기본 — off만 저장
        }
        jdbc.update("UPDATE pms_user SET notification_prefs = ? WHERE user_id = ?",
                store.isEmpty() ? null : Json.write(store), ctx.userId());
        return getPrefs(req);
    }
}
