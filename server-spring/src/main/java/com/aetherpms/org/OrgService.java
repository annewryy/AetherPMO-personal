package com.aetherpms.org;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 조직/회원 조회(0020) — 참여인력 등록의 조직도 선택에 사용.
 * 우리 미러 테이블(pms_org_*)에서 읽는다(원천 아마란스 view는 동기화 배치만 접근).
 */
@Service
public class OrgService {

    private final JdbcTemplate jdbc;

    public OrgService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 부서 트리(평탄) — 프론트에서 upperDeptCode로 트리 구성. memberCount로 빈 부서 판별. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> departments() {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT d.dept_code, d.upper_dept_code, d.dept_nm, " +
                "  (SELECT COUNT(*) FROM pms_org_member_dept md WHERE md.dept_code = d.dept_code) AS member_count " +
                "FROM pms_org_dept d ORDER BY d.dept_nm");
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (Map<String, Object> r : rows) {
            Map<String, Object> o = new LinkedHashMap<>();
            o.put("deptCode", r.get("dept_code"));
            o.put("upperDeptCode", r.get("upper_dept_code"));
            o.put("deptNm", r.get("dept_nm"));
            o.put("memberCount", ((Number) r.get("member_count")).intValue());
            out.add(o);
        }
        return out;
    }

    /**
     * 외부 인력(pms_person source=EXTERNAL) — 조직도 트리의 '외부인력' 가지.
     * 회사별로 묶기 위해 companyName 포함. 기존 등록된 외부 인력을 재선택하는 용도.
     */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> externalMembers(String q) {
        StringBuilder sql = new StringBuilder(
                "SELECT p.person_id, p.name, p.employment_type, p.company_id, c.company_name, " +
                "       p.department, p.position " +
                "FROM pms_person p LEFT JOIN pms_company c ON c.company_id = p.company_id " +
                "WHERE p.source = 'EXTERNAL' ");
        List<Object> args = new ArrayList<>();
        if (q != null && !q.isBlank()) {
            sql.append("AND p.name LIKE ? ");
            args.add("%" + q.trim() + "%");
        }
        sql.append("ORDER BY c.company_name IS NULL, c.company_name, p.name LIMIT 500");
        List<Map<String, Object>> rows = jdbc.queryForList(sql.toString(), args.toArray());
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (Map<String, Object> r : rows) {
            Map<String, Object> o = new LinkedHashMap<>();
            o.put("personId", r.get("person_id"));
            o.put("name", r.get("name"));
            o.put("employmentType", r.get("employment_type"));
            o.put("companyId", r.get("company_id"));
            o.put("companyName", r.get("company_name"));
            o.put("department", r.get("department"));
            o.put("position", r.get("position"));
            out.add(o);
        }
        return out;
    }

    /**
     * 회원 검색 — 이름/부서로 필터. 겸직은 (회원×부서) 행으로 반환(부서·직책 표기로 구분).
     * 기본은 재직(P)만. includeResigned=true면 퇴직(D) 포함.
     */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> members(String deptCode, String q, boolean includeResigned) {
        StringBuilder sql = new StringBuilder(
                "SELECT m.mber_id, m.mber_nm, m.email, m.status, " +
                "       md.dept_code, md.dept_nm, md.duty_code, dc.duty_nm " +
                "FROM pms_org_member m " +
                "JOIN pms_org_member_dept md ON md.mber_id = m.mber_id " +
                "LEFT JOIN pms_org_duty_code dc ON dc.duty_code = md.duty_code " +
                "WHERE 1=1 ");
        List<Object> args = new ArrayList<>();
        if (!includeResigned) {
            sql.append("AND m.status = 'P' ");
        }
        if (deptCode != null && !deptCode.isBlank()) {
            sql.append("AND md.dept_code = ? ");
            args.add(deptCode.trim());
        }
        if (q != null && !q.isBlank()) {
            sql.append("AND (m.mber_nm LIKE ? OR m.mber_id LIKE ?) ");
            String like = "%" + q.trim() + "%";
            args.add(like);
            args.add(like);
        }
        sql.append("ORDER BY m.mber_nm, md.dept_nm LIMIT 200");

        List<Map<String, Object>> rows = jdbc.queryForList(sql.toString(), args.toArray());
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (Map<String, Object> r : rows) {
            Map<String, Object> o = new LinkedHashMap<>();
            o.put("mberId", r.get("mber_id"));
            o.put("mberNm", r.get("mber_nm"));
            o.put("email", r.get("email"));
            o.put("status", r.get("status"));   // P 재직 / D 퇴직
            o.put("deptCode", r.get("dept_code"));
            o.put("deptNm", r.get("dept_nm"));
            o.put("dutyCode", r.get("duty_code"));
            String dutyNm = (String) r.get("duty_nm");
            o.put("dutyNm", dutyNm == null || dutyNm.isBlank() ? null : dutyNm);
            out.add(o);
        }
        return out;
    }
}
