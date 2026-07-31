package com.aetherpms.code;

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
import com.aetherpms.common.Json;

/**
 * 0044 — 공통 코드 마스터(pms_common_code). 흩어져 있던 분류 어휘(하드코딩 리스트·자유 텍스트)를
 * 그룹형 코드 테이블 하나로 통합하고, 관리자 '코드 관리' 화면에서 추가·수정·삭제한다.
 *
 * 규칙:
 *  - 그룹 자체는 시스템 정의(GROUPS) — 참조 컬럼·검증 지점과 결합되므로 그룹 신설은 코드 작업.
 *  - code는 참조 컬럼에 저장되는 값 그 자체(한글 어휘는 한글이 code) — 생성 후 불변.
 *  - 저장값 검증(require*)은 활성/비활성 무관 "존재하는 코드"를 허용 — 비활성 코드를 가진
 *    기존 행의 다른 필드 수정이 막히면 안 된다. 폼/필터 노출(listActive)은 활성만.
 *  - 삭제는 그룹별 참조 컬럼 합계 0건일 때만(참조 있으면 409 + 비활성 안내).
 */
@Service
public class CommonCodeService {

    /** 그룹 정의 — 라벨 + 삭제 가드용 참조 (table, column) 목록. */
    record GroupDef(String label, List<String[]> refs) {}

    private static final Map<String, GroupDef> GROUPS = new LinkedHashMap<>() {{
        put("EMPLOYMENT_TYPE", new GroupDef("인력구분", List.of(
                new String[]{"pms_person", "employment_type"},
                new String[]{"pms_project_member", "employment_type"})));
        put("CONTRACT_TYPE", new GroupDef("계약 형태", List.<String[]>of(
                new String[]{"pms_project_member", "contract_type"})));
        put("CONSORTIUM_ROLE", new GroupDef("컨소시엄 역할", List.<String[]>of(
                new String[]{"pms_project_company", "role"})));
        put("COMPANY_TYPE", new GroupDef("회사 유형", List.<String[]>of(
                new String[]{"pms_company", "company_type"})));
        put("PERSON_STATUS", new GroupDef("재직상태", List.<String[]>of(
                new String[]{"pms_person", "status"})));
        put("DOC_CATEGORY", new GroupDef("공문 분류", List.<String[]>of(
                new String[]{"pms_official_doc", "category"})));
        put("CLIENT_CATEGORY", new GroupDef("테일러링 고객사 분류", List.<String[]>of(
                new String[]{"pms_catalog_node", "client_category"})));
        put("VRB_STATUS", new GroupDef("VRB 상태", List.<String[]>of(
                new String[]{"pms_vrb_info", "status"})));
    }};

    private final JdbcTemplate jdbc;
    private final AuditWriter audit;

    public CommonCodeService(JdbcTemplate jdbc, AuditWriter audit) {
        this.jdbc = jdbc;
        this.audit = audit;
    }

    // =====================================================================
    // 조회
    // =====================================================================

    /** 그룹 목록(정의 순) — 관리자 화면 좌측 네비용. */
    public List<Map<String, Object>> groups() {
        return GROUPS.entrySet().stream().map(e -> {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("group", e.getKey());
            out.put("label", e.getValue().label());
            return (Map<String, Object>) out;
        }).toList();
    }

    /** 활성 코드 목록(정렬순) — 폼 select·필터용. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> listActive(String group) {
        requireGroup(group);
        return jdbc.queryForList(
                "SELECT group_code, code, label, attrs, sort_order FROM pms_common_code "
                + "WHERE group_code = ? AND is_active = 1 ORDER BY sort_order, code", group)
                .stream().map(CommonCodeService::mapRow).toList();
    }

    /** 관리자 목록 — 비활성 포함 + 참조 건수(삭제 가능 여부 근거). */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> listAll(String group) {
        GroupDef def = requireGroup(group);
        return jdbc.queryForList(
                "SELECT group_code, code, label, attrs, sort_order, is_active FROM pms_common_code "
                + "WHERE group_code = ? ORDER BY sort_order, code", group)
                .stream().map(r -> {
                    Map<String, Object> out = mapRow(r);
                    out.put("useCount", countRefs(def, (String) r.get("code")));
                    return out;
                }).toList();
    }

    /** 존재하는 코드 전체(활성/비활성 무관) — 저장값·필터값 검증용. */
    @Transactional(readOnly = true)
    public Set<String> knownCodes(String group) {
        requireGroup(group);
        return jdbc.queryForList(
                "SELECT code FROM pms_common_code WHERE group_code = ?", String.class, group)
                .stream().collect(Collectors.toSet());
    }

    /** 값 검증 — null/공백이면 null, 미지 코드는 400. */
    @Transactional(readOnly = true)
    public String nullableValid(String group, Object raw) {
        String v = raw == null ? null : raw.toString().trim();
        if (v == null || v.isEmpty()) return null;
        assertKnown(group, v);
        return v;
    }

    /** 값 검증 — null/공백이면 defaultCode, 미지 코드는 400. */
    @Transactional(readOnly = true)
    public String normalizeOrDefault(String group, Object raw, String defaultCode) {
        String v = raw == null ? null : raw.toString().trim();
        if (v == null || v.isEmpty()) v = defaultCode;
        assertKnown(group, v);
        return v;
    }

    /** attrs의 boolean 플래그(예: EMPLOYMENT_TYPE의 outsourced). 미정의는 false. */
    @Transactional(readOnly = true)
    public boolean flag(String group, String code, String attrKey) {
        if (code == null) return false;
        List<String> rows = jdbc.queryForList(
                "SELECT attrs FROM pms_common_code WHERE group_code = ? AND code = ?",
                String.class, group, code);
        if (rows.isEmpty() || rows.get(0) == null) return false;
        Object parsed = Json.readObject(rows.get(0));
        return parsed instanceof Map<?, ?> m && Boolean.TRUE.equals(m.get(attrKey));
    }

    // =====================================================================
    // 관리자 CRUD (/api/admin/codes — RbacInterceptor가 SYS_ADMIN 가드)
    // =====================================================================

    @Transactional
    public Map<String, Object> create(String group, Map<String, Object> body, Actor actor) {
        requireGroup(group);
        Map<String, Object> b = body == null ? Map.of() : body;
        String code = str(b.get("code"));
        if (code == null || code.length() > 50) {
            throw ApiException.badRequest("code는 비어있지 않은 50자 이하 문자열이어야 합니다.");
        }
        String label = str(b.get("label"));
        if (label == null) label = code;   // 어휘형 그룹(한글 code)은 라벨 생략 시 code 그대로
        Integer exists = jdbc.queryForObject(
                "SELECT COUNT(*) FROM pms_common_code WHERE group_code = ? AND code = ?",
                Integer.class, group, code);
        if (exists != null && exists > 0) throw ApiException.conflict("이미 존재하는 코드입니다: " + code);

        int sortOrder = b.get("sortOrder") instanceof Number n ? n.intValue() : nextSortOrder(group);
        jdbc.update("INSERT INTO pms_common_code (group_code, code, label, attrs, sort_order) VALUES (?,?,?,?,?)",
                group, code, label, attrsJson(b.get("attrs")), sortOrder);
        audit.write("COMMON_CODE", 0, null, "INSERT", null, null,
                Map.of("group", group, "code", code, "label", label), actor,
                "코드 추가 (관리자): " + group + "/" + code);
        return get(group, code);
    }

    @Transactional
    public Map<String, Object> update(String group, String code, Map<String, Object> body, Actor actor) {
        requireGroup(group);
        Map<String, Object> before = find(group, code);
        if (before == null) throw ApiException.notFound("코드를 찾을 수 없습니다: " + group + "/" + code);
        Map<String, Object> b = body == null ? Map.of() : body;

        Map<String, Object> set = new LinkedHashMap<>();
        if (b.containsKey("label")) {
            String label = str(b.get("label"));
            if (label == null) throw ApiException.badRequest("label은 비울 수 없습니다.");
            set.put("label", label);
        }
        if (b.containsKey("attrs")) set.put("attrs", attrsJson(b.get("attrs")));
        if (b.containsKey("sortOrder")) {
            if (!(b.get("sortOrder") instanceof Number n)) throw ApiException.badRequest("sortOrder는 숫자여야 합니다.");
            set.put("sort_order", n.intValue());
        }
        if (b.containsKey("isActive")) set.put("is_active", Boolean.TRUE.equals(b.get("isActive")) ? 1 : 0);
        if (set.isEmpty()) throw ApiException.badRequest("수정할 필드가 없습니다.");

        String assigns = set.keySet().stream().map(c -> c + " = ?").collect(Collectors.joining(", "));
        Object[] args = new Object[set.size() + 2];
        int i = 0;
        for (Object v : set.values()) args[i++] = v;
        args[i++] = group;
        args[i] = code;
        jdbc.update("UPDATE pms_common_code SET " + assigns + " WHERE group_code = ? AND code = ?", args);
        audit.write("COMMON_CODE", 0, null, "UPDATE", List.copyOf(set.keySet()),
                before, find(group, code), actor, "코드 수정 (관리자): " + group + "/" + code);
        return get(group, code);
    }

    @Transactional
    public Map<String, Object> delete(String group, String code, Actor actor) {
        GroupDef def = requireGroup(group);
        Map<String, Object> before = find(group, code);
        if (before == null) throw ApiException.notFound("코드를 찾을 수 없습니다: " + group + "/" + code);
        long refs = countRefs(def, code);
        if (refs > 0) {
            throw ApiException.conflict("사용 중인 코드는 삭제할 수 없습니다 (참조 " + refs
                    + "건). 대신 비활성으로 전환하세요.");
        }
        jdbc.update("DELETE FROM pms_common_code WHERE group_code = ? AND code = ?", group, code);
        audit.write("COMMON_CODE", 0, null, "DELETE", null, before, null, actor,
                "코드 삭제 (관리자, 참조 0건): " + group + "/" + code);
        return Map.of("deleted", true, "group", group, "code", code);
    }

    // =====================================================================
    // 내부
    // =====================================================================

    private static GroupDef requireGroup(String group) {
        GroupDef def = group == null ? null : GROUPS.get(group);
        if (def == null) {
            throw ApiException.badRequest("유효하지 않은 코드 그룹: " + group
                    + " (허용: " + String.join(", ", GROUPS.keySet()) + ")");
        }
        return def;
    }

    private void assertKnown(String group, String value) {
        if (!knownCodes(group).contains(value)) {
            GroupDef def = requireGroup(group);
            throw ApiException.badRequest("유효하지 않은 " + def.label() + " 값: " + value
                    + " (관리자 > 코드 관리에서 등록된 코드만 사용 가능)");
        }
    }

    private long countRefs(GroupDef def, String code) {
        long total = 0;
        for (String[] ref : def.refs()) {
            Long c = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM " + ref[0] + " WHERE " + ref[1] + " = ?", Long.class, code);
            total += c == null ? 0 : c;
        }
        return total;
    }

    private Map<String, Object> get(String group, String code) {
        Map<String, Object> row = find(group, code);
        if (row == null) throw ApiException.notFound("코드를 찾을 수 없습니다: " + group + "/" + code);
        return row;
    }

    private Map<String, Object> find(String group, String code) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT group_code, code, label, attrs, sort_order, is_active "
                + "FROM pms_common_code WHERE group_code = ? AND code = ?", group, code);
        return rows.isEmpty() ? null : mapRow(rows.get(0));
    }

    private int nextSortOrder(String group) {
        Integer max = jdbc.queryForObject(
                "SELECT MAX(sort_order) FROM pms_common_code WHERE group_code = ?", Integer.class, group);
        return (max == null ? 0 : max) + 10;
    }

    /** attrs 입력(객체 또는 null) → JSON 문자열. 그 외 타입은 400. */
    private static String attrsJson(Object v) {
        if (v == null) return null;
        if (!(v instanceof Map)) throw ApiException.badRequest("attrs는 객체(JSON) 또는 null이어야 합니다.");
        return ((Map<?, ?>) v).isEmpty() ? null : Json.write(v);
    }

    private static Map<String, Object> mapRow(Map<String, Object> r) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("group", r.get("group_code"));
        out.put("code", r.get("code"));
        out.put("label", r.get("label"));
        out.put("attrs", r.get("attrs") == null ? null : Json.readObject(r.get("attrs").toString()));
        out.put("sortOrder", r.get("sort_order") == null ? 0 : ((Number) r.get("sort_order")).intValue());
        if (r.containsKey("is_active")) {
            Object a = r.get("is_active");
            out.put("isActive", a instanceof Number n ? n.intValue() != 0 : Boolean.TRUE.equals(a));
        }
        return out;
    }

    private static String str(Object o) {
        if (o == null) return null;
        String s = o.toString().trim();
        return s.isEmpty() ? null : s;
    }
}
