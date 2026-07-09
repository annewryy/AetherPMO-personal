package com.aetherpms.person;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.aetherpms.common.Actor;
import com.aetherpms.common.ApiException;

/**
 * 참여인력 저장 (설계 0005 §D) — POST /api/projects/{id}/members.
 *
 * 멤버를 pms_project_member에 INSERT하면서, PersonSyncService로 pms_person을
 * find-or-insert하고 member.person_id를 연결한다(저장 동기화). 프로젝트 삭제 시
 * 마스터 보존은 스키마 FK(member.person_id ON DELETE SET NULL / member.project_id
 * ON DELETE CASCADE)가 담당.
 */
@Service
public class MemberService {

    private final JdbcTemplate jdbc;
    private final PersonSyncService personSync;

    public MemberService(JdbcTemplate jdbc, PersonSyncService personSync) {
        this.jdbc = jdbc;
        this.personSync = personSync;
    }

    private static final List<String> MEMBER_TYPES = List.of("INTERNAL", "EXTERNAL");
    private static final List<String> PARTICIPATION_ROLES = List.of(
            "PM", "PL", "PMO", "TA", "AA", "DA", "DBA", "SE", "DEV", "QA", "CT", "ETC");

    @Transactional
    public Map<String, Object> createMember(long projectId, Map<String, Object> body, Actor actor) {
        if (projectId <= 0) throw ApiException.badRequest("유효하지 않은 projectId입니다.");
        Map<String, Object> b = body == null ? Map.of() : body;
        List<String> allowed = List.of("memberType", "userUid", "amaranthEmpNo", "name",
                "company", "companyId", "roleName", "position", "department",
                "participationRole", "employmentType", "isProjectManager",
                "startDate", "endDate", "memo");
        List<String> unknown = b.keySet().stream().filter(k -> !allowed.contains(k)).toList();
        if (!unknown.isEmpty()) {
            throw ApiException.badRequest("허용되지 않는 필드: " + String.join(", ", unknown)
                    + " (허용: " + String.join(", ", allowed) + ")");
        }

        Integer exists = jdbc.queryForObject(
                "SELECT COUNT(*) FROM pms_project WHERE project_id = ?", Integer.class, projectId);
        if (exists == null || exists == 0) throw ApiException.notFound("프로젝트를 찾을 수 없습니다.");

        String name = str(b.get("name"));
        if (name == null || name.trim().isEmpty()) throw ApiException.badRequest("name은 필수입니다.");

        String memberType = b.get("memberType") != null
                ? requireInList("memberType", b.get("memberType"), MEMBER_TYPES) : "EXTERNAL";
        String employmentType = PersonSyncService.normalizeEmploymentType(str(b.get("employmentType")));
        Long companyId = toLongOrNull(b.get("companyId"));
        String department = str(b.get("department"));
        String position = str(b.get("position"));
        String userUid = str(b.get("userUid"));
        String amaranthEmpNo = str(b.get("amaranthEmpNo"));
        String participationRole = b.get("participationRole") != null
                ? requireInList("participationRole", b.get("participationRole"), PARTICIPATION_ROLES) : null;

        // 저장 동기화(0005 §D): find-or-insert person → person_id.
        long personId = personSync.findOrInsertPerson(memberType, amaranthEmpNo, userUid,
                name.trim(), employmentType, companyId, department, position);

        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("project_id", projectId);
        fields.put("person_id", personId);
        fields.put("member_type", memberType);
        if (userUid != null) fields.put("user_uid", userUid);
        fields.put("name", name.trim());
        if (b.get("company") != null) fields.put("company", str(b.get("company")));
        if (companyId != null) fields.put("company_id", companyId);
        if (b.get("roleName") != null) fields.put("role_name", str(b.get("roleName")));
        if (position != null) fields.put("position", position);
        if (department != null) fields.put("department", department);
        if (participationRole != null) fields.put("participation_role", participationRole);
        fields.put("employment_type", employmentType);
        if (b.get("isProjectManager") != null) fields.put("is_project_manager", truthy(b.get("isProjectManager")) ? 1 : 0);
        if (b.get("startDate") != null) fields.put("start_date", LocalDate.parse(str(b.get("startDate"))));
        if (b.get("endDate") != null) fields.put("end_date", LocalDate.parse(str(b.get("endDate"))));
        if (b.get("memo") != null) fields.put("memo", str(b.get("memo")));

        List<String> cols = List.copyOf(fields.keySet());
        String colList = String.join(", ", cols);
        String ph = String.join(", ", cols.stream().map(c -> "?").toList());
        Object[] vals = cols.stream().map(fields::get).toArray();
        jdbc.update("INSERT INTO pms_project_member (" + colList + ") VALUES (" + ph + ")", vals);
        Long memberId = jdbc.queryForObject("SELECT LAST_INSERT_ID()", Long.class);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("memberId", memberId);
        out.put("projectId", projectId);
        out.put("personId", personId);
        out.put("memberType", memberType);
        out.put("name", name.trim());
        out.put("employmentType", employmentType);
        out.put("role", participationRole);
        out.put("companyId", companyId);
        out.put("department", department);
        return out;
    }

    private static String requireInList(String field, Object value, List<String> list) {
        String s = String.valueOf(value);
        if (!list.contains(s)) {
            throw ApiException.badRequest("유효하지 않은 " + field + " 값: " + value
                    + " (허용: " + String.join(", ", list) + ")");
        }
        return s;
    }

    private static String str(Object o) { return o == null ? null : o.toString(); }
    private static Long toLongOrNull(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return n.longValue();
        try { return Long.parseLong(o.toString()); } catch (NumberFormatException e) { return null; }
    }
    private static boolean truthy(Object o) {
        if (o instanceof Boolean bo) return bo;
        if (o instanceof Number n) return n.intValue() != 0;
        return "true".equalsIgnoreCase(String.valueOf(o)) || "1".equals(String.valueOf(o));
    }
}
