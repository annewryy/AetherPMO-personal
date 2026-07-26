package com.aetherpms.notification;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import com.aetherpms.auth.AuthContext;
import com.aetherpms.common.Json;

/**
 * 0033 — 알림 생성 핵심(수신자 person 축, 로그인 방식 무관).
 *  - 수신자 판정: 이름 → 프로젝트 참여인력 동명 1인 → 전체 person 동명 1인 → 실패 시 생략(오발송 방지)
 *  - 공통 정책(0033 §3): 본인 행위 제외 / 미읽음 중복 억제(같은 수신자·유형·엔티티는 갱신) /
 *    개인 알림 설정(유형 off) 존중 / 생성 실패는 본 트랜잭션에 전파하지 않음(로그만)
 *  - 행위자: 요청 스코프 세션(AuthContext)에서 획득 — 배치(cron·evaluate)는 행위자 없음(system).
 */
@Service
public class NotificationService {

    public static final List<String> TYPES = List.of(
            "ASSIGNED", "PROJECT_ASSIGNED", "MENTION", "REPLY", "COMMENT_ON_MINE",
            "STATUS_CHANGED", "DUE_SOON", "OVERDUE", "RULE_RISK");

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(NotificationService.class);

    private final JdbcTemplate jdbc;

    public NotificationService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 요청 스코프 세션 컨텍스트(없으면 null — 개방 모드·배치). */
    public AuthContext sessionCtx() {
        try {
            if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes ra) {
                return AuthContext.of(ra.getRequest());
            }
        } catch (RuntimeException ignored) { /* 요청 밖(배치) */ }
        return null;
    }

    /** 이름 → person 판정(0033 §2): 프로젝트 참여인력 동명 1인 → 전체 동명 1인 → null. */
    public Long resolvePersonByName(Long projectId, String name) {
        if (name == null || name.isBlank()) return null;
        try {
            if (projectId != null) {
                List<Long> m = jdbc.query(
                        "SELECT DISTINCT person_id FROM pms_project_member "
                      + "WHERE project_id = ? AND name = ? AND person_id IS NOT NULL",
                        (rs, i) -> rs.getLong(1), projectId, name.trim());
                if (m.size() == 1) return m.get(0);
                if (m.size() > 1) return null; // 프로젝트 내 동명이인 — 판정 불가
            }
            List<Long> p = jdbc.query("SELECT person_id FROM pms_person WHERE name = ?",
                    (rs, i) -> rs.getLong(1), name.trim());
            return p.size() == 1 ? p.get(0) : null;
        } catch (RuntimeException e) {
            return null;
        }
    }

    /** 알림 생성(정책 일괄 적용). recipientPersonId null이면 생략. */
    public void notifyPerson(Long recipientPersonId, String type, Long projectId,
                             String entityType, Long entityId, Long commentId, String preview) {
        try {
            if (recipientPersonId == null || entityType == null || entityId == null) return;
            AuthContext ctx = sessionCtx();
            Long actorPersonId = ctx == null ? null : ctx.personId();
            String actorName = ctx == null ? null : ctx.name();
            if (actorPersonId != null && actorPersonId.equals(recipientPersonId)) return; // 본인 행위
            if (!prefEnabled(recipientPersonId, type)) return;

            // 미읽음 중복 억제 — 같은 (수신자, 유형, 엔티티)는 최신 내용으로 갱신
            int updated = jdbc.update(
                    "UPDATE pms_notification SET preview = ?, actor_person_id = ?, actor_name = ?, "
                  + "created_at = CURRENT_TIMESTAMP(6) "
                  + "WHERE recipient_person_id = ? AND type = ? AND entity_type = ? AND entity_id = ? AND is_read = 0",
                    preview, actorPersonId, actorName, recipientPersonId, type, entityType, entityId);
            if (updated > 0) return;

            jdbc.update(
                    "INSERT INTO pms_notification (recipient_uid, recipient_person_id, type, project_id, "
                  + "entity_type, entity_id, comment_id, actor_uid, actor_person_id, actor_name, preview) "
                  + "VALUES (NULL, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)",
                    recipientPersonId, type, projectId, entityType, entityId, commentId,
                    actorPersonId, actorName, preview);
        } catch (RuntimeException e) {
            log.warn("알림 생성 실패(본 작업에는 영향 없음): type={} entity={}:{} — {}",
                    type, entityType, entityId, e.getMessage());
        }
    }

    /** 이름 기반 담당 지정 알림(ASSIGNED 등) — person 판정 실패 시 조용히 생략. */
    public void notifyByName(Long projectId, String recipientName, String type,
                             String entityType, Long entityId, String preview) {
        notifyPerson(resolvePersonByName(projectId, recipientName), type, projectId,
                entityType, entityId, null, preview);
    }

    /** 개인 알림 설정 — pms_user.notification_prefs JSON {"TYPE":false}. 계정 없음·미설정=on. */
    public boolean prefEnabled(long personId, String type) {
        try {
            List<String> rows = jdbc.query(
                    "SELECT notification_prefs FROM pms_user WHERE person_id = ? AND is_active = 1 LIMIT 1",
                    (rs, i) -> rs.getString(1), personId);
            if (rows.isEmpty() || rows.get(0) == null || rows.get(0).isBlank()) return true;
            Object parsed = Json.readObject(rows.get(0));
            if (parsed instanceof Map<?, ?> m) {
                Object v = m.get(type);
                return !(Boolean.FALSE.equals(v) || "false".equals(String.valueOf(v)));
            }
        } catch (RuntimeException ignored) { /* 설정 파싱 실패 → on */ }
        return true;
    }

    // ================= 3차 — 마감 스윕·보존(일 1회, signals/evaluate 편승) =================

    /** 마감 D-1·당일(DUE_SOON)/기한 경과(OVERDUE) 알림 + 읽음 90일 경과분 삭제. */
    public Map<String, Object> dailySweep() {
        int[] created = {0};
        record Target(String table, String idCol, String dueCol, String nameCol, String entityType,
                      String openCond, String titleCol) {}
        List<Target> targets = List.of(
                new Target("pms_task", "task_id", "planned_end_date", "assignee_name", "TASK",
                        "e.status <> 'DONE' AND COALESCE(e.progress_rate,0) < 100", "task_name"),
                new Target("pms_action_item", "action_id", "due_date", "assignee_name", "ACTION_ITEM",
                        "COALESCE(e.status,'대기') <> '완료'", "title"),
                new Target("pms_issue", "issue_id", "due_date", "owner_name", "ISSUE",
                        "COALESCE(e.status,'발생') <> '완료'", "title"),
                new Target("pms_deliverable", "deliverable_id", "due_date", "author_name", "DELIVERABLE",
                        "e.submitted_at IS NULL AND e.status <> 'APPROVED'", "deliverable_name"));
        for (Target t : targets) {
            try {
                List<Map<String, Object>> rows = jdbc.queryForList(
                        "SELECT e." + t.idCol() + " AS id, e.project_id, e." + t.nameCol() + " AS assignee, "
                      + "e." + t.dueCol() + " AS due, e." + t.titleCol() + " AS title "
                      + "FROM " + t.table() + " e JOIN pms_project p ON p.project_id = e.project_id "
                      + "WHERE p.status <> '완료' AND e." + t.nameCol() + " IS NOT NULL "
                      + "AND e." + t.dueCol() + " IS NOT NULL AND e." + t.dueCol() + " <= DATE_ADD(CURDATE(), INTERVAL 1 DAY) "
                      + "AND " + t.openCond());
                for (Map<String, Object> r : rows) {
                    String due = String.valueOf(r.get("due"));
                    boolean overdue = due.compareTo(java.time.LocalDate.now().toString()) < 0;
                    String type = overdue ? "OVERDUE" : "DUE_SOON";
                    String preview = (overdue ? "기한 경과: " : "마감 임박(" + due + "): ") + r.get("title");
                    Long pid = ((Number) r.get("project_id")).longValue();
                    Long before = count();
                    notifyByName(pid, String.valueOf(r.get("assignee")), type,
                            t.entityType(), ((Number) r.get("id")).longValue(), preview);
                    if (count() > before) created[0]++;
                }
            } catch (RuntimeException e) {
                log.warn("마감 스윕 실패({}): {}", t.table(), e.getMessage());
            }
        }
        int purged = jdbc.update(
                "DELETE FROM pms_notification WHERE is_read = 1 AND created_at < DATE_SUB(NOW(), INTERVAL 90 DAY)");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("dueNotifications", created[0]);
        out.put("purgedRead", purged);
        return out;
    }

    private Long count() {
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM pms_notification", Long.class);
        return n == null ? 0 : n;
    }
}
