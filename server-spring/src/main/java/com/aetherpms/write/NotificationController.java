package com.aetherpms.write;

import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import com.aetherpms.common.Actor;
import com.aetherpms.common.ApiException;
import com.aetherpms.common.CurrentActor;

import jakarta.servlet.http.HttpServletRequest;

/**
 * 0012 B-3 알림 API — Node routes/mentions-routes.ts 이식.
 *   GET   /api/notifications          — recipient(X-User-Id), 미읽음 우선→최신순
 *   PATCH /api/notifications/{id}/read — 본인 알림 읽음
 *   POST  /api/notifications/read-all  — 본인 전체 읽음
 * (GET /api/projects/{id}/members 는 배치1 ReadController에 이미 존재)
 */
@RestController
public class NotificationController {

    private static final String COLS =
            "notification_id, recipient_uid, type, project_id, entity_type, entity_id, comment_id, "
          + "actor_uid, actor_name, preview, is_read, created_at";

    private final JdbcTemplate jdbc;

    public NotificationController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/api/notifications")
    public List<Map<String, Object>> list(HttpServletRequest req) {
        Actor actor = CurrentActor.resolve(req);
        if (actor.userId() == null) return List.of(); // dev 선택기 미설정 → 빈 목록
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT " + COLS + " FROM pms_notification WHERE recipient_uid = ? "
              + "ORDER BY is_read ASC, created_at DESC", actor.userId());
        return rows.stream().map(RowMappers::mapNotification).toList();
    }

    @PatchMapping("/api/notifications/{id}/read")
    public Map<String, Object> markRead(@PathVariable long id, HttpServletRequest req) {
        Actor actor = CurrentActor.resolve(req);
        if (actor.userId() == null) throw ApiException.unauthorized("현재 사용자(X-User-Id)가 필요합니다.");
        WriteSupport.parseId(id);
        int updated = jdbc.update(
                "UPDATE pms_notification SET is_read = 1 WHERE notification_id = ? AND recipient_uid = ?",
                id, actor.userId());
        if (updated == 0) throw ApiException.notFound("알림을 찾을 수 없습니다.");
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT " + COLS + " FROM pms_notification WHERE notification_id = ? AND recipient_uid = ?",
                id, actor.userId());
        return RowMappers.mapNotification(rows.get(0));
    }

    @PostMapping("/api/notifications/read-all")
    public Map<String, Object> markAllRead(HttpServletRequest req) {
        Actor actor = CurrentActor.resolve(req);
        if (actor.userId() == null) throw ApiException.unauthorized("현재 사용자(X-User-Id)가 필요합니다.");
        int updated = jdbc.update(
                "UPDATE pms_notification SET is_read = 1 WHERE recipient_uid = ? AND is_read = 0",
                actor.userId());
        return Map.of("updated", updated);
    }
}
