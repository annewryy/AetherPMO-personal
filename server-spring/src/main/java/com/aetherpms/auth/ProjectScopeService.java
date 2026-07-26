package com.aetherpms.auth;

import java.util.HashSet;
import java.util.Map;
import java.util.Set;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import com.aetherpms.common.ApiException;

/**
 * 0035 — 참여 프로젝트 스코프(0004 §1-2): PM/WORKER는 자신이 참여인력으로 등록된
 * 프로젝트만 조회. SYS_ADMIN/EXEC_ADMIN/VIEWER는 전체 조회(VIEWER는 읽기 전용).
 * 판정 키 = pms_user.person_id ↔ pms_project_member.person_id (V22 백필 + 관리자 수동 연결).
 * rbac.enforce OFF이거나 비로그인(개방 모드)일 땐 스코프 미적용.
 */
@Service
public class ProjectScopeService {

    private final JdbcTemplate jdbc;

    public ProjectScopeService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private boolean enforce() {
        try {
            String v = jdbc.queryForObject(
                    "SELECT setting_value FROM pms_app_setting WHERE setting_key = 'rbac.enforce'", String.class);
            return "true".equalsIgnoreCase(v);
        } catch (Exception e) {
            return false;
        }
    }

    /** 이 컨텍스트가 참여 스코프 대상인가(PM/WORKER + 시행 중 + 로그인). */
    public boolean isScoped(AuthContext ctx) {
        return enforce() && ctx != null && ("PM".equals(ctx.role()) || "WORKER".equals(ctx.role()));
    }

    /** 참여(참여인력 등록) 프로젝트 id 집합 — person 미연결 사용자는 빈 집합(관리자 연결 필요). */
    public Set<Long> memberProjectIds(AuthContext ctx) {
        Set<Long> out = new HashSet<>();
        if (ctx == null || ctx.personId() == null) return out;
        jdbc.query("SELECT DISTINCT project_id FROM pms_project_member WHERE person_id = ? AND is_active = 1",
                rs -> { out.add(rs.getLong(1)); }, ctx.personId());
        return out;
    }

    /** 상세 접근 가드 — 스코프 대상인데 비참여 프로젝트면 403. */
    public void assertCanView(AuthContext ctx, long projectId) {
        if (!isScoped(ctx)) return;
        if (!memberProjectIds(ctx).contains(projectId)) {
            throw ApiException.forbidden("참여 중인 프로젝트만 조회할 수 있습니다. (참여인력 등록 필요)");
        }
    }

    // ================= 쓰기 가드 (0032 §5②) =================

    /** WORKER의 항목 쓰기 정책 — 매트릭스(0032 §3·§4) 기준. */
    public enum WorkerPolicy { NONE, PARTICIPANT, ASSIGNEE }

    /** 엔티티 경로 → 테이블·프로젝트 판정 규칙. */
    private record EntityRule(String table, String idCol, String assigneeCol, WorkerPolicy worker) {}

    private static final Map<String, EntityRule> RULES = Map.of(
            "tasks", new EntityRule("pms_task", "task_id", "assignee_name", WorkerPolicy.ASSIGNEE),
            "issues", new EntityRule("pms_issue", "issue_id", "owner_name", WorkerPolicy.PARTICIPANT),
            "action-items", new EntityRule("pms_action_item", "action_id", "assignee_name", WorkerPolicy.ASSIGNEE),
            "deliverables", new EntityRule("pms_deliverable", "deliverable_id", "author_name", WorkerPolicy.ASSIGNEE),
            "meeting-minutes", new EntityRule("pms_meeting_minutes", "meeting_id", null, WorkerPolicy.PARTICIPANT),
            "official-docs", new EntityRule("pms_official_doc", "doc_id", null, WorkerPolicy.NONE));

    private boolean scopedWriter(AuthContext ctx) {
        return enforce() && ctx != null && ("PM".equals(ctx.role()) || "WORKER".equals(ctx.role()));
    }

    /** 프로젝트 자체 수정(PATCH·전환·전이·멤버 관리 등) — PM은 담당(is_project_manager=1)만, WORKER 불가. */
    public void assertCanEditProject(AuthContext ctx, long projectId) {
        if (!scopedWriter(ctx)) return;
        if ("WORKER".equals(ctx.role())) {
            throw ApiException.forbidden("프로젝트 정보는 PM·관리자만 수정할 수 있습니다.");
        }
        Long n = ctx.personId() == null ? 0L : jdbc.queryForObject(
                "SELECT COUNT(*) FROM pms_project_member WHERE project_id = ? AND person_id = ? AND is_active = 1 AND is_project_manager = 1",
                Long.class, projectId, ctx.personId());
        if (n == null || n == 0) {
            throw ApiException.forbidden("담당(PM) 프로젝트만 수정할 수 있습니다.");
        }
    }

    /** PM의 프로젝트 멤버 관리(0032 §1: PM 역할 정의) — 참여 프로젝트면 허용, WORKER 불가. */
    public void assertCanManageMembers(AuthContext ctx, long projectId) {
        if (!scopedWriter(ctx)) return;
        if ("WORKER".equals(ctx.role())) {
            throw ApiException.forbidden("참여인력 관리는 PM·관리자만 수행할 수 있습니다.");
        }
        if (!memberProjectIds(ctx).contains(projectId)) {
            throw ApiException.forbidden("참여 중인 프로젝트의 참여인력만 관리할 수 있습니다.");
        }
    }

    /** 기존 항목 쓰기 가드 — 엔티티 경로+id로 프로젝트·담당자를 찾아 판정. */
    public void assertItemWrite(AuthContext ctx, String entityPath, long id) {
        if (!scopedWriter(ctx)) return;
        EntityRule rule = RULES.get(entityPath);
        if (rule == null) return; // 미등록 엔티티는 전역 규칙(VIEWER 차단)만 적용
        String assigneeSel = rule.assigneeCol() == null ? "NULL" : rule.assigneeCol();
        Map<String, Object> row;
        try {
            row = jdbc.queryForMap("SELECT project_id, " + assigneeSel + " AS assignee FROM "
                    + rule.table() + " WHERE " + rule.idCol() + " = ?", id);
        } catch (Exception e) {
            return; // 대상 없음 — 404는 본 서비스가 아니라 도메인 로직이 낸다
        }
        Object pid = row.get("project_id");
        if (pid == null) return;
        assertItemCreate(ctx, ((Number) pid).longValue(), entityPath,
                row.get("assignee") == null ? null : row.get("assignee").toString());
    }

    /** 신규 항목 생성 가드 — 요청 본문의 projectId(없으면 도메인 검증에 위임)로 판정. */
    public void assertItemCreateBody(AuthContext ctx, Map<String, Object> body, String entityPath) {
        if (!scopedWriter(ctx) || body == null) return;
        // 생성 API는 camelCase(이슈 등)·snake_case(액션아이템·회의록 등)가 혼재 — 둘 다 수용
        Object pid = body.get("projectId") != null ? body.get("projectId") : body.get("project_id");
        if (pid == null) return;
        long projectId;
        try {
            projectId = Long.parseLong(String.valueOf(pid));
        } catch (NumberFormatException e) {
            return;
        }
        Object an = body.get("assigneeName") != null ? body.get("assigneeName") : body.get("assignee_name");
        assertItemCreate(ctx, projectId, entityPath, an == null ? null : String.valueOf(an));
    }

    /** 신규 항목 생성 가드(projectId를 요청 본문에서 받은 경우) 겸 공통 판정. */
    public void assertItemCreate(AuthContext ctx, long projectId, String entityPath, String assigneeName) {
        if (!scopedWriter(ctx)) return;
        EntityRule rule = RULES.get(entityPath);
        WorkerPolicy policy = rule == null ? WorkerPolicy.PARTICIPANT : rule.worker();
        if (!memberProjectIds(ctx).contains(projectId)) {
            throw ApiException.forbidden("참여 중인 프로젝트의 항목만 작성·수정할 수 있습니다.");
        }
        if ("PM".equals(ctx.role())) return;
        // WORKER
        switch (policy) {
            case NONE -> throw ApiException.forbidden("이 항목은 PM·관리자만 작성·수정할 수 있습니다.");
            case PARTICIPANT -> { /* 참여 확인으로 충분 */ }
            case ASSIGNEE -> {
                String myName = ctx.personId() == null ? null : jdbc.queryForObject(
                        "SELECT name FROM pms_person WHERE person_id = ?", String.class, ctx.personId());
                boolean mine = assigneeName != null && assigneeName.equals(myName);
                if (!mine) throw ApiException.forbidden("본인 담당 항목만 수정할 수 있습니다.");
            }
        }
    }
}
