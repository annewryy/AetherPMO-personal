package com.aetherpms.auth;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import com.aetherpms.access.AccessRuleService;
import com.aetherpms.access.CapabilityMerge;
import com.aetherpms.common.ApiException;
import com.aetherpms.common.Json;
import com.aetherpms.org.OrgTreeService;

/**
 * 0034 — 참여 프로젝트 스코프(①메뉴는 AccessRuleService, 여기는 ②관리포인트) + 0032 잔여 시행 지점.
 * SYS_ADMIN/VIEWER는 항상 우회(VIEWER는 RbacInterceptor가 전역 쓰기 차단). 그 외 전 계정은
 * ③ 접근 규칙(부서×직책×인력구분)과 ④ 참여역할(participation_role)을 OR 결합해 판정한다
 * (0034 §3). 판정 키 = pms_user.person_id ↔ pms_project_member.person_id.
 */
@Service
public class ProjectScopeService {

    private final JdbcTemplate jdbc;
    private final AccessRuleService accessRuleService;
    private final OrgTreeService orgTree;

    public ProjectScopeService(JdbcTemplate jdbc, AccessRuleService accessRuleService,
            OrgTreeService orgTree) {
        this.jdbc = jdbc;
        this.accessRuleService = accessRuleService;
        this.orgTree = orgTree;
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

    /** SYS_ADMIN/VIEWER는 항상 우회. 그 외 로그인 계정은 전부 ③/④ 판정 대상(0034 §5 결정4). */
    public boolean isScoped(AuthContext ctx) {
        return enforce() && ctx != null && !ctx.isSysAdmin() && !"VIEWER".equals(ctx.role());
    }

    /** 참여(참여인력 등록) 프로젝트 id 집합 — person 미연결 사용자는 빈 집합(관리자 연결 필요). */
    public Set<Long> memberProjectIds(AuthContext ctx) {
        Set<Long> out = new HashSet<>();
        if (ctx == null || ctx.personId() == null) return out;
        jdbc.query("SELECT DISTINCT project_id FROM pms_project_member WHERE person_id = ? AND is_active = 1",
                rs -> { out.add(rs.getLong(1)); }, ctx.personId());
        return out;
    }

    // ================= ③ 규칙 기반 조회 범위(ALL/DEPT/PARTICIPATING) =================

    /** 매칭 규칙들의 project_scope 중 가장 허용적인 값(기본 PARTICIPATING). */
    private String scopeMode(AuthContext ctx) {
        if (ctx == null) return "PARTICIPATING";
        String mode = "PARTICIPATING";
        for (Map<String, Object> rule : accessRuleService.matchedRulesFor(ctx.personId())) {
            mode = CapabilityMerge.mergeScope(mode, String.valueOf(rule.get("project_scope")));
        }
        return mode;
    }

    /** DEPT 범위로 열리는 프로젝트 id(프로젝트 담당부서가 매칭 규칙의 부서(하위 포함)에 속함). */
    private Set<Long> deptScopeProjectIds(AuthContext ctx) {
        Set<Long> out = new HashSet<>();
        if (ctx == null) return out;
        for (Map<String, Object> rule : accessRuleService.matchedRulesFor(ctx.personId())) {
            if (!"DEPT".equals(rule.get("project_scope"))) continue;
            String deptCode = (String) rule.get("dept_code");
            if (deptCode == null) continue;
            // 0042 — 예전엔 AccessRuleService의 pass-through(expandDeptNamesPublic)를 거쳤다.
            //   부서 전개의 주인은 org 도메인이므로 OrgTreeService를 직접 쓴다.
            //
            // ⚠️ 여기만 아직 **이름** 비교다. 비교 대상이 pms_person이 아니라 pms_project.dept
            //   (프로젝트 담당부서, VARCHAR(200) 자유 문자열)이고 그 컬럼엔 부서 코드가 없다.
            //   조직도에 동명 부서가 흔하므로(재무팀 6개 등) 이름이 겹치는 다른 부서의 프로젝트가
            //   DEPT 범위에 함께 열릴 수 있다. 인력 축은 5단계에서 코드로 옮겼고,
            //   프로젝트 축은 pms_project.dept_code 도입이 선행돼야 한다(별도 과제).
            Set<String> names = orgTree.subtreeNames(deptCode,
                    !Boolean.FALSE.equals(rule.get("include_sub")));
            if (names.isEmpty()) continue;
            String placeholders = String.join(",", names.stream().map(n -> "?").toList());
            jdbc.query("SELECT project_id FROM pms_project WHERE dept IN (" + placeholders + ")",
                    rs -> { out.add(rs.getLong(1)); }, names.toArray());
        }
        return out;
    }

    /** projectId가 이 사용자의 ③ 규칙(ALL/DEPT) 범위로 이미 열려 있는가(참여와 별개). */
    private boolean coveredByRuleScope(AuthContext ctx, long projectId) {
        String mode = scopeMode(ctx);
        if ("ALL".equals(mode)) return true;
        if ("DEPT".equals(mode)) return deptScopeProjectIds(ctx).contains(projectId);
        return false;
    }

    /** 목록 필터용 — null=제한 없음(ALL), 아니면 이 id들만 보임(PARTICIPATING∪DEPT). */
    public Set<Long> visibleProjectIdsOrNull(AuthContext ctx) {
        if (!isScoped(ctx)) return null;
        String mode = scopeMode(ctx);
        if ("ALL".equals(mode)) return null;
        Set<Long> visible = new HashSet<>(memberProjectIds(ctx));
        if ("DEPT".equals(mode)) visible.addAll(deptScopeProjectIds(ctx));
        return visible;
    }

    /** 상세 접근 가드 — 스코프 대상인데 규칙 범위 밖 + 비참여면 403. */
    public void assertCanView(AuthContext ctx, long projectId) {
        if (!isScoped(ctx)) return;
        if (coveredByRuleScope(ctx, projectId) || memberProjectIds(ctx).contains(projectId)) return;
        throw ApiException.forbidden("참여 중인 프로젝트만 조회할 수 있습니다. (참여인력 등록 필요)");
    }

    /**
     * 0034 §0단계 — 집계/위젯 응답 필터: 각 행의 "projectId" 키를 참여 집합과 대조해 걸러낸다.
     * 비스코프 대상(관리자 등)은 원본 그대로 반환. projectId가 null인 행(전역 항목)은 통과.
     */
    public List<Map<String, Object>> visibleOnly(AuthContext ctx, List<Map<String, Object>> rows) {
        if (!isScoped(ctx) || rows == null) return rows;
        String mode = scopeMode(ctx);
        if ("ALL".equals(mode)) return rows;
        Set<Long> visible = new HashSet<>(memberProjectIds(ctx));
        if ("DEPT".equals(mode)) visible.addAll(deptScopeProjectIds(ctx));
        return rows.stream()
                .filter(m -> {
                    Object pid = m.get("projectId");
                    return pid == null || visible.contains(((Number) pid).longValue());
                })
                .toList();
    }

    // ================= ②+④ 관리포인트 capability 결합 (0034 §3) =================

    private static final Map<String, EntityRule> RULES = Map.of(
            "tasks", new EntityRule("pms_task", "task_id", "assignee_name", "task.edit"),
            "issues", new EntityRule("pms_issue", "issue_id", "owner_name", "issue.edit"),
            "action-items", new EntityRule("pms_action_item", "action_id", "assignee_name", "action.edit"),
            "deliverables", new EntityRule("pms_deliverable", "deliverable_id", "author_name", "deliverable.edit"),
            "meeting-minutes", new EntityRule("pms_meeting_minutes", "meeting_id", null, "meeting.write"),
            "official-docs", new EntityRule("pms_official_doc", "doc_id", null, "doc.write"));

    private record EntityRule(String table, String idCol, String assigneeCol, String capabilityKey) {}

    /** ④ 참여역할 capability — PM 플래그(is_project_manager)가 우선(레거시 PM 지정과의 정합),
     *  다음 participation_role, 둘 다 없으면 "참여만 함"에 대한 보수적 기본값(구 WORKER 정책과 동일). */
    private Map<String, Object> roleCapabilities(AuthContext ctx, long projectId) {
        if (ctx == null || ctx.personId() == null) return Map.of();
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT participation_role, is_project_manager FROM pms_project_member "
              + "WHERE project_id = ? AND person_id = ? AND is_active = 1 LIMIT 1",
                projectId, ctx.personId());
        if (rows.isEmpty()) return Map.of();
        Map<String, Object> row = rows.get(0);
        String roleCode = Boolean.TRUE.equals(toBool(row.get("is_project_manager")))
                ? "PM" : (String) row.get("participation_role");
        if (roleCode != null) {
            List<String> caps = jdbc.query("SELECT capabilities FROM pms_role_capability WHERE role_code = ?",
                    (rs, i) -> rs.getString(1), roleCode);
            if (!caps.isEmpty()) {
                Object parsed = Json.readObject(caps.get(0));
                if (parsed instanceof Map<?, ?> m) {
                    @SuppressWarnings("unchecked") Map<String, Object> typed = (Map<String, Object>) m;
                    return typed;
                }
            }
        }
        // participation_role 미지정 참여자 — 구 WORKER 기본값(본인 담당만, 회의록은 참여로 충분)
        return Map.of("task.edit", "own", "issue.edit", Boolean.TRUE, "action.edit", "own",
                "deliverable.edit", "own", "meeting.write", Boolean.TRUE, "doc.write", Boolean.FALSE,
                "project.edit", Boolean.FALSE, "member.manage", Boolean.FALSE);
    }

    /** ③ 규칙 capability — 이 규칙의 project_scope가 projectId를 실제로 덮을 때만 반영. */
    private Map<String, Object> ruleCapabilities(AuthContext ctx, long projectId) {
        if (ctx == null) return Map.of();
        Map<String, Object> merged = new java.util.LinkedHashMap<>();
        for (Map<String, Object> rule : accessRuleService.matchedRulesFor(ctx.personId())) {
            Object capRaw = rule.get("capabilities");
            if (capRaw == null) continue;
            String scope = String.valueOf(rule.get("project_scope"));
            boolean covers = "ALL".equals(scope)
                    || ("DEPT".equals(scope) && deptScopeProjectIds(ctx).contains(projectId))
                    || ("PARTICIPATING".equals(scope) && memberProjectIds(ctx).contains(projectId));
            if (!covers) continue;
            Object parsed = Json.readObject(String.valueOf(capRaw));
            if (parsed instanceof Map<?, ?> m) {
                for (Map.Entry<?, ?> e : m.entrySet()) {
                    String k = String.valueOf(e.getKey());
                    merged.put(k, CapabilityMerge.merge(merged.get(k), e.getValue()));
                }
            }
        }
        return merged;
    }

    /** 최종 capability(ctx, projectId, key) = ③규칙 ⊔ ④참여역할(OR 결합, 0034 §3). */
    private Object capability(AuthContext ctx, long projectId, String key) {
        Object fromRule = ruleCapabilities(ctx, projectId).get(key);
        Object fromRole = roleCapabilities(ctx, projectId).get(key);
        return CapabilityMerge.merge(fromRule, fromRole);
    }

    private static boolean toBool(Object v) {
        if (v instanceof Boolean b) return b;
        if (v instanceof Number n) return n.intValue() != 0;
        return false;
    }

    /** 프로젝트 자체 수정(PATCH·전환·전이 등) — capability "project.edit". */
    public void assertCanEditProject(AuthContext ctx, long projectId) {
        if (!isScoped(ctx)) return;
        if (!CapabilityMerge.isAllowed(capability(ctx, projectId, "project.edit"))) {
            throw ApiException.forbidden("프로젝트 정보는 이 프로젝트의 관리 권한이 있는 사용자만 수정할 수 있습니다.");
        }
    }

    /** 참여인력 등록·수정 — capability "member.manage". */
    public void assertCanManageMembers(AuthContext ctx, long projectId) {
        if (!isScoped(ctx)) return;
        if (!CapabilityMerge.isAllowed(capability(ctx, projectId, "member.manage"))) {
            throw ApiException.forbidden("참여인력 관리 권한이 없습니다.");
        }
    }

    /** 기존 항목 쓰기 가드 — 엔티티 경로+id로 프로젝트·담당자를 찾아 판정. */
    public void assertItemWrite(AuthContext ctx, String entityPath, long id) {
        if (!isScoped(ctx)) return;
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
        if (!isScoped(ctx) || body == null) return;
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

    /** 신규 항목 생성 가드(projectId를 요청 본문에서 받은 경우) 겸 공통 판정. capability all/own/false. */
    public void assertItemCreate(AuthContext ctx, long projectId, String entityPath, String assigneeName) {
        if (!isScoped(ctx)) return;
        EntityRule rule = RULES.get(entityPath);
        String key = rule == null ? null : rule.capabilityKey();
        Object cap = key == null ? Boolean.TRUE : capability(ctx, projectId, key);
        if (!CapabilityMerge.isAllowed(cap)) {
            boolean covered = coveredByRuleScope(ctx, projectId) || memberProjectIds(ctx).contains(projectId);
            throw ApiException.forbidden(covered
                    ? "이 항목을 작성·수정할 권한이 없습니다."
                    : "참여 중인 프로젝트의 항목만 작성·수정할 수 있습니다.");
        }
        if (CapabilityMerge.isOwn(cap)) {
            String myName = ctx.name();
            boolean mine = assigneeName != null && assigneeName.equals(myName);
            if (!mine) throw ApiException.forbidden("본인 담당 항목만 수정할 수 있습니다.");
        }
    }
}
