package com.aetherpms.access;

import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * 0034 §5 결정4(A) — 경영진(직책코드 EXEC)을 전 프로젝트에 참여인력(participation_role='EXEC')으로
 * 자동 등록. 신규 프로젝트 생성/전환 시 자동 반영(ProjectCreateService·ProjectConvertService에서 호출) +
 * 기존 프로젝트 일괄 백필용 관리자 엔드포인트(POST /api/admin/access-rules/sync-exec).
 * 원문 직책 문자열은 PositionCode.MAP의 EXEC 키 집합과 동일해야 한다(§5-1 실데이터 검증 확정).
 */
@Service
public class ExecAutoRegisterService {

    private static final List<String> EXEC_POSITIONS =
            List.of("CEO", "CFO", "CVO", "CDO", "A.C.E.부회장", "의장");

    private final JdbcTemplate jdbc;

    public ExecAutoRegisterService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 신규(또는 특정) 프로젝트 1건에 경영진 전원을 EXEC 참여인력으로 등록(이미 있으면 스킵). */
    public int ensureProjectHasExec(long projectId) {
        String placeholders = String.join(",", EXEC_POSITIONS.stream().map(s -> "?").toList());
        List<Map<String, Object>> execs = jdbc.queryForList(
                "SELECT person_id, name FROM pms_person WHERE position IN (" + placeholders + ")",
                EXEC_POSITIONS.toArray());
        int inserted = 0;
        for (Map<String, Object> e : execs) {
            long personId = ((Number) e.get("person_id")).longValue();
            Integer exists = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM pms_project_member WHERE project_id = ? AND person_id = ?",
                    Integer.class, projectId, personId);
            if (exists != null && exists > 0) continue;
            jdbc.update("""
                    INSERT INTO pms_project_member
                      (project_id, person_id, member_type, name, participation_role, is_project_manager, is_active)
                    VALUES (?, ?, 'INTERNAL', ?, 'EXEC', 0, 1)""",
                    projectId, personId, e.get("name"));
            inserted++;
        }
        return inserted;
    }

    /** 기존 전 프로젝트 일괄 백필(관리자 수동 실행 — 모델 최초 적용 시 1회, 이후는 신규 생성 때 자동). */
    public Map<String, Object> syncAllProjects() {
        List<Long> projectIds = jdbc.query("SELECT project_id FROM pms_project",
                (rs, i) -> rs.getLong(1));
        int total = 0;
        for (Long pid : projectIds) total += ensureProjectHasExec(pid);
        return Map.of("projectsChecked", projectIds.size(), "membersInserted", total);
    }
}
