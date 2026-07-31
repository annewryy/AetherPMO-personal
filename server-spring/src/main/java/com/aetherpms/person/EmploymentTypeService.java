package com.aetherpms.person;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.aetherpms.common.Actor;
import com.aetherpms.common.ApiException;
import com.aetherpms.common.AuditWriter;

/**
 * 0044 — 인력구분(employment_type) 코드 마스터.
 * 기존에는 5종이 DB CHECK + 백엔드 상수 2곳 + 프론트 상수 3곳에 하드코딩돼 있었다.
 * 이제 pms_employment_type 테이블이 단일 원천이고, 관리자 페이지에서 추가·수정·삭제한다.
 * 검증 규칙:
 *  - 저장값 검증(normalize)은 활성/비활성 무관하게 "존재하는 코드"를 허용한다 —
 *    비활성화된 코드를 가진 기존 인력의 다른 필드 수정이 막히면 안 되기 때문.
 *  - 폼/필터 노출(listActive)은 활성 코드만.
 *  - 삭제는 person/member 참조가 0건일 때만(참조 있으면 409 + 비활성 안내).
 */
@Service
public class EmploymentTypeService {

    private final JdbcTemplate jdbc;
    private final AuditWriter audit;

    public EmploymentTypeService(JdbcTemplate jdbc, AuditWriter audit) {
        this.jdbc = jdbc;
        this.audit = audit;
    }

    // =====================================================================
    // 조회
    // =====================================================================

    /** 활성 코드 목록(정렬순) — 인력 등록 폼·필터 체크박스용. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> listActive() {
        return jdbc.queryForList(
                "SELECT code, label, is_outsourced, sort_order FROM pms_employment_type "
                + "WHERE is_active = 1 ORDER BY sort_order, code")
                .stream().map(EmploymentTypeService::mapRow).toList();
    }

    /** 관리자 목록 — 비활성 포함 + 사용 건수(삭제 가능 여부 판단 근거). */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> listAll() {
        return jdbc.queryForList(
                "SELECT t.code, t.label, t.is_outsourced, t.sort_order, t.is_active, "
                + "  (SELECT COUNT(*) FROM pms_person p WHERE p.employment_type = t.code) AS person_count, "
                + "  (SELECT COUNT(*) FROM pms_project_member m WHERE m.employment_type = t.code) AS member_count "
                + "FROM pms_employment_type t ORDER BY t.sort_order, t.code")
                .stream().map(r -> {
                    Map<String, Object> out = mapRow(r);
                    out.put("personCount", ((Number) r.get("person_count")).longValue());
                    out.put("memberCount", ((Number) r.get("member_count")).longValue());
                    return out;
                }).toList();
    }

    /** 존재하는 코드 전체(활성/비활성 무관) — 저장값·필터값 검증용. */
    @Transactional(readOnly = true)
    public Set<String> knownCodes() {
        return jdbc.queryForList("SELECT code FROM pms_employment_type", String.class)
                .stream().collect(Collectors.toSet());
    }

    /** 외주 계열(소속회사 필수) 코드 집합. */
    @Transactional(readOnly = true)
    public Set<String> outsourcedCodes() {
        return jdbc.queryForList(
                "SELECT code FROM pms_employment_type WHERE is_outsourced = 1", String.class)
                .stream().collect(Collectors.toSet());
    }

    /** 공백/NULL → 'regular', 미지 코드는 400. (구 PersonSyncService.normalizeEmploymentType) */
    @Transactional(readOnly = true)
    public String normalize(String v) {
        String t = v == null ? "regular" : v.trim();
        if (t.isEmpty()) t = "regular";
        Set<String> known = knownCodes();
        if (!known.contains(t)) {
            throw ApiException.badRequest("유효하지 않은 employmentType 값: " + v
                    + " (허용: " + String.join(", ", known.stream().sorted().toList()) + ")");
        }
        return t;
    }

    // =====================================================================
    // 관리자 CRUD (/api/admin/employment-types — RbacInterceptor가 SYS_ADMIN 가드)
    // =====================================================================

    @Transactional
    public Map<String, Object> create(Map<String, Object> body, Actor actor) {
        Map<String, Object> b = body == null ? Map.of() : body;
        String code = str(b.get("code"));
        if (code == null || !code.matches("[a-z][a-z0-9_]{0,29}")) {
            throw ApiException.badRequest("code는 영소문자로 시작하는 소문자/숫자/밑줄 1~30자여야 합니다.");
        }
        String label = str(b.get("label"));
        if (label == null || label.isEmpty()) throw ApiException.badRequest("label(표시명)은 필수입니다.");
        Integer exists = jdbc.queryForObject(
                "SELECT COUNT(*) FROM pms_employment_type WHERE code = ?", Integer.class, code);
        if (exists != null && exists > 0) throw ApiException.conflict("이미 존재하는 코드입니다: " + code);

        boolean outsourced = Boolean.TRUE.equals(b.get("isOutsourced"));
        int sortOrder = b.get("sortOrder") instanceof Number n ? n.intValue() : nextSortOrder();
        jdbc.update("INSERT INTO pms_employment_type (code, label, is_outsourced, sort_order) VALUES (?,?,?,?)",
                code, label, outsourced ? 1 : 0, sortOrder);
        audit.write("EMPLOYMENT_TYPE", 0, null, "INSERT", null, null,
                Map.of("code", code, "label", label), actor, "인력구분 추가 (관리자): " + code);
        return get(code);
    }

    @Transactional
    public Map<String, Object> update(String code, Map<String, Object> body, Actor actor) {
        Map<String, Object> before = find(code);
        if (before == null) throw ApiException.notFound("인력구분을 찾을 수 없습니다: " + code);
        Map<String, Object> b = body == null ? Map.of() : body;

        Map<String, Object> set = new LinkedHashMap<>();
        if (b.containsKey("label")) {
            String label = str(b.get("label"));
            if (label == null || label.isEmpty()) throw ApiException.badRequest("label은 비울 수 없습니다.");
            set.put("label", label);
        }
        if (b.containsKey("isOutsourced")) set.put("is_outsourced", Boolean.TRUE.equals(b.get("isOutsourced")) ? 1 : 0);
        if (b.containsKey("sortOrder")) {
            if (!(b.get("sortOrder") instanceof Number n)) throw ApiException.badRequest("sortOrder는 숫자여야 합니다.");
            set.put("sort_order", n.intValue());
        }
        if (b.containsKey("isActive")) set.put("is_active", Boolean.TRUE.equals(b.get("isActive")) ? 1 : 0);
        if (set.isEmpty()) throw ApiException.badRequest("수정할 필드가 없습니다.");

        String assigns = set.keySet().stream().map(c -> c + " = ?").collect(Collectors.joining(", "));
        Object[] args = new Object[set.size() + 1];
        int i = 0;
        for (Object v : set.values()) args[i++] = v;
        args[i] = code;
        jdbc.update("UPDATE pms_employment_type SET " + assigns + " WHERE code = ?", args);
        audit.write("EMPLOYMENT_TYPE", 0, null, "UPDATE", List.copyOf(set.keySet()),
                before, find(code), actor, "인력구분 수정 (관리자): " + code);
        return get(code);
    }

    @Transactional
    public Map<String, Object> delete(String code, Actor actor) {
        Map<String, Object> before = find(code);
        if (before == null) throw ApiException.notFound("인력구분을 찾을 수 없습니다: " + code);
        long persons = countRefs("pms_person", code);
        long members = countRefs("pms_project_member", code);
        if (persons + members > 0) {
            throw ApiException.conflict("사용 중인 인력구분은 삭제할 수 없습니다 (인력 " + persons
                    + " · 참여인력 " + members + "). 대신 비활성으로 전환하세요.");
        }
        jdbc.update("DELETE FROM pms_employment_type WHERE code = ?", code);
        audit.write("EMPLOYMENT_TYPE", 0, null, "DELETE", null, before, null, actor,
                "인력구분 삭제 (관리자, 참조 0건): " + code);
        return Map.of("deleted", true, "code", code);
    }

    // =====================================================================
    // 내부
    // =====================================================================

    private Map<String, Object> get(String code) {
        Map<String, Object> row = find(code);
        if (row == null) throw ApiException.notFound("인력구분을 찾을 수 없습니다: " + code);
        return row;
    }

    private Map<String, Object> find(String code) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT code, label, is_outsourced, sort_order, is_active "
                + "FROM pms_employment_type WHERE code = ?", code);
        return rows.isEmpty() ? null : mapRow(rows.get(0));
    }

    private long countRefs(String table, String code) {
        Long c = jdbc.queryForObject(
                "SELECT COUNT(*) FROM " + table + " WHERE employment_type = ?", Long.class, code);
        return c == null ? 0 : c;
    }

    private int nextSortOrder() {
        Integer max = jdbc.queryForObject("SELECT MAX(sort_order) FROM pms_employment_type", Integer.class);
        return (max == null ? 0 : max) + 10;
    }

    private static Map<String, Object> mapRow(Map<String, Object> r) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("code", r.get("code"));
        out.put("label", r.get("label"));
        out.put("isOutsourced", truthy(r.get("is_outsourced")));
        out.put("sortOrder", r.get("sort_order") == null ? 0 : ((Number) r.get("sort_order")).intValue());
        if (r.containsKey("is_active")) out.put("isActive", truthy(r.get("is_active")));
        return out;
    }

    private static boolean truthy(Object v) {
        return v instanceof Number n ? n.intValue() != 0 : Boolean.TRUE.equals(v);
    }

    private static String str(Object o) {
        if (o == null) return null;
        String s = o.toString().trim();
        return s.isEmpty() ? null : s;
    }
}
