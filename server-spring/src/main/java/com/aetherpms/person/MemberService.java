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

    private com.aetherpms.notification.NotificationService notify;

    private final JdbcTemplate jdbc;
    private final PersonSyncService personSync;

    public MemberService(JdbcTemplate jdbc, PersonSyncService personSync, com.aetherpms.notification.NotificationService notify) {
        this.jdbc = jdbc;
        this.personSync = personSync;
        this.notify = notify;
    }

    private static final List<String> MEMBER_TYPES = List.of("INTERNAL", "EXTERNAL");
    private static final List<String> PARTICIPATION_ROLES = List.of(
            "PM", "PL", "PMO", "TA", "AA", "DA", "DBA", "SE", "DEV", "QA", "CT", "ETC",
            "EXEC"); // 0034 §5 결정4 — 경영진 참여역할(전 프로젝트 자동 등록, ExecAutoRegisterService)

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
        // 0033 ② — 참여인력 등록 알림(수신 person 직접 확정 — 이름 판정 불필요)
        boolean isPmFlag = Integer.valueOf(1).equals(fields.get("is_project_manager"));
        String pjName = jdbc.query("SELECT project_name FROM pms_project WHERE project_id = ?",
                rs -> rs.next() ? rs.getString(1) : null, projectId);
        notify.notifyPerson(personId, "PROJECT_ASSIGNED", projectId, "PROJECT", projectId, null,
                "프로젝트 '" + pjName + "'에 " + (isPmFlag ? "PM으로 " : "") + "참여인력으로 등록되었습니다.");

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

    /** 참여인력 수정 — PATCH /api/projects/{id}/members/{memberId}. 제공된 필드만 갱신. */
    @Transactional
    public Map<String, Object> updateMember(long projectId, long memberId, Map<String, Object> body, Actor actor) {
        if (projectId <= 0) throw ApiException.badRequest("유효하지 않은 projectId입니다.");
        if (memberId <= 0) throw ApiException.badRequest("유효하지 않은 memberId입니다.");
        Map<String, Object> b = body == null ? Map.of() : body;
        List<String> allowed = List.of("memberType", "userUid", "amaranthEmpNo", "name",
                "company", "companyId", "roleName", "position", "department",
                "participationRole", "employmentType", "isProjectManager",
                "startDate", "endDate", "memo",
                "projectId");   // 0028 §C: 참여인력 관리에서 투입 프로젝트 이동
        List<String> unknown = b.keySet().stream().filter(k -> !allowed.contains(k)).toList();
        if (!unknown.isEmpty()) {
            throw ApiException.badRequest("허용되지 않는 필드: " + String.join(", ", unknown));
        }

        // 멤버가 해당 프로젝트 소속인지 확인.
        List<Map<String, Object>> cur = jdbc.queryForList(
                "SELECT person_id FROM pms_project_member WHERE member_id = ? AND project_id = ?",
                memberId, projectId);
        if (cur.isEmpty()) throw ApiException.notFound("참여인력을 찾을 수 없습니다.");

        Map<String, Object> set = new LinkedHashMap<>();
        if (b.containsKey("name")) {
            String name = str(b.get("name"));
            if (name == null || name.trim().isEmpty()) throw ApiException.badRequest("name은 비울 수 없습니다.");
            set.put("name", name.trim());
        }
        if (b.containsKey("memberType")) {
            set.put("member_type", requireInList("memberType", b.get("memberType"), MEMBER_TYPES));
        }
        if (b.containsKey("userUid")) set.put("user_uid", str(b.get("userUid")));
        if (b.containsKey("company")) set.put("company", str(b.get("company")));
        if (b.containsKey("companyId")) set.put("company_id", toLongOrNull(b.get("companyId")));
        if (b.containsKey("roleName")) set.put("role_name", str(b.get("roleName")));
        if (b.containsKey("position")) set.put("position", str(b.get("position")));
        if (b.containsKey("department")) set.put("department", str(b.get("department")));
        if (b.containsKey("participationRole")) {
            set.put("participation_role", b.get("participationRole") == null ? null
                    : requireInList("participationRole", b.get("participationRole"), PARTICIPATION_ROLES));
        }
        if (b.containsKey("employmentType")) {
            set.put("employment_type", PersonSyncService.normalizeEmploymentType(str(b.get("employmentType"))));
        }
        if (b.containsKey("isProjectManager")) {
            set.put("is_project_manager", truthy(b.get("isProjectManager")) ? 1 : 0);
        }
        if (b.containsKey("startDate")) {
            String v = str(b.get("startDate"));
            set.put("start_date", v == null || v.isEmpty() ? null : LocalDate.parse(v));
        }
        if (b.containsKey("endDate")) {
            String v = str(b.get("endDate"));
            set.put("end_date", v == null || v.isEmpty() ? null : LocalDate.parse(v));
        }
        if (b.containsKey("memo")) set.put("memo", str(b.get("memo")));
        // 0028 §C: 투입 프로젝트 이동 — 대상 프로젝트 존재 검증 후 project_id 변경(행·이력 보존).
        if (b.containsKey("projectId")) {
            Long np = toLongOrNull(b.get("projectId"));
            if (np == null || np <= 0) throw ApiException.badRequest("유효하지 않은 projectId입니다.");
            Integer exists = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM pms_project WHERE project_id = ?", Integer.class, np);
            if (exists == null || exists == 0) throw ApiException.notFound("이동할 프로젝트를 찾을 수 없습니다.");
            set.put("project_id", np);
        }

        // 조직도 재선택(amaranthEmpNo)이면 person 재연결(0005 §D find-or-insert).
        if (b.get("amaranthEmpNo") != null && !str(b.get("amaranthEmpNo")).isBlank()) {
            String memberType = set.containsKey("member_type") ? (String) set.get("member_type")
                    : str(jdbc.queryForObject(
                        "SELECT member_type FROM pms_project_member WHERE member_id=?", String.class, memberId));
            String name = set.containsKey("name") ? (String) set.get("name")
                    : jdbc.queryForObject("SELECT name FROM pms_project_member WHERE member_id=?", String.class, memberId);
            String employmentType = set.containsKey("employment_type") ? (String) set.get("employment_type")
                    : jdbc.queryForObject("SELECT employment_type FROM pms_project_member WHERE member_id=?", String.class, memberId);
            long personId = personSync.findOrInsertPerson(memberType, str(b.get("amaranthEmpNo")), str(b.get("userUid")),
                    name, employmentType, toLongOrNull(b.get("companyId")),
                    str(b.get("department")), str(b.get("position")));
            set.put("person_id", personId);
        }

        if (!set.isEmpty()) {
            set.put("updated_at", java.time.LocalDateTime.now());
            List<String> cols = List.copyOf(set.keySet());
            String assign = String.join(", ", cols.stream().map(c -> c + " = ?").toList());
            Object[] vals = new Object[cols.size() + 2];
            for (int i = 0; i < cols.size(); i++) vals[i] = set.get(cols.get(i));
            vals[cols.size()] = memberId;
            vals[cols.size() + 1] = projectId;
            jdbc.update("UPDATE pms_project_member SET " + assign + " WHERE member_id = ? AND project_id = ?", vals);
        }
        return getMemberDetail(memberId);
    }

    /** 참여인력 삭제 — DELETE /api/projects/{id}/members/{memberId}. 행 제거(가용성은 CASCADE). */
    @Transactional
    public void deleteMember(long projectId, long memberId, Actor actor) {
        if (projectId <= 0) throw ApiException.badRequest("유효하지 않은 projectId입니다.");
        if (memberId <= 0) throw ApiException.badRequest("유효하지 않은 memberId입니다.");
        int n = jdbc.update("DELETE FROM pms_project_member WHERE member_id = ? AND project_id = ?",
                memberId, projectId);
        if (n == 0) throw ApiException.notFound("참여인력을 찾을 수 없습니다.");
    }

    /** GET 목록과 동일 shape의 단건(camelCase). PATCH 응답용. */
    private Map<String, Object> getMemberDetail(long memberId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT member_id, project_id, member_type, user_uid, name, person_id, company, " +
                "       company_id, position, participation_role, role_name, department, " +
                "       employment_type, is_project_manager, is_active " +
                "FROM pms_project_member WHERE member_id = ?", memberId);
        if (rows.isEmpty()) throw ApiException.notFound("참여인력을 찾을 수 없습니다.");
        Map<String, Object> r = rows.get(0);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("memberId", r.get("member_id"));
        out.put("projectId", r.get("project_id"));
        out.put("memberType", r.get("member_type"));
        out.put("userUid", r.get("user_uid"));
        out.put("name", r.get("name"));
        out.put("personId", r.get("person_id"));
        out.put("company", r.get("company"));
        out.put("companyId", r.get("company_id"));
        out.put("position", r.get("position"));
        out.put("role", r.get("participation_role"));
        out.put("participationRole", r.get("participation_role"));
        out.put("roleName", r.get("role_name"));
        out.put("department", r.get("department"));
        out.put("employmentType", r.get("employment_type"));
        out.put("isProjectManager", truthy(r.get("is_project_manager")));
        out.put("isActive", r.get("is_active") == null || truthy(r.get("is_active")));
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
