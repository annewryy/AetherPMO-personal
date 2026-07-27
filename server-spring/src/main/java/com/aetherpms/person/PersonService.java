package com.aetherpms.person;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.aetherpms.common.ApiException;

/**
 * 인력관리 조회 — 설계 0014 (목록/상세/프로젝트 이력).
 *
 * 데이터 기반은 0005 단일 사람 마스터 pms_person. 모든 필터는 서버측 SQL WHERE/JOIN
 * (0014 A — 클라이언트 필터링 금지). 응답은 camelCase 도메인 DTO(0003 계약).
 *
 * batch2 패턴대로 JdbcTemplate + Map(RowMapper 강제 아님)로 구현.
 */
@Service
public class PersonService {

    private final JdbcTemplate jdbc;

    public PersonService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // employment_type 5종(설계 0005 §B에서 확정한 코드값).
    static final List<String> EMPLOYMENT_TYPES =
            List.of("regular", "insourced", "project_contract", "turnkey", "freelancer");

    // =====================================================================
    // GET /api/persons — 목록(서버측 필터)
    // =====================================================================

    @Transactional(readOnly = true)
    public List<Map<String, Object>> list(PersonQuery q) {
        StringBuilder sql = new StringBuilder(
            "SELECT DISTINCT p.person_id, p.source, p.amaranth_emp_no, p.name, " +
            "       p.employment_type, p.company_id, p.department, p.position, " +
            "       p.phone, p.email, p.status, c.company_name, u.username AS login_id " +
            "FROM pms_person p " +
            "LEFT JOIN pms_company c ON c.company_id = p.company_id " +
            "LEFT JOIN pms_user u ON u.person_id = p.person_id AND u.is_active = 1 ");

        List<Object> args = new ArrayList<>();
        List<String> where = new ArrayList<>();

        // location/customer/projectId 파생 조건이 있으면 멤버→프로젝트 조인.
        boolean joinProject = q.projectId() != null || notBlank(q.location()) || notBlank(q.customer());
        if (joinProject) {
            sql.append("JOIN pms_project_member pm ON pm.person_id = p.person_id ")
               .append("JOIN pms_project pr ON pr.project_id = pm.project_id ");
        }

        // 인력구분(employment_type) 복수 + AND/OR.
        List<String> types = q.employmentTypes();
        if (types != null && !types.isEmpty()) {
            for (String t : types) {
                if (!EMPLOYMENT_TYPES.contains(t)) {
                    throw ApiException.badRequest("유효하지 않은 employmentType 값: " + t
                            + " (허용: " + String.join(", ", EMPLOYMENT_TYPES) + ")");
                }
            }
            // AND는 단일 인력이 여러 유형을 동시에 가질 수 없어 논리상 공집합이 되므로
            // (한 사람의 employment_type은 하나) — 유경님 예시("정규직+자사화" OR)와 정합.
            // match=and는 필터 집합 자체가 1개일 때만 의미. 다중 AND는 빈 결과가 정상.
            String in = String.join(", ", types.stream().map(t -> "?").toList());
            if ("and".equalsIgnoreCase(q.match()) && types.size() > 1) {
                // 한 person의 유형은 단일 → 2개 이상 AND는 항상 공집합.
                where.add("1 = 0");
            } else {
                where.add("p.employment_type IN (" + in + ")");
                args.addAll(types);
            }
        }

        if (q.departments() != null && !q.departments().isEmpty()) {
            // 0038 — 조직도 트리 선택 부서(하위 포함) 필터: 부서명 IN
            where.add("p.department IN (" + String.join(",",
                    java.util.Collections.nCopies(q.departments().size(), "?")) + ")");
            args.addAll(q.departments());
        }
        if (notBlank(q.name())) {
            where.add("p.name LIKE ?");
            args.add("%" + q.name().trim() + "%");
        }
        if (notBlank(q.company())) {
            where.add("c.company_name LIKE ?");
            args.add("%" + q.company().trim() + "%");
        }
        if (q.projectId() != null) {
            where.add("pm.project_id = ?");
            args.add(q.projectId());
        }
        if (notBlank(q.location())) {
            where.add("pr.location LIKE ?");
            args.add("%" + q.location().trim() + "%");
        }
        if (notBlank(q.customer())) {
            where.add("pr.customer_name LIKE ?");
            args.add("%" + q.customer().trim() + "%");
        }

        if (!where.isEmpty()) {
            sql.append("WHERE ").append(String.join(" AND ", where)).append(" ");
        }
        sql.append("ORDER BY p.name ASC, p.person_id ASC");

        List<Map<String, Object>> rows = jdbc.queryForList(sql.toString(), args.toArray());
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (Map<String, Object> r : rows) {
            Map<String, Object> dto = mapPerson(r);
            dto.put("activeProjectCount", activeProjectCount(toLong(r.get("person_id"))));
            out.add(dto);
        }
        return out;
    }

    // =====================================================================
    // GET /api/persons/{id} — 기본 정보
    // =====================================================================

    @Transactional(readOnly = true)
    public Map<String, Object> detail(long id) {
        if (id <= 0) throw ApiException.badRequest("유효하지 않은 id입니다.");
        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT p.person_id, p.source, p.amaranth_emp_no, p.name, p.employment_type, " +
            "       p.company_id, p.department, p.position, p.phone, p.email, p.status, " +
            "       c.company_name " +
            "FROM pms_person p " +
            "LEFT JOIN pms_company c ON c.company_id = p.company_id " +
            "WHERE p.person_id = ?", id);
        if (rows.isEmpty()) throw ApiException.notFound("인력을 찾을 수 없습니다.");
        return mapPerson(rows.get(0));
    }

    // =====================================================================
    // GET /api/persons/{id}/projects — 참여 이력(시간순)
    // =====================================================================

    @Transactional(readOnly = true)
    public List<Map<String, Object>> projectHistory(long id) {
        if (id <= 0) throw ApiException.badRequest("유효하지 않은 id입니다.");
        Integer exists = jdbc.queryForObject(
                "SELECT COUNT(*) FROM pms_person WHERE person_id = ?", Integer.class, id);
        if (exists == null || exists == 0) throw ApiException.notFound("인력을 찾을 수 없습니다.");

        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT pr.project_id, pr.project_name, pr.customer_name, pr.location, pr.status, " +
            "       pr.planned_start_date, pr.planned_end_date, " +
            "       pr.actual_start_date, pr.actual_end_date, " +
            "       pm.participation_role, pm.role_name, pm.is_project_manager, " +
            "       pm.start_date AS member_start_date, pm.end_date AS member_end_date, " +
            "       pm.is_active " +
            "FROM pms_project_member pm " +
            "JOIN pms_project pr ON pr.project_id = pm.project_id " +
            "WHERE pm.person_id = ? " +
            // 시간순: 프로젝트 시작(실제→계획 폴백) 오름차순.
            "ORDER BY COALESCE(pr.actual_start_date, pr.planned_start_date) ASC, pr.project_id ASC",
            id);

        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (Map<String, Object> r : rows) {
            Map<String, Object> dto = new LinkedHashMap<>();
            dto.put("projectId", toLong(r.get("project_id")));
            dto.put("projectName", r.get("project_name"));
            dto.put("customerName", r.get("customer_name"));
            dto.put("location", r.get("location"));
            dto.put("status", r.get("status"));
            dto.put("startDate", str(r.get("planned_start_date")));
            dto.put("endDate", str(r.get("planned_end_date")));
            dto.put("actualStartDate", str(r.get("actual_start_date")));
            dto.put("actualEndDate", str(r.get("actual_end_date")));
            dto.put("role", r.get("participation_role"));
            dto.put("roleName", r.get("role_name"));
            dto.put("isProjectManager", truthy(r.get("is_project_manager")));
            dto.put("memberStartDate", str(r.get("member_start_date")));
            dto.put("memberEndDate", str(r.get("member_end_date")));
            dto.put("isActive", truthy(r.get("is_active")));
            out.add(dto);
        }
        return out;
    }

    // ---- 공용 --------------------------------------------------------------

    private long activeProjectCount(Long personId) {
        if (personId == null) return 0;
        Integer c = jdbc.queryForObject(
                "SELECT COUNT(DISTINCT project_id) FROM pms_project_member " +
                "WHERE person_id = ? AND is_active = 1", Integer.class, personId);
        return c == null ? 0 : c;
    }

    static Map<String, Object> mapPerson(Map<String, Object> r) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("personId", toLong(r.get("person_id")));
        out.put("source", r.get("source"));
        out.put("amaranthEmpNo", r.get("amaranth_emp_no"));
        out.put("name", r.get("name"));
        out.put("employmentType", r.get("employment_type"));
        out.put("companyId", toLong(r.get("company_id")));
        out.put("companyName", r.get("company_name"));
        out.put("department", r.get("department"));
        out.put("position", r.get("position"));
        out.put("phone", r.get("phone"));
        out.put("email", r.get("email"));
        out.put("status", r.get("status"));
        out.put("loginId", r.get("login_id")); // 0038 — 연결 계정 아이디(관리자 확인용, 미연결 null)
        return out;
    }

    private static boolean notBlank(String s) { return s != null && !s.trim().isEmpty(); }
    private static Long toLong(Object o) { return o == null ? null : ((Number) o).longValue(); }
    private static String str(Object o) { return o == null ? null : o.toString(); }
    private static boolean truthy(Object o) {
        if (o == null) return false;
        if (o instanceof Number n) return n.intValue() != 0;
        if (o instanceof Boolean b) return b;
        return "1".equals(o.toString()) || "true".equalsIgnoreCase(o.toString());
    }
}
