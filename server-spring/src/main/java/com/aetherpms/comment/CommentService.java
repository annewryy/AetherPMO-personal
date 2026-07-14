package com.aetherpms.comment;

import com.aetherpms.common.RowMappers;

import com.aetherpms.common.WriteSupport;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.aetherpms.common.Actor;
import com.aetherpms.common.ApiException;

/**
 * 0010 A-3 범용 코멘트 + 0012 답글·@멘션·알림. Node routes/comments-routes.ts 이식.
 * GET  /api/{entity}/{id}/comments
 * POST /api/{entity}/{id}/comments { body, parentCommentId?, mentions? } — 작성 + 알림
 */
@Service
public class CommentService {

    private final JdbcTemplate jdbc;

    public CommentService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final Pattern UUID_RE = Pattern.compile(
            "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", Pattern.CASE_INSENSITIVE);
    private static final Pattern MENTION_RE = Pattern.compile("@\\[([^\\]]+)\\]\\([0-9a-f-]+\\)",
            Pattern.CASE_INSENSITIVE);
    private static final int PREVIEW_MAX = 120;

    private record EntityConfig(String table, String idCol, String entityType) {}

    private static EntityConfig config(String entity) {
        return switch (entity) {
            case "tasks" -> new EntityConfig("pms_task", "task_id", "TASK");
            case "deliverables" -> new EntityConfig("pms_deliverable", "deliverable_id", "DELIVERABLE");
            case "issues" -> new EntityConfig("pms_issue", "issue_id", "ISSUE");
            case "action-items" -> new EntityConfig("pms_action_item", "action_id", "ACTION_ITEM");
            default -> throw ApiException.badRequest("지원하지 않는 엔티티입니다: " + entity
                    + " (지원: tasks, deliverables, issues, action-items)");
        };
    }

    static String toPreview(String body) {
        String stripped = MENTION_RE.matcher(body).replaceAll("@$1").trim();
        return stripped.length() > PREVIEW_MAX ? stripped.substring(0, PREVIEW_MAX) + "…" : stripped;
    }

    private Map<String, Object> fetchEntity(EntityConfig cfg, long id) {
        Map<String, Object> row = WriteSupport.findOne(jdbc, cfg.table(), cfg.idCol(), id);
        if (row == null) throw ApiException.notFound("대상 엔티티를 찾을 수 없습니다.");
        return row;
    }

    // =====================================================================
    // GET /api/{entity}/{id}/comments
    // =====================================================================

    public List<Map<String, Object>> list(String entity, long id) {
        EntityConfig cfg = config(entity);
        WriteSupport.parseId(id);
        fetchEntity(cfg, id);
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT comment_id, entity_type, entity_id, project_id, body, comment_type, "
              + "status_from, status_to, parent_comment_id, author_uid, author_name, created_at "
              + "FROM pms_comment WHERE entity_type = ? AND entity_id = ? ORDER BY created_at ASC",
                cfg.entityType(), id);
        return rows.stream().map(RowMappers::mapComment).toList();
    }

    // =====================================================================
    // POST /api/{entity}/{id}/comments
    // =====================================================================

    @Transactional
    public Map<String, Object> create(String entity, long id, Map<String, Object> raw, Actor actor) {
        EntityConfig cfg = config(entity);
        WriteSupport.parseId(id);

        // ---- 페이로드 검증 ----
        Object bodyRaw = raw == null ? null : raw.get("body");
        String body = bodyRaw instanceof String s ? s.trim() : "";
        if (body.isEmpty()) throw ApiException.badRequest("코멘트 본문이 필요합니다.");

        Long parentCommentId = null;
        if (raw.get("parentCommentId") != null) {
            Integer p = WriteSupport.intOrNull(raw.get("parentCommentId"));
            if (p == null || p <= 0) throw ApiException.badRequest("parentCommentId는 양의 정수여야 합니다.");
            parentCommentId = (long) p;
        }

        List<String> mentions = new ArrayList<>();
        if (raw.get("mentions") != null) {
            if (!(raw.get("mentions") instanceof List)) {
                throw ApiException.badRequest("mentions는 uuid 문자열 배열이어야 합니다.");
            }
            LinkedHashSet<String> seen = new LinkedHashSet<>();
            for (Object m : (List<?>) raw.get("mentions")) {
                String s = String.valueOf(m).toLowerCase();
                if (!UUID_RE.matcher(s).matches()) {
                    throw ApiException.badRequest("mentions에 유효하지 않은 uuid가 있습니다: " + m);
                }
                seen.add(s);
            }
            mentions.addAll(seen);
        }

        Map<String, Object> entityRow = fetchEntity(cfg, id);
        long projectId = ((Number) entityRow.get("project_id")).longValue();

        // ---- 답글 부모 검증 ----
        String parentAuthorUid = null;
        if (parentCommentId != null) {
            List<Map<String, Object>> prows = jdbc.queryForList(
                    "SELECT comment_id, entity_type, entity_id, author_uid, parent_comment_id "
                  + "FROM pms_comment WHERE comment_id = ?", parentCommentId);
            if (prows.isEmpty()) throw ApiException.notFound("부모 코멘트를 찾을 수 없습니다.");
            Map<String, Object> parent = prows.get(0);
            if (!cfg.entityType().equals(parent.get("entity_type"))
                    || ((Number) parent.get("entity_id")).longValue() != id) {
                throw ApiException.badRequest("부모 코멘트가 대상 엔티티와 일치하지 않습니다.");
            }
            parentAuthorUid = str(parent.get("author_uid"));
        }

        // ---- 코멘트 삽입 ----
        jdbc.update(
                "INSERT INTO pms_comment (entity_type, entity_id, project_id, body, comment_type, "
              + "parent_comment_id, author_uid, author_name, created_at) "
              + "VALUES (?, ?, ?, ?, 'COMMENT', ?, ?, ?, CURRENT_TIMESTAMP(6))",
                cfg.entityType(), id, projectId, body, parentCommentId, actor.userId(), null);
        Long commentId = jdbc.queryForObject("SELECT LAST_INSERT_ID()", Long.class);

        String preview = toPreview(body);
        String actorName = resolveActorName(projectId, actor.userId());

        LinkedHashSet<String> notified = new LinkedHashSet<>();
        for (String uid : mentions) {
            if (actor.userId() != null && uid.equals(actor.userId().toLowerCase())) continue;
            if (notified.contains(uid)) continue;
            insertNotification(uid, "MENTION", projectId, cfg.entityType(), id, commentId,
                    actor.userId(), actorName, preview);
            notified.add(uid);
        }
        if (parentAuthorUid != null) {
            String parentLc = parentAuthorUid.toLowerCase();
            boolean isSelf = actor.userId() != null && parentLc.equals(actor.userId().toLowerCase());
            if (!isSelf && !notified.contains(parentLc)) {
                insertNotification(parentAuthorUid, "REPLY", projectId, cfg.entityType(), id, commentId,
                        actor.userId(), actorName, preview);
            }
        }

        Map<String, Object> created = WriteSupport.findOne(jdbc, "pms_comment", "comment_id", commentId);
        return RowMappers.mapComment(created);
    }

    private String resolveActorName(long projectId, String actorUid) {
        if (actorUid == null) return null;
        List<String> rows = jdbc.query(
                "SELECT name FROM pms_project_member WHERE project_id = ? AND user_uid = ? "
              + "ORDER BY COALESCE(is_active, 1) DESC LIMIT 1",
                (rs, i) -> rs.getString("name"), projectId, actorUid);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private void insertNotification(String recipientUid, String type, long projectId, String entityType,
                                    long entityId, Long commentId, String actorUid, String actorName, String preview) {
        jdbc.update(
                "INSERT INTO pms_notification (recipient_uid, type, project_id, entity_type, entity_id, "
              + "comment_id, actor_uid, actor_name, preview) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                recipientUid, type, projectId, entityType, entityId, commentId, actorUid, actorName, preview);
    }

    private static String str(Object o) { return o == null ? null : o.toString(); }
}
