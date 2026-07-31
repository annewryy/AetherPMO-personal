package com.aetherpms.catalog;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.aetherpms.common.Actor;
import com.aetherpms.common.ApiException;
import com.aetherpms.common.AuditWriter;
import com.aetherpms.code.CommonCodeService;

/**
 * 0044 §E — 기존 테일러링(카탈로그 트리)을 **선택 복사**해 새 고객사 분류를 만든다.
 * 마법사의 테일러링 선택 UI(체크박스 트리)에서 고른 노드들을 받아,
 * 조상까지 닫힘 집합(closure)으로 확장한 뒤 부모→자식 순서로 깊은 복사한다.
 *  - client_category = 대상 분류(공통코드 CLIENT_CATEGORY — 없으면 자동 등록: 복사 모달 원스텝 UX)
 *  - code·필드는 원본 그대로(코드 유일성은 분류 단위 — CatalogAdminService.assertCodeUnique).
 *  - 대상 분류에 이미 같은 code가 있으면 409(재복사로 인한 중복 방지).
 */
@Service
public class CatalogCopyService {

    private final JdbcTemplate jdbc;
    private final AuditWriter audit;
    private final CommonCodeService codes;

    public CatalogCopyService(JdbcTemplate jdbc, AuditWriter audit, CommonCodeService codes) {
        this.jdbc = jdbc;
        this.audit = audit;
        this.codes = codes;
    }

    /** 복사되는 컬럼(node_id·parent 제외 전체 — 새 분류에서 그대로 쓰는 값들). */
    private static final List<String> COPY_COLS = List.of(
            "node_type", "code", "name", "description", "is_optional", "sort_order", "seq_no",
            "deliverable_category", "stage", "template_file_ref", "template_tags", "workflow_id",
            "is_active", "methodology", "required_small", "required_medium", "required_large",
            "doc_format", "file_name_base", "doc_template_id");

    @Transactional
    public Map<String, Object> copy(Map<String, Object> body, Actor actor) {
        Map<String, Object> b = body == null ? Map.of() : body;

        String target = b.get("targetClientCategory") == null ? null
                : b.get("targetClientCategory").toString().trim();
        if (target == null || target.isEmpty() || target.length() > 50) {
            throw ApiException.badRequest("targetClientCategory(새 분류명)는 비어있지 않은 50자 이하 문자열이어야 합니다.");
        }

        if (!(b.get("nodeIds") instanceof List<?> rawIds) || rawIds.isEmpty()) {
            throw ApiException.badRequest("nodeIds(복사할 노드 목록)는 비어있지 않은 배열이어야 합니다.");
        }
        Set<Long> selected = new LinkedHashSet<>();
        for (Object v : rawIds) {
            if (!(v instanceof Number n) || n.longValue() <= 0) {
                throw ApiException.badRequest("nodeIds에는 양의 정수 node_id만 올 수 있습니다.");
            }
            selected.add(n.longValue());
        }

        // 전체 노드 로드(부모 매핑·닫힘 집합 계산용)
        List<Map<String, Object>> all = jdbc.queryForList(
                "SELECT * FROM pms_catalog_node ORDER BY sort_order, node_id");
        Map<Long, Map<String, Object>> byId = new LinkedHashMap<>();
        for (Map<String, Object> r : all) byId.put(((Number) r.get("node_id")).longValue(), r);

        // 조상 포함 닫힘 집합 — 프론트가 조상을 빼먹어도 트리가 끊기지 않게 서버가 보강한다.
        Set<Long> closure = new LinkedHashSet<>();
        for (Long id : selected) {
            Long cur = id;
            List<Long> chain = new ArrayList<>();
            while (cur != null) {
                Map<String, Object> node = byId.get(cur);
                if (node == null) throw ApiException.badRequest("존재하지 않는 node_id: " + cur);
                chain.add(0, cur);
                Object p = node.get("parent_node_id");
                cur = p == null ? null : ((Number) p).longValue();
            }
            closure.addAll(chain);
        }

        // 대상 분류 코드 확보 — 없으면 CLIENT_CATEGORY에 자동 등록(복사 모달 원스텝).
        if (!codes.knownCodes("CLIENT_CATEGORY").contains(target)) {
            codes.create("CLIENT_CATEGORY", Map.of("code", target), actor);
        }

        // 대상 분류 내 code 중복 사전 검사(있으면 재복사 — 통째로 409).
        List<String> srcCodes = closure.stream()
                .map(id -> byId.get(id).get("code"))
                .filter(c -> c != null)
                .map(Object::toString)
                .toList();
        if (!srcCodes.isEmpty()) {
            String in = String.join(", ", srcCodes.stream().map(c -> "?").toList());
            List<Object> args = new ArrayList<>(srcCodes);
            args.add(0, target);
            Integer dup = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM pms_catalog_node WHERE client_category = ? AND code IN (" + in + ")",
                    Integer.class, args.toArray());
            if (dup != null && dup > 0) {
                throw ApiException.conflict("대상 분류 '" + target + "'에 이미 같은 code의 노드가 " + dup
                        + "건 있습니다 — 이미 복사된 분류인지 확인하세요.");
            }
        }

        // 부모 → 자식 순서(원본 로드가 정렬돼 있고 closure가 조상 우선으로 쌓였지만, 확실히 topo 정렬)
        List<Long> ordered = new ArrayList<>();
        Set<Long> placed = new LinkedHashSet<>();
        while (placed.size() < closure.size()) {
            boolean progressed = false;
            for (Long id : closure) {
                if (placed.contains(id)) continue;
                Object p = byId.get(id).get("parent_node_id");
                Long parent = p == null ? null : ((Number) p).longValue();
                if (parent == null || placed.contains(parent) || !closure.contains(parent)) {
                    ordered.add(id);
                    placed.add(id);
                    progressed = true;
                }
            }
            if (!progressed) throw ApiException.badRequest("카탈로그 트리에 순환 참조가 있습니다.");
        }

        // 깊은 복사 — old id → new id 매핑을 유지하며 INSERT.
        Map<Long, Long> idMap = new LinkedHashMap<>();
        String colList = String.join(", ", COPY_COLS);
        String placeholders = String.join(", ", COPY_COLS.stream().map(c -> "?").toList());
        for (Long oldId : ordered) {
            Map<String, Object> src = byId.get(oldId);
            Object p = src.get("parent_node_id");
            Long newParent = p == null ? null : idMap.get(((Number) p).longValue());
            Object[] vals = new Object[COPY_COLS.size() + 2];
            vals[0] = newParent;
            vals[1] = target;
            for (int i = 0; i < COPY_COLS.size(); i++) vals[i + 2] = src.get(COPY_COLS.get(i));
            jdbc.update("INSERT INTO pms_catalog_node (parent_node_id, client_category, " + colList
                    + ") VALUES (?, ?, " + placeholders + ")", vals);
            Long newId = jdbc.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
            idMap.put(oldId, newId);
        }

        audit.write("CATALOG_NODE", 0, null, "INSERT", null, null,
                Map.of("targetClientCategory", target, "copied", idMap.size()),
                actor, "테일러링 선택 복사 → 분류 '" + target + "' (" + idMap.size() + "개 노드)");

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("clientCategory", target);
        out.put("copiedCount", idMap.size());
        return out;
    }
}
