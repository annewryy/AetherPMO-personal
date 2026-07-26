package com.aetherpms.person;

import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.aetherpms.common.Actor;
import com.aetherpms.common.AuditWriter;

/**
 * 0031 — 담당자 지정 시 참여인력 자동 등록.
 * 태스크 담당자(assignee_name)·프로젝트 책임자(pm_name)로 지정된 사람이
 * pms_project_member에 없으면 자동 등록한다(너울님 2026-07-26 요구).
 *  - 내부/외부 추정: 아마란스 미러(pms_org_member)에 동명이 있으면 INTERNAL, 없으면 EXTERNAL.
 *  - 사람 마스터(pms_person) 동명이 정확히 1명이면 person_id·고용형태·소속을 연결(모호하면 미연결).
 *  - 이미 있으면 중복 등록하지 않는다(PM 지정이면 is_project_manager만 승격).
 */
@Service
public class MemberAutoService {

    private final JdbcTemplate jdbc;
    private final AuditWriter audit;

    public MemberAutoService(JdbcTemplate jdbc, AuditWriter audit) {
        this.jdbc = jdbc;
        this.audit = audit;
    }

    @Transactional
    public void ensureMember(long projectId, String rawName, boolean projectManager, Actor actor) {
        if (rawName == null || rawName.isBlank()) return;
        String name = rawName.trim();

        Integer exists = jdbc.queryForObject(
                "SELECT COUNT(*) FROM pms_project_member WHERE project_id = ? AND name = ?",
                Integer.class, projectId, name);
        if (exists != null && exists > 0) {
            if (projectManager) {
                jdbc.update("UPDATE pms_project_member SET is_project_manager = 1, is_active = 1 "
                        + "WHERE project_id = ? AND name = ?", projectId, name);
            }
            return;
        }

        Integer inOrg = jdbc.queryForObject(
                "SELECT COUNT(*) FROM pms_org_member WHERE mber_nm = ?", Integer.class, name);
        String memberType = inOrg != null && inOrg > 0 ? "INTERNAL" : "EXTERNAL";

        // 사람 마스터 매칭 — 동명이 정확히 1명일 때만(모호 매칭 금지)
        List<Map<String, Object>> persons = jdbc.queryForList(
                "SELECT person_id, employment_type, company_id, department, position "
                + "FROM pms_person WHERE name = ?", name);
        Long personId = null;
        String employmentType = null, department = null, position = null;
        Long companyId = null;
        if (persons.size() == 1) {
            Map<String, Object> p = persons.get(0);
            personId = ((Number) p.get("person_id")).longValue();
            employmentType = p.get("employment_type") == null ? null : p.get("employment_type").toString();
            companyId = p.get("company_id") == null ? null : ((Number) p.get("company_id")).longValue();
            department = p.get("department") == null ? null : p.get("department").toString();
            position = p.get("position") == null ? null : p.get("position").toString();
        }

        jdbc.update(
                "INSERT INTO pms_project_member (project_id, member_type, name, person_id, "
                + "employment_type, company_id, department, position, is_project_manager, is_active) "
                + "VALUES (?, ?, ?, ?, COALESCE(?, 'regular'), ?, ?, ?, ?, 1)",
                projectId, memberType, name, personId,
                employmentType, companyId, department, position, projectManager ? 1 : 0);
        Long memberId = jdbc.queryForObject("SELECT LAST_INSERT_ID()", Long.class);

        audit.write("PROJECT_MEMBER", memberId, projectId, "INSERT", null, null,
                Map.of("name", name, "member_type", memberType, "auto", true),
                actor, projectManager
                        ? "[자동] 프로젝트 책임자 지정 → 참여인력 등록"
                        : "[자동] 태스크 담당자 지정 → 참여인력 등록");
    }
}
