package com.aetherpms.person;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import com.aetherpms.common.ReadMappers;
import com.aetherpms.common.ReadSupport;

/** person 읽기(구 ReadController 분리). */
@RestController
public class MemberReadController {

    private final JdbcTemplate jdbc;
    private final ProjectMemberReadRepository repo;

    public MemberReadController(JdbcTemplate jdbc, ProjectMemberReadRepository repo) {
        this.jdbc = jdbc;
        this.repo = repo;
    }

    @GetMapping("/api/projects/{id}/members")
    public List<Map<String, Object>> list(@PathVariable("id") long rawId) {
        long id = ReadSupport.parseId(rawId);
        ReadSupport.requireProject(jdbc, id);
        return repo.findByProjectIdAndIsActiveTrueOrderByIsProjectManagerDescMemberIdAsc(id).stream().map(ReadMappers::mapProjectMember).toList();
    }

    /**
     * 0028 §C — 참여인력 관리(전사): pms_project_member ⨝ pms_project 매핑 목록.
     * 완료 프로젝트·비활성(is_active=0) 행 포함 — 화면이 필터·표시를 결정한다.
     */
    @GetMapping("/api/project-members")
    public List<Map<String, Object>> allAssignments() {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT m.member_id, m.project_id, p.project_code, p.project_name,
                       m.person_id, m.member_type, m.user_uid, m.name, m.employment_type,
                       m.company, m.company_id, m.department,
                       m.position, m.role_name, m.participation_role, m.is_project_manager,
                       m.is_active, m.start_date, m.end_date, m.memo
                  FROM pms_project_member m
                  JOIN pms_project p ON p.project_id = m.project_id
                 ORDER BY m.name, m.member_id""");
        return rows.stream().map(r -> {
            Map<String, Object> o = new LinkedHashMap<>();
            o.put("memberId", r.get("member_id"));
            o.put("projectId", r.get("project_id"));
            o.put("projectCode", r.get("project_code"));
            o.put("projectName", r.get("project_name"));
            o.put("personId", r.get("person_id"));
            o.put("memberType", r.get("member_type"));
            o.put("userUid", r.get("user_uid"));
            o.put("name", r.get("name"));
            o.put("employmentType", r.get("employment_type"));
            o.put("company", r.get("company"));
            o.put("companyId", r.get("company_id"));
            o.put("department", r.get("department"));
            o.put("position", r.get("position"));
            o.put("roleName", r.get("role_name"));
            o.put("participationRole", r.get("participation_role"));
            o.put("isProjectManager", truthy(r.get("is_project_manager")));
            o.put("isActive", truthy(r.get("is_active")));
            o.put("startDate", dateStr(r.get("start_date")));
            o.put("endDate", dateStr(r.get("end_date")));
            o.put("memo", r.get("memo"));
            return o;
        }).toList();
    }

    private static boolean truthy(Object v) {
        if (v instanceof Boolean b) return b;
        return v instanceof Number n && n.intValue() != 0;
    }

    private static String dateStr(Object v) {
        if (v == null) return null;
        if (v instanceof java.sql.Date d) return d.toLocalDate().toString();
        return v.toString();
    }

    /** 전역 멤버 목록 — 현재 사용자 선택기(X-User-Id 후보)용. 프론트 ProjectMember shape. */
    @GetMapping("/api/members")
    public List<Map<String, Object>> all() {
        return repo.findAll().stream().map(m -> {
            Map<String, Object> o = new LinkedHashMap<>();
            o.put("id", m.getMemberId());
            o.put("projectId", m.getProjectId());
            o.put("userId", m.getUserUid());
            o.put("name", m.getName());
            o.put("roleName", m.getRoleName());
            o.put("position", m.getPosition());
            o.put("memo", null);
            return o;
        }).toList();
    }
}
