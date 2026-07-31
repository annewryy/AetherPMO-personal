package com.aetherpms.org;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * 0042 — 부서 트리 단일 진입점.
 *
 * 부서 계층(pms_org_dept)에 대한 **모든** 질문이 여기를 통한다. 예전엔 같은 하위 전개 로직이
 * PersonService.subtreeDeptNames()와 AccessRuleService.expandDeptNames()에 복붙돼 있었고,
 * 한쪽만 순환 참조를 방어해서 동작이 갈라져 있었다(원천 view에 upper_dept_code 사이클이 섞이면
 * 접근규칙 판정이 무한 루프). 방어·dedup 규칙을 이 클래스 하나로 모은다.
 *
 * 캐시: 부서 마스터는 동기화 배치(OrgSyncService.sync()) 사이에 변하지 않는다. 스냅샷을 들고
 * 있다가 sync()가 invalidate()를 호출할 때만 버린다. AccessRuleService는 (규칙 N × 인원 M)번
 * 하위 전개를 부르므로 이 캐시가 없으면 그만큼 전체 부서 스캔이 반복된다.
 */
@Service
public class OrgTreeService {

    /** 부서 1건(트리 조립 재료). 원천 컬럼 그대로. */
    public record Dept(String deptCode, String upperDeptCode, String deptNm) {}

    /** 불변 스냅샷 — 한 번 만들면 고쳐 쓰지 않는다(교체만). */
    private static final class Index {
        final List<Dept> all;
        final Map<String, String> nameByCode;
        final Map<String, List<String>> childrenOf;

        Index(List<Dept> all) {
            this.all = List.copyOf(all);
            Map<String, String> names = new LinkedHashMap<>();
            Map<String, List<String>> kids = new LinkedHashMap<>();
            for (Dept d : all) {
                names.put(d.deptCode(), d.deptNm());
                if (d.upperDeptCode() != null) {
                    kids.computeIfAbsent(d.upperDeptCode(), k -> new ArrayList<>()).add(d.deptCode());
                }
            }
            this.nameByCode = Collections.unmodifiableMap(names);
            this.childrenOf = Collections.unmodifiableMap(kids);
        }
    }

    private final JdbcTemplate jdbc;
    private volatile Index cache;

    public OrgTreeService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 동기화 직후 호출 — 다음 조회에서 스냅샷을 다시 만든다. */
    public void invalidate() {
        cache = null;
    }

    /** 부서 전량(코드·상위코드·이름). 트리 조립이 필요한 호출부용. */
    public List<Dept> all() {
        return index().all;
    }

    /** 코드 → 표시명. 없는 코드면 null. */
    public String nameOf(String deptCode) {
        return deptCode == null ? null : index().nameByCode.get(deptCode.trim());
    }

    /**
     * 코드 → 자신 + (includeSub면) 모든 하위 부서 **코드**. 등록 순서(자신 먼저) 보존.
     * 존재하지 않는 코드면 빈 집합 — 호출부는 이걸 "공집합"으로 다뤄야 한다(전체 조회로 새면 안 됨).
     */
    public Set<String> subtreeCodes(String deptCode, boolean includeSub) {
        Index idx = index();
        String root = deptCode == null ? null : deptCode.trim();
        if (root == null || !idx.nameByCode.containsKey(root)) return Set.of();

        Set<String> out = new LinkedHashSet<>();
        out.add(root);
        if (!includeSub) return out;

        // BFS + 방문 집합 — 순환 참조(A→B→A) 방어는 여기 한 곳뿐이다.
        Deque<String> queue = new ArrayDeque<>(idx.childrenOf.getOrDefault(root, List.of()));
        while (!queue.isEmpty()) {
            String code = queue.poll();
            if (!out.add(code)) continue;              // 이미 본 코드 → 순환
            queue.addAll(idx.childrenOf.getOrDefault(code, List.of()));
        }
        return out;
    }

    /**
     * 코드 → 자신 + 하위 부서의 **이름** 집합(빈 이름 제외, 중복 제거).
     *
     * pms_person.department가 코드가 아니라 부서명이라 필터가 이름으로 걸린다(0042 §2-1(A)).
     * 서로 다른 부서가 같은 이름을 쓰면 여기서 한 항목으로 합쳐지고 양쪽 인원이 함께 걸린다 —
     * 이름 기반 필터의 구조적 한계이며, pms_person.dept_code 도입(0042 5단계)까지의 한시적 경로다.
     */
    public Set<String> subtreeNames(String deptCode, boolean includeSub) {
        Index idx = index();
        Set<String> names = new LinkedHashSet<>();
        for (String code : subtreeCodes(deptCode, includeSub)) {
            String nm = idx.nameByCode.get(code);
            if (nm != null && !nm.isBlank()) names.add(nm);
        }
        return names;
    }

    // ---- 스냅샷 로드 ----------------------------------------------------------

    private Index index() {
        Index local = cache;
        if (local != null) return local;
        synchronized (this) {
            if (cache == null) cache = load();
            return cache;
        }
    }

    private Index load() {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT dept_code, upper_dept_code, dept_nm FROM pms_org_dept");
        List<Dept> depts = new ArrayList<>(rows.size());
        for (Map<String, Object> r : rows) {
            String code = trimOrNull(r.get("dept_code"));
            if (code == null) continue;
            depts.add(new Dept(code, trimOrNull(r.get("upper_dept_code")), trimOrNull(r.get("dept_nm"))));
        }
        return new Index(depts);
    }

    private static String trimOrNull(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }
}
