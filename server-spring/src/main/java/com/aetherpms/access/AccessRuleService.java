package com.aetherpms.access;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import com.aetherpms.common.ApiException;
import com.aetherpms.common.Json;

/**
 * 0034 — 부서×직책×인력구분 접근 규칙(③) 판정 + CRUD.
 * 메뉴는 ③으로만 결정(§2). 관리포인트 capabilities/project_scope 컬럼은 스키마만 두고
 * 실제 결합 판정(§3)은 2단계에서 배선한다.
 */
@Service
public class AccessRuleService {

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(AccessRuleService.class);

    private final JdbcTemplate jdbc;

    public AccessRuleService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // ================= 조회(관리자 CRUD) =================

    public List<Map<String, Object>> list() {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT * FROM pms_access_rule ORDER BY priority, rule_id");
        return rows.stream().map(AccessRuleService::shape).toList();
    }

    public Map<String, Object> create(Map<String, Object> body) {
        Map<String, Object> f = normalize(body, true);
        jdbc.update("""
                INSERT INTO pms_access_rule
                  (dept_code, include_sub, position_code, employment_type, menu_keys,
                   project_scope, capabilities, priority, enabled, name)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                f.get("dept_code"), f.get("include_sub"), f.get("position_code"), f.get("employment_type"),
                f.get("menu_keys"), f.get("project_scope"), f.get("capabilities"), f.get("priority"),
                f.get("enabled"), f.get("name"));
        Long id = jdbc.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        return get(id);
    }

    public Map<String, Object> update(long id, Map<String, Object> body) {
        Map<String, Object> f = normalize(body, false);
        List<String> cols = new ArrayList<>(f.keySet());
        if (cols.isEmpty()) throw ApiException.badRequest("수정할 필드가 없습니다.");
        String assign = String.join(", ", cols.stream().map(c -> c + " = ?").toList());
        Object[] vals = new Object[cols.size() + 1];
        for (int i = 0; i < cols.size(); i++) vals[i] = f.get(cols.get(i));
        vals[cols.size()] = id;
        int n = jdbc.update("UPDATE pms_access_rule SET " + assign + " WHERE rule_id = ?", vals);
        if (n == 0) throw ApiException.notFound("규칙을 찾을 수 없습니다: " + id);
        return get(id);
    }

    public void delete(long id) {
        int n = jdbc.update("DELETE FROM pms_access_rule WHERE rule_id = ?", id);
        if (n == 0) throw ApiException.notFound("규칙을 찾을 수 없습니다: " + id);
    }

    private Map<String, Object> get(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT * FROM pms_access_rule WHERE rule_id = ?", id);
        if (rows.isEmpty()) throw ApiException.notFound("규칙을 찾을 수 없습니다: " + id);
        return shape(rows.get(0));
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> normalize(Map<String, Object> body, boolean requireAll) {
        Map<String, Object> f = new LinkedHashMap<>();
        if (body.containsKey("deptCode") || requireAll) f.put("dept_code", strOrNull(body.get("deptCode")));
        if (body.containsKey("includeSub") || requireAll) {
            Object v = body.get("includeSub");
            f.put("include_sub", v == null || truthy(v));
        }
        if (body.containsKey("positionCode") || requireAll) {
            String pc = strOrNull(body.get("positionCode"));
            if (pc != null && !PositionCode.ALL.contains(pc)) {
                throw ApiException.badRequest("유효하지 않은 직책 코드: " + pc + " (허용: " + PositionCode.ALL + ")");
            }
            f.put("position_code", pc);
        }
        if (body.containsKey("employmentType") || requireAll) f.put("employment_type", strOrNull(body.get("employmentType")));
        if (body.containsKey("menuKeys") || requireAll) {
            Object mk = body.get("menuKeys");
            List<?> list = mk instanceof List<?> l ? l : List.of();
            for (Object k : list) {
                if (!MenuKeys.ALL.contains(String.valueOf(k))) {
                    throw ApiException.badRequest("알 수 없는 메뉴 키: " + k + " (허용: " + MenuKeys.ALL + ")");
                }
            }
            f.put("menu_keys", Json.write(list));
        }
        if (body.containsKey("projectScope") || requireAll) {
            String ps = strOrNull(body.get("projectScope"));
            ps = ps == null ? "PARTICIPATING" : ps;
            if (!Set.of("ALL", "DEPT", "PARTICIPATING").contains(ps)) {
                throw ApiException.badRequest("projectScope는 ALL/DEPT/PARTICIPATING 중 하나여야 합니다.");
            }
            f.put("project_scope", ps);
        }
        if (body.containsKey("capabilities")) {
            Object c = body.get("capabilities");
            f.put("capabilities", c == null ? null : Json.write(c));
        }
        if (body.containsKey("priority") || requireAll) {
            Object p = body.get("priority");
            f.put("priority", p == null ? 100 : ((Number) p).intValue());
        }
        if (body.containsKey("enabled") || requireAll) {
            Object e = body.get("enabled");
            f.put("enabled", e == null || truthy(e));
        }
        if (body.containsKey("name") || requireAll) f.put("name", strOrNull(body.get("name")));
        return f;
    }

    private static boolean truthy(Object v) {
        return Boolean.TRUE.equals(v) || "true".equalsIgnoreCase(String.valueOf(v));
    }
    private static String strOrNull(Object v) {
        return v == null || String.valueOf(v).isBlank() ? null : String.valueOf(v).trim();
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> shape(Map<String, Object> r) {
        Map<String, Object> o = new LinkedHashMap<>();
        o.put("ruleId", ((Number) r.get("rule_id")).longValue());
        o.put("name", r.get("name"));
        o.put("deptCode", r.get("dept_code"));
        o.put("includeSub", toBool(r.get("include_sub")));
        o.put("positionCode", r.get("position_code"));
        o.put("employmentType", r.get("employment_type"));
        o.put("menuKeys", Json.readArray(String.valueOf(r.get("menu_keys"))));  // List<?> — 프론트로 그대로 직렬화
        o.put("projectScope", r.get("project_scope"));
        Object cap = r.get("capabilities");
        o.put("capabilities", cap == null ? null : Json.readObject(String.valueOf(cap)));
        o.put("priority", ((Number) r.get("priority")).intValue());
        o.put("enabled", toBool(r.get("enabled")));
        return o;
    }
    private static boolean toBool(Object v) {
        if (v instanceof Boolean b) return b;
        if (v instanceof Number n) return n.intValue() != 0;
        return false;
    }

    // ================= 판정 =================

    /** rule_id → dept_nm 부분집합(하위 포함 여부 반영), 캐시 없이 매 호출 계산(조직 규모상 무리 없음). */
    private Set<String> expandDeptNames(String deptCode, boolean includeSub) {
        Set<String> out = new HashSet<>();
        List<Map<String, Object>> all = jdbc.queryForList("SELECT dept_code, upper_dept_code, dept_nm FROM pms_org_dept");
        Map<String, String> nameByCode = new LinkedHashMap<>();
        Map<String, List<String>> childrenOf = new LinkedHashMap<>();
        for (Map<String, Object> d : all) {
            String code = String.valueOf(d.get("dept_code"));
            nameByCode.put(code, String.valueOf(d.get("dept_nm")));
            String upper = d.get("upper_dept_code") == null ? null : String.valueOf(d.get("upper_dept_code"));
            if (upper != null) childrenOf.computeIfAbsent(upper, k -> new ArrayList<>()).add(code);
        }
        if (!nameByCode.containsKey(deptCode)) return out;
        out.add(nameByCode.get(deptCode));
        if (includeSub) {
            java.util.Deque<String> stack = new java.util.ArrayDeque<>(childrenOf.getOrDefault(deptCode, List.of()));
            while (!stack.isEmpty()) {
                String code = stack.pop();
                out.add(nameByCode.get(code));
                stack.addAll(childrenOf.getOrDefault(code, List.of()));
            }
        }
        return out;
    }

    private boolean ruleMatches(Map<String, Object> rule, Map<String, Object> person) {
        String deptCode = (String) rule.get("dept_code");
        if (deptCode != null) {
            Set<String> names = expandDeptNames(deptCode, toBool(rule.get("include_sub")));
            String personDept = (String) person.get("department");
            if (personDept == null || !names.contains(personDept)) return false;
        }
        String posCode = (String) rule.get("position_code");
        if (posCode != null && !posCode.equals(PositionCode.of((String) person.get("position")))) return false;
        String empType = (String) rule.get("employment_type");
        if (empType != null && !empType.equals(person.get("employment_type"))) return false;
        return true;
    }

    /**
     * 0034 §1단계 — 로그인 사용자의 최종 유효 메뉴(특수 역할 포함). AuthService(응답용)와
     * RbacInterceptor(서버 문지기용) 양쪽이 이 메서드 하나로 판정해 로직이 갈라지지 않게 한다.
     * SYS_ADMIN=전체(관리자 콘솔 포함), VIEWER=관리자 콘솔 제외 전체(0031 매트릭스), 그 외=규칙 판정.
     */
    public Set<String> effectiveMenus(String role, Long personId) {
        if ("SYS_ADMIN".equals(role)) return new java.util.LinkedHashSet<>(MenuKeys.ALL);
        if ("VIEWER".equals(role)) {
            Set<String> m = new java.util.LinkedHashSet<>(MenuKeys.ALL);
            m.remove(MenuKeys.ADMIN);
            return m;
        }
        return resolveMenus(personId);
    }

    /** 로그인 사용자의 유효 메뉴 키 집합. person 미연결/매칭 규칙 없음 = 기본값(대시보드만, 0034 §5 결정3). */
    public Set<String> resolveMenus(Long personId) {
        if (personId == null) return Set.of(MenuKeys.DASHBOARD);
        List<Map<String, Object>> people = jdbc.queryForList(
                "SELECT department, position, employment_type FROM pms_person WHERE person_id = ?", personId);
        if (people.isEmpty()) return Set.of(MenuKeys.DASHBOARD);
        Map<String, Object> person = people.get(0);

        Set<String> menus = new HashSet<>();
        List<Map<String, Object>> rules = jdbc.queryForList(
                "SELECT * FROM pms_access_rule WHERE enabled = 1");
        for (Map<String, Object> rule : rules) {
            try {
                if (ruleMatches(rule, person)) {
                    Object arr = Json.readArray(String.valueOf(rule.get("menu_keys")));
                    if (arr instanceof List<?> list) for (Object k : list) menus.add(String.valueOf(k));
                }
            } catch (RuntimeException e) {
                log.warn("접근 규칙 판정 실패(rule_id={}) — 이 규칙 건너뜀: {}", rule.get("rule_id"), e.getMessage());
            }
        }
        return menus.isEmpty() ? Set.of(MenuKeys.DASHBOARD) : menus;
    }

    /** §4 판정 시뮬레이터 — 사용자 하나의 매칭 규칙·유효 메뉴를 미리보기. */
    public Map<String, Object> simulate(long personId) {
        List<Map<String, Object>> people = jdbc.queryForList(
                "SELECT person_id, name, department, position, employment_type FROM pms_person WHERE person_id = ?", personId);
        if (people.isEmpty()) throw ApiException.notFound("인력을 찾을 수 없습니다: " + personId);
        Map<String, Object> person = people.get(0);

        List<Map<String, Object>> matched = new ArrayList<>();
        List<Map<String, Object>> rules = jdbc.queryForList("SELECT * FROM pms_access_rule WHERE enabled = 1 ORDER BY priority");
        for (Map<String, Object> rule : rules) {
            if (ruleMatches(rule, person)) matched.add(shape(rule));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("person", Map.of(
                "personId", person.get("person_id"), "name", person.get("name"),
                "department", person.get("department"), "position", person.get("position"),
                "positionCode", PositionCode.of((String) person.get("position")),
                "employmentType", person.get("employment_type")));
        out.put("matchedRules", matched);
        out.put("effectiveMenus", resolveMenus(personId));
        return out;
    }
}
