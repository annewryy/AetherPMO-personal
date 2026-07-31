package com.aetherpms.person;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import com.aetherpms.common.ApiException;

/**
 * 인력 저장 동기화 (설계 0005 §D).
 *
 * 인력 저장 시 pms_person에서 동일 인력 조회 → 있으면 재사용, 없으면 신규 insert →
 * 반환된 person_id로 pms_project_member.person_id를 연결한다.
 *
 * dedup 키(설계 0005 §B):
 *   내부(INTERNAL) = amaranth_emp_no(사번). 사번 있으면 안정 키.
 *                    사번 없고 user_uid 있으면 기존 member의 person_id 승계.
 *   외부(EXTERNAL) = 하드 유니크 없이 앱계층 find-or-insert
 *                    (name + company_id + employment_type 기준 — 동명이인 위험, 플래그).
 *
 * 프로젝트/멤버 삭제 시 person 보존은 스키마 FK(ON DELETE SET NULL)가 보장 — 여기선 미관여.
 */
@Service
public class PersonSyncService {

    private final JdbcTemplate jdbc;
    // 0044 — 인력구분 검증은 pms_employment_type 마스터 기준(하드코딩 5종 폐지).
    private final EmploymentTypeService employmentTypes;

    public PersonSyncService(JdbcTemplate jdbc, EmploymentTypeService employmentTypes) {
        this.jdbc = jdbc;
        this.employmentTypes = employmentTypes;
    }

    /**
     * 멤버 정보로 person을 find-or-insert하고 person_id를 반환한다.
     * (호출 측이 트랜잭션을 소유 — 멤버 INSERT/UPDATE와 같은 트랜잭션에서 호출할 것.)
     *
     * @param source          INTERNAL / EXTERNAL
     * @param amaranthEmpNo   내부 인력 사번(없으면 null)
     * @param userUid         내부 인력 계정 uuid(없으면 null)
     * @param name            성명(필수)
     * @param employmentType  5종 코드(regular/insourced/project_contract/turnkey/freelancer)
     * @param companyId       소속회사 FK(없으면 null)
     * @param department      부서명 — 표시용(외부 인력은 자유 입력). 없으면 null
     * @param deptCode        조직도 부서 코드(0042) — 부서 필터의 축. 내부 인력만, 없으면 null
     * @param position        직책(없으면 null)
     */
    public long findOrInsertPerson(String source, String amaranthEmpNo, String userUid,
            String name, String employmentType, Long companyId,
            String department, String deptCode, String position) {

        String src = "INTERNAL".equals(source) ? "INTERNAL" : "EXTERNAL";
        String nm = name == null ? null : name.trim();
        if (nm == null || nm.isEmpty()) throw ApiException.badRequest("인력 성명(name)은 필수입니다.");
        String empType = employmentTypes.normalize(employmentType);

        // 1) 내부 + 사번: 사번 유니크 키로 조회.
        if ("INTERNAL".equals(src) && notBlank(amaranthEmpNo)) {
            Long existing = queryPersonId(
                    "SELECT person_id FROM pms_person WHERE amaranth_emp_no = ?",
                    amaranthEmpNo.trim());
            if (existing != null) return existing;
        }

        // 2) 내부 + user_uid: 이미 이 계정으로 등록된 멤버가 있으면 그 person 승계.
        if ("INTERNAL".equals(src) && notBlank(userUid)) {
            Long linked = queryPersonId(
                    "SELECT person_id FROM pms_project_member " +
                    "WHERE user_uid = ? AND person_id IS NOT NULL LIMIT 1", userUid.trim());
            if (linked != null) return linked;
        }

        // 3) 외부(또는 사번·계정 없는 내부): name+company_id+employment_type 기준 find-or-insert.
        Long existing = findByNaturalKey(src, nm, companyId, empType);
        if (existing != null) return existing;

        // 4) 신규 insert.
        return insertPerson(src, notBlank(amaranthEmpNo) ? amaranthEmpNo.trim() : null,
                nm, empType, companyId, department, notBlank(deptCode) ? deptCode.trim() : null, position);
    }

    private Long findByNaturalKey(String source, String name, Long companyId, String empType) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT person_id FROM pms_person " +
                "WHERE source = ? AND name = ? AND employment_type = ? " +
                "  AND (company_id <=> ?) LIMIT 1",
                source, name, empType, companyId);
        return rows.isEmpty() ? null : ((Number) rows.get(0).get("person_id")).longValue();
    }

    private long insertPerson(String source, String amaranthEmpNo, String name,
            String empType, Long companyId, String department, String deptCode, String position) {
        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("source", source);
        fields.put("amaranth_emp_no", amaranthEmpNo);
        fields.put("name", name);
        fields.put("employment_type", empType);
        fields.put("company_id", companyId);
        fields.put("department", department);
        fields.put("dept_code", deptCode);
        fields.put("position", position);
        fields.put("status", "재직");

        List<String> cols = List.copyOf(fields.keySet());
        String colList = String.join(", ", cols);
        String ph = String.join(", ", cols.stream().map(c -> "?").toList());
        Object[] vals = cols.stream().map(fields::get).toArray();
        jdbc.update("INSERT INTO pms_person (" + colList + ") VALUES (" + ph + ")", vals);
        Long id = jdbc.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        if (id == null || id == 0) throw ApiException.badRequest("person 생성에 실패했습니다.");
        return id;
    }

    private Long queryPersonId(String sql, Object... args) {
        List<Map<String, Object>> rows = jdbc.queryForList(sql, args);
        return rows.isEmpty() ? null : ((Number) rows.get(0).get("person_id")).longValue();
    }


    private static boolean notBlank(String s) { return s != null && !s.trim().isEmpty(); }
}
