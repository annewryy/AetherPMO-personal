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
import com.aetherpms.org.OrgTreeService;

/**
 * 0034 — 부서×직책×인력구분 접근 규칙(③) 판정 + CRUD.
 * 메뉴는 ③으로만 결정(§2). 관리포인트 capabilities/project_scope 컬럼은 스키마만 두고
 * 실제 결합 판정(§3)은 2단계에서 배선한다.
 */
@Service
public class AccessRuleService {

    /** 0039 — 관리포인트 권한 어휘(0034 §3). RoleCapabilityController와 동일해야 한다. */
    private static final List<String> CAP_KEYS = List.of(
            "project.edit", "member.manage", "task.edit", "issue.edit",
            "action.edit", "deliverable.edit", "meeting.write", "doc.write");
    private static final List<String> TRISTATE_CAPS =
            List.of("task.edit", "issue.edit", "action.edit", "deliverable.edit");

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(AccessRuleService.class);

    private final JdbcTemplate jdbc;
    private final OrgTreeService orgTree;

    public AccessRuleService(JdbcTemplate jdbc, OrgTreeService orgTree) {
        this.jdbc = jdbc;
        this.orgTree = orgTree;
    }

    // ================= 조회(관리자 CRUD) =================

    public List<Map<String, Object>> list() {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT * FROM pms_access_rule ORDER BY priority, rule_id");
        Map<Long, List<Map<String, Object>>> personsByRule = personsByRule(null);  // 1회 조회(N+1 방지)
        return rows.stream().map(r -> shape(r, personsByRule)).toList();
    }

    // ================= 인력 지정 축(0034 보완) =================
    //   부서·직책으로 표현되지 않는 집단(예: 여러 부서에 흩어진 무직책 영업 인력)을 위해
    //   규칙 1건에 인력 N명을 배정한다. 배정이 없으면 이 축은 따지지 않는다(기존 규칙 동작 불변).

    /** ruleId → [{personId, name}]. ruleId=null이면 전 규칙(목록용 1회 조회). */
    private Map<Long, List<Map<String, Object>>> personsByRule(Long ruleId) {
        String sql = """
                SELECT rp.rule_id, rp.person_id, p.name
                  FROM pms_access_rule_person rp
                  JOIN pms_person p ON p.person_id = rp.person_id""";
        List<Map<String, Object>> rows = ruleId == null
                ? jdbc.queryForList(sql + " ORDER BY p.name")
                : jdbc.queryForList(sql + " WHERE rp.rule_id = ? ORDER BY p.name", ruleId);
        Map<Long, List<Map<String, Object>>> out = new LinkedHashMap<>();
        for (Map<String, Object> r : rows) {
            Map<String, Object> one = new LinkedHashMap<>();
            one.put("personId", ((Number) r.get("person_id")).longValue());
            one.put("name", r.get("name"));
            out.computeIfAbsent(((Number) r.get("rule_id")).longValue(), k -> new ArrayList<>()).add(one);
        }
        return out;
    }

    /** ruleId → 배정 person_id 집합(판정용, 이름 불필요). */
    private Map<Long, Set<Long>> personIdsByRule() {
        Map<Long, Set<Long>> out = new LinkedHashMap<>();
        for (Map<String, Object> r : jdbc.queryForList("SELECT rule_id, person_id FROM pms_access_rule_person")) {
            out.computeIfAbsent(((Number) r.get("rule_id")).longValue(), k -> new HashSet<>())
               .add(((Number) r.get("person_id")).longValue());
        }
        return out;
    }

    /** personIds가 본문에 있을 때만 전량 치환(delete-then-insert). 없으면 손대지 않는다. */
    private void syncPersons(long ruleId, Map<String, Object> body) {
        if (!body.containsKey("personIds")) return;
        Object raw = body.get("personIds");
        List<Long> ids = new ArrayList<>();
        if (raw instanceof List<?> list) {
            for (Object o : list) {
                long v;
                try {
                    v = o instanceof Number n ? n.longValue() : Long.parseLong(String.valueOf(o));
                } catch (NumberFormatException e) {
                    throw ApiException.badRequest("personIds에 유효하지 않은 값이 있습니다: " + o);
                }
                if (v <= 0) throw ApiException.badRequest("personIds에 유효하지 않은 값이 있습니다: " + o);
                if (!ids.contains(v)) ids.add(v);
            }
        } else if (raw != null) {
            throw ApiException.badRequest("personIds는 배열이어야 합니다.");
        }
        if (!ids.isEmpty()) {
            String ph = String.join(",", java.util.Collections.nCopies(ids.size(), "?"));
            Integer found = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM pms_person WHERE person_id IN (" + ph + ")",
                    Integer.class, ids.toArray());
            if (found == null || found != ids.size()) {
                throw ApiException.badRequest("personIds에 존재하지 않는 인력이 있습니다.");
            }
        }
        jdbc.update("DELETE FROM pms_access_rule_person WHERE rule_id = ?", ruleId);
        for (Long pid : ids) {
            jdbc.update("INSERT INTO pms_access_rule_person (rule_id, person_id) VALUES (?, ?)", ruleId, pid);
        }
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
        syncPersons(id, body);
        return get(id);
    }

    public Map<String, Object> update(long id, Map<String, Object> body) {
        Map<String, Object> f = normalize(body, false);
        List<String> cols = new ArrayList<>(f.keySet());
        // personIds만 보낸 수정도 유효하다(인력 배정만 변경).
        if (cols.isEmpty() && !body.containsKey("personIds")) {
            throw ApiException.badRequest("수정할 필드가 없습니다.");
        }
        if (!cols.isEmpty()) {
            String assign = String.join(", ", cols.stream().map(c -> c + " = ?").toList());
            Object[] vals = new Object[cols.size() + 1];
            for (int i = 0; i < cols.size(); i++) vals[i] = f.get(cols.get(i));
            vals[cols.size()] = id;
            int n = jdbc.update("UPDATE pms_access_rule SET " + assign + " WHERE rule_id = ?", vals);
            if (n == 0) throw ApiException.notFound("규칙을 찾을 수 없습니다: " + id);
        } else {
            Integer exists = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM pms_access_rule WHERE rule_id = ?", Integer.class, id);
            if (exists == null || exists == 0) throw ApiException.notFound("규칙을 찾을 수 없습니다: " + id);
        }
        syncPersons(id, body);
        return get(id);
    }

    public void delete(long id) {
        int n = jdbc.update("DELETE FROM pms_access_rule WHERE rule_id = ?", id);
        if (n == 0) throw ApiException.notFound("규칙을 찾을 수 없습니다: " + id);
    }

    private Map<String, Object> get(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT * FROM pms_access_rule WHERE rule_id = ?", id);
        if (rows.isEmpty()) throw ApiException.notFound("규칙을 찾을 수 없습니다: " + id);
        return shape(rows.get(0), personsByRule(id));
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
            f.put("capabilities", c == null ? null : Json.write(validateCapabilities(c)));
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
    /**
     * 0039 — 규칙이 부여하는 관리포인트 권한 검증. 역할 권한(④)과 같은 어휘를 쓴다.
     *   키/값이 틀리면 조용히 무시되는 대신 400으로 돌려준다(권한은 조용히 틀리면 안 된다).
     */
    private static Map<String, Object> validateCapabilities(Object raw) {
        if (!(raw instanceof Map<?, ?> m)) {
            throw ApiException.badRequest("capabilities는 객체여야 합니다.");
        }
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map.Entry<?, ?> e : m.entrySet()) {
            String k = String.valueOf(e.getKey());
            if (!CAP_KEYS.contains(k)) {
                throw ApiException.badRequest("알 수 없는 권한 키: " + k
                        + " (허용: " + String.join(", ", CAP_KEYS) + ")");
            }
            Object v = e.getValue();
            if (TRISTATE_CAPS.contains(k)) {
                if (!("all".equals(v) || "own".equals(v) || Boolean.FALSE.equals(v))) {
                    throw ApiException.badRequest(k + "는 all/own/false 중 하나여야 합니다.");
                }
            } else if (!(v instanceof Boolean)) {
                throw ApiException.badRequest(k + "는 boolean이어야 합니다.");
            }
            out.put(k, v);
        }
        return out;
    }

    private static Map<String, Object> shape(Map<String, Object> r, Map<Long, List<Map<String, Object>>> personsByRule) {
        Map<String, Object> o = new LinkedHashMap<>();
        long ruleId = ((Number) r.get("rule_id")).longValue();
        o.put("ruleId", ruleId);
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
        // 인력 지정 축 — persons는 화면 표시용(이름 포함), personIds는 폼 왕복용.
        List<Map<String, Object>> persons = personsByRule.getOrDefault(ruleId, List.of());
        o.put("persons", persons);
        o.put("personIds", persons.stream().map(p -> p.get("personId")).toList());
        return o;
    }
    private static boolean toBool(Object v) {
        if (v instanceof Boolean b) return b;
        if (v instanceof Number n) return n.intValue() != 0;
        return false;
    }

    // ================= 판정 =================

    /**
     * @param assigned 이 규칙에 배정된 person_id 집합(없으면 빈 집합). 비어 있으면 인력 축은
     *                 따지지 않는다 — 기존 규칙(조직 축만 쓰는 규칙)의 동작이 바뀌지 않는다.
     */
    private boolean ruleMatches(Map<String, Object> rule, Map<String, Object> person, Set<Long> assigned) {
        if (assigned != null && !assigned.isEmpty()) {
            Object pid = person.get("person_id");
            if (pid == null || !assigned.contains(((Number) pid).longValue())) return false;
        }
        String deptCode = (String) rule.get("dept_code");
        if (deptCode != null) {
            // 0042 — 하위 전개는 OrgTreeService 하나로 위임(순환 방어 포함 + 동기화 사이 캐시).
            //   예전엔 여기 자체 BFS가 있었고 순환 방어가 없어 upper_dept_code 사이클에 무한 루프였다.
            //   또 이 메서드는 (규칙 × 인원)만큼 불리므로 캐시 없이는 그만큼 전체 부서 스캔이 돌았다.
            //   5단계: 부서명 비교 → **부서 코드 비교**. 동명 부서(재무팀 6개 등)가 있으면
            //   이름 비교는 무관한 부서 사람에게까지 권한을 열어줬다 — 권한 판정에서 특히 위험하다.
            //   dept_code가 없는 인력(외부·미상)은 부서 축 규칙에 걸리지 않는다(fail-closed).
            Set<String> codes = orgTree.subtreeCodes(deptCode, toBool(rule.get("include_sub")));
            String personDeptCode = (String) person.get("dept_code");
            if (personDeptCode == null || !codes.contains(personDeptCode)) return false;
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

    /** 이 person에게 매칭되는 활성 규칙 전부(원본 shape) — 메뉴 판정과 2단계 capability 판정 공용. */
    public List<Map<String, Object>> matchedRulesFor(Long personId) {
        if (personId == null) return List.of();
        List<Map<String, Object>> people = jdbc.queryForList(
                "SELECT person_id, department, dept_code, position, employment_type FROM pms_person WHERE person_id = ?", personId);
        if (people.isEmpty()) return List.of();
        Map<String, Object> person = people.get(0);

        List<Map<String, Object>> out = new ArrayList<>();
        Map<Long, Set<Long>> assignedByRule = personIdsByRule();
        List<Map<String, Object>> rules = jdbc.queryForList("SELECT * FROM pms_access_rule WHERE enabled = 1");
        for (Map<String, Object> rule : rules) {
            try {
                Set<Long> assigned = assignedByRule.get(((Number) rule.get("rule_id")).longValue());
                if (ruleMatches(rule, person, assigned)) out.add(rule);
            } catch (RuntimeException e) {
                log.warn("접근 규칙 판정 실패(rule_id={}) — 이 규칙 건너뜀: {}", rule.get("rule_id"), e.getMessage());
            }
        }
        return out;
    }

    /** 로그인 사용자의 유효 메뉴 키 집합. person 미연결/매칭 규칙 없음 = 기본값(대시보드만, 0034 §5 결정3). */
    public Set<String> resolveMenus(Long personId) {
        List<Map<String, Object>> rules = matchedRulesFor(personId);
        Set<String> menus = new HashSet<>();
        for (Map<String, Object> rule : rules) {
            Object arr = Json.readArray(String.valueOf(rule.get("menu_keys")));
            if (arr instanceof List<?> list) for (Object k : list) menus.add(String.valueOf(k));
        }
        return menus.isEmpty() ? Set.of(MenuKeys.DASHBOARD) : menus;
    }

    /** §4 판정 시뮬레이터 — 사용자 하나의 매칭 규칙·유효 메뉴를 미리보기. */
    public Map<String, Object> simulate(long personId) {
        List<Map<String, Object>> people = jdbc.queryForList(
                "SELECT person_id, name, department, dept_code, position, employment_type FROM pms_person WHERE person_id = ?", personId);
        if (people.isEmpty()) throw ApiException.notFound("인력을 찾을 수 없습니다: " + personId);
        Map<String, Object> person = people.get(0);

        List<Map<String, Object>> matched = new ArrayList<>();
        Map<Long, Set<Long>> assignedByRule = personIdsByRule();
        Map<Long, List<Map<String, Object>>> personsByRule = personsByRule(null);
        List<Map<String, Object>> rules = jdbc.queryForList("SELECT * FROM pms_access_rule WHERE enabled = 1 ORDER BY priority");
        for (Map<String, Object> rule : rules) {
            Set<Long> assigned = assignedByRule.get(((Number) rule.get("rule_id")).longValue());
            if (ruleMatches(rule, person, assigned)) matched.add(shape(rule, personsByRule));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        // Map.of는 null 값을 허용하지 않음(부서·직책 미기재 인력이 흔함) — LinkedHashMap으로 구성.
        Map<String, Object> personOut = new LinkedHashMap<>();
        personOut.put("personId", person.get("person_id"));
        personOut.put("name", person.get("name"));
        personOut.put("department", person.get("department"));
        personOut.put("position", person.get("position"));
        personOut.put("positionCode", PositionCode.of((String) person.get("position")));
        personOut.put("employmentType", person.get("employment_type"));
        out.put("person", personOut);
        out.put("matchedRules", matched);
        out.put("effectiveMenus", resolveMenus(personId));
        return out;
    }
}
