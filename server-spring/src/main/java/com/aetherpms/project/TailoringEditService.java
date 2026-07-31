package com.aetherpms.project;

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
import com.aetherpms.common.WriteSupport;

/**
 * 0044 §C — 테일러링 전개 "후" 편집(추가/삭제).
 * 기존에는 프로젝트 생성/전환 시 1회 전개만 가능했고 이후 테일러링 집합을 바꿀 방법이 없었다.
 *
 * 계약:
 *  - GET  /api/projects/{id}/tailoring          → 현재 선택 노드 집합(+생성 매핑)
 *  - POST /api/projects/{id}/tailoring {add, remove}
 *    · add    — 미선택 노드 증분 전개(TASK→pms_task, DELIVERABLE→부모 태스크의 pms_deliverable,
 *               PHASE/ACTIVITY는 tailoring 기록만). 부모 태스크는 기존 전개분을 재사용한다.
 *    · remove — 철회. **미착수만 허용**(작업 이력 보호 — 0044 수용 기준):
 *               산출물=DRAFT·파일 없음·관련항목 링크 없음,
 *               태스크=TODO·진척 0·하위 산출물이 전부 이번 remove에 포함,
 *               단계/활동=선택된 하위가 전부 이번 remove에 포함. 위반 시 409(사유 명시).
 *               생성물은 삭제하고 tailoring 행은 is_selected=0으로 남긴다(이력).
 */
@Service
public class TailoringEditService {

    private final JdbcTemplate jdbc;
    private final AuditWriter audit;

    public TailoringEditService(JdbcTemplate jdbc, AuditWriter audit) {
        this.jdbc = jdbc;
        this.audit = audit;
    }

    // =====================================================================
    // 조회 — 현재 전개 상태
    // =====================================================================

    @Transactional(readOnly = true)
    public Map<String, Object> state(long projectId) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT t.catalog_node_id, t.is_selected, t.generated_task_id, t.generated_deliverable_id
                  FROM pms_project_tailoring t
                 WHERE t.project_id = ? AND t.catalog_node_id IS NOT NULL
                 ORDER BY t.tailoring_id""", projectId);
        // 같은 노드에 행이 여러 개면(재전개 이력) 마지막 행이 현재 상태.
        Map<Long, Map<String, Object>> latest = new LinkedHashMap<>();
        for (Map<String, Object> r : rows) {
            latest.put(((Number) r.get("catalog_node_id")).longValue(), r);
        }
        List<Long> selected = latest.entrySet().stream()
                .filter(e -> truthy(e.getValue().get("is_selected")))
                .map(Map.Entry::getKey).toList();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("projectId", projectId);
        out.put("selectedNodeIds", selected);
        return out;
    }

    // =====================================================================
    // 편집 — add / remove
    // =====================================================================

    @Transactional
    public Map<String, Object> edit(long projectId, Map<String, Object> body, Actor actor) {
        Map<String, Object> b = body == null ? Map.of() : body;
        Set<Long> add = idSet(b.get("add"));
        Set<Long> remove = idSet(b.get("remove"));
        if (add.isEmpty() && remove.isEmpty()) {
            throw ApiException.badRequest("add 또는 remove에 노드를 지정하세요.");
        }
        Set<Long> both = new LinkedHashSet<>(add);
        both.retainAll(remove);
        if (!both.isEmpty()) throw ApiException.badRequest("같은 노드를 add와 remove에 동시에 지정할 수 없습니다.");

        // 현재 상태
        Map<Long, TailoringRow> current = loadCurrent(projectId);
        Set<Long> selectedNow = new LinkedHashSet<>();
        current.forEach((nodeId, row) -> { if (row.selected()) selectedNow.add(nodeId); });

        int addedTasks = 0, addedDeliverables = 0, removedTasks = 0, removedDeliverables = 0;

        // ---- remove 먼저(같은 요청에서 부모 교체 시 순서 문제 방지) ----------
        if (!remove.isEmpty()) {
            Map<Long, Map<String, Object>> nodes = fetchNodes(remove);
            // 하위 유형부터: DELIVERABLE → TASK → ACTIVITY → PHASE
            List<Long> ordered = remove.stream().sorted((a2, b2) -> Integer.compare(
                    typeRank(str(nodes.get(b2).get("node_type"))), typeRank(str(nodes.get(a2).get("node_type"))))).toList();
            for (Long nodeId : ordered) {
                TailoringRow row = current.get(nodeId);
                if (row == null || !row.selected()) continue;   // 이미 미선택 — 멱등
                Map<String, Object> node = nodes.get(nodeId);
                if (node == null) throw ApiException.badRequest("존재하지 않는 catalogNodeId: " + nodeId);
                String type = str(node.get("node_type"));
                switch (type) {
                    case "DELIVERABLE" -> { removeDeliverable(projectId, nodeId, row); removedDeliverables++; }
                    case "TASK" -> { removeTask(projectId, nodeId, row, remove); removedTasks++; }
                    default -> assertNoSelectedChildrenOutside(projectId, nodeId, remove);
                }
                jdbc.update("""
                        UPDATE pms_project_tailoring
                           SET is_selected = 0, generated_task_id = NULL, generated_deliverable_id = NULL
                         WHERE project_id = ? AND catalog_node_id = ?""", projectId, nodeId);
                selectedNow.remove(nodeId);
            }
        }

        // ---- add ------------------------------------------------------------
        List<Long> toAdd = add.stream().filter(id -> !selectedNow.contains(id)).toList();
        if (!toAdd.isEmpty()) {
            Map<Long, Map<String, Object>> nodes = fetchNodes(new LinkedHashSet<>(toAdd));
            for (Long id : toAdd) {
                if (!nodes.containsKey(id)) throw ApiException.badRequest("존재하지 않는 catalogNodeId: " + id);
            }
            // 부모 우선(TASK가 만들어져야 DELIVERABLE이 붙는다): PHASE → ACTIVITY → TASK → DELIVERABLE
            List<Long> ordered = toAdd.stream().sorted((a2, b2) -> Integer.compare(
                    typeRank(str(nodes.get(a2).get("node_type"))), typeRank(str(nodes.get(b2).get("node_type"))))).toList();
            for (Long nodeId : ordered) {
                Map<String, Object> node = nodes.get(nodeId);
                String type = str(node.get("node_type"));
                long tailoringId = upsertTailoringSelected(projectId, nodeId, current.get(nodeId));
                if ("TASK".equals(type)) {
                    long taskId = createTask(projectId, nodeId, node);
                    jdbc.update("UPDATE pms_project_tailoring SET generated_task_id = ? WHERE tailoring_id = ?",
                            taskId, tailoringId);
                    addedTasks++;
                } else if ("DELIVERABLE".equals(type)) {
                    Long parentNodeId = node.get("parent_node_id") == null ? null
                            : ((Number) node.get("parent_node_id")).longValue();
                    Long parentTaskId = parentNodeId == null ? null : findProjectTask(projectId, parentNodeId);
                    long deliverableId = createDeliverable(projectId, parentTaskId, nodeId, node);
                    jdbc.update("UPDATE pms_project_tailoring SET generated_deliverable_id = ? WHERE tailoring_id = ?",
                            deliverableId, tailoringId);
                    addedDeliverables++;
                }
                selectedNow.add(nodeId);
            }
        }

        audit.write("PROJECT", projectId, projectId, "UPDATE", List.of("tailoring"),
                null, Map.of("addedTasks", addedTasks, "addedDeliverables", addedDeliverables,
                        "removedTasks", removedTasks, "removedDeliverables", removedDeliverables),
                actor, "테일러링 편집 — 태스크 +" + addedTasks + "/-" + removedTasks
                        + " · 산출물 +" + addedDeliverables + "/-" + removedDeliverables);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("projectId", projectId);
        out.put("addedTasks", addedTasks);
        out.put("addedDeliverables", addedDeliverables);
        out.put("removedTasks", removedTasks);
        out.put("removedDeliverables", removedDeliverables);
        out.put("selectedNodeIds", List.copyOf(selectedNow));
        return out;
    }

    // =====================================================================
    // remove 가드/실행
    // =====================================================================

    private void removeDeliverable(long projectId, long nodeId, TailoringRow row) {
        Long id = row.deliverableId() != null ? row.deliverableId()
                : queryLong("SELECT deliverable_id FROM pms_deliverable WHERE project_id = ? AND catalog_node_id = ? "
                        + "ORDER BY deliverable_id DESC LIMIT 1", projectId, nodeId);
        if (id == null) return;   // 생성물 없음 — 기록만 철회
        Map<String, Object> d = jdbc.queryForList(
                "SELECT status, file_name, deliverable_name FROM pms_deliverable WHERE deliverable_id = ?", id)
                .stream().findFirst().orElse(null);
        if (d == null) return;
        String name = str(d.get("deliverable_name"));
        if (!"DRAFT".equals(str(d.get("status")))) {
            throw ApiException.conflict("산출물 '" + name + "'은 작성중(DRAFT) 상태가 아니라 삭제할 수 없습니다 — 상태를 되돌린 뒤 다시 시도하세요.");
        }
        if (d.get("file_name") != null) {
            throw ApiException.conflict("산출물 '" + name + "'에 업로드된 파일이 있어 삭제할 수 없습니다.");
        }
        Long links = queryLong("SELECT COUNT(*) FROM pms_entity_link WHERE "
                + "(src_type = 'DELIVERABLE' AND src_id = ?) OR (dst_type = 'DELIVERABLE' AND dst_id = ?)", id, id);
        if (links != null && links > 0) {
            throw ApiException.conflict("산출물 '" + name + "'을 참조하는 관련항목이 " + links + "건 있어 삭제할 수 없습니다.");
        }
        jdbc.update("UPDATE pms_task SET deliverable_id = NULL WHERE project_id = ? AND deliverable_id = ?", projectId, id);
        jdbc.update("DELETE FROM pms_deliverable WHERE deliverable_id = ?", id);
    }

    private void removeTask(long projectId, long nodeId, TailoringRow row, Set<Long> removeSet) {
        Long id = row.taskId() != null ? row.taskId() : findProjectTask(projectId, nodeId);
        if (id == null) return;
        Map<String, Object> t = jdbc.queryForList(
                "SELECT status, progress_rate, task_name FROM pms_task WHERE task_id = ?", id)
                .stream().findFirst().orElse(null);
        if (t == null) return;
        String name = str(t.get("task_name"));
        if (!"TODO".equals(str(t.get("status")))) {
            throw ApiException.conflict("태스크 '" + name + "'은 대기(TODO) 상태가 아니라 삭제할 수 없습니다.");
        }
        int progress = t.get("progress_rate") == null ? 0 : ((Number) t.get("progress_rate")).intValue();
        if (progress > 0) {
            throw ApiException.conflict("태스크 '" + name + "'에 진척률(" + progress + "%)이 입력돼 있어 삭제할 수 없습니다.");
        }
        // 남는 산출물이 있으면 삭제 불가(산출물 노드도 함께 remove돼야 함 — 위에서 먼저 처리됨).
        Long remaining = queryLong("SELECT COUNT(*) FROM pms_deliverable WHERE task_id = ?", id);
        if (remaining != null && remaining > 0) {
            throw ApiException.conflict("태스크 '" + name + "' 하위에 산출물 " + remaining
                    + "건이 남아 있어 삭제할 수 없습니다 — 산출물을 함께 선택 해제하세요.");
        }
        Long links = queryLong("SELECT COUNT(*) FROM pms_entity_link WHERE "
                + "(src_type = 'TASK' AND src_id = ?) OR (dst_type = 'TASK' AND dst_id = ?)", id, id);
        if (links != null && links > 0) {
            throw ApiException.conflict("태스크 '" + name + "'을 참조하는 관련항목이 " + links + "건 있어 삭제할 수 없습니다.");
        }
        jdbc.update("DELETE FROM pms_task WHERE task_id = ?", id);
    }

    /** 단계/활동 철회 가드 — 선택된 하위 노드가 remove 집합 밖에 남아 있으면 409. */
    private void assertNoSelectedChildrenOutside(long projectId, long nodeId, Set<Long> removeSet) {
        List<Long> descendants = jdbc.queryForList("""
                WITH RECURSIVE sub AS (
                    SELECT node_id FROM pms_catalog_node WHERE parent_node_id = ?
                    UNION ALL
                    SELECT c.node_id FROM pms_catalog_node c JOIN sub s ON c.parent_node_id = s.node_id
                )
                SELECT node_id FROM sub""", Long.class, nodeId);
        if (descendants.isEmpty()) return;
        String ph = String.join(", ", descendants.stream().map(d -> "?").toList());
        List<Object> args = new ArrayList<>();
        args.add(projectId);
        args.addAll(descendants);
        List<Long> selectedChildren = jdbc.queryForList("""
                SELECT t.catalog_node_id FROM pms_project_tailoring t
                 WHERE t.project_id = ? AND t.is_selected = 1 AND t.catalog_node_id IN (%s)"""
                .formatted(ph), Long.class, args.toArray());
        List<Long> outside = selectedChildren.stream().filter(c -> !removeSet.contains(c)).toList();
        if (!outside.isEmpty()) {
            throw ApiException.conflict("하위에 선택된 항목 " + outside.size()
                    + "건이 남아 있어 상위를 선택 해제할 수 없습니다 — 하위를 함께 해제하세요.");
        }
    }

    // =====================================================================
    // add 실행
    // =====================================================================

    private long upsertTailoringSelected(long projectId, long nodeId, TailoringRow existing) {
        if (existing != null) {
            jdbc.update("""
                    UPDATE pms_project_tailoring SET is_selected = 1, exclude_reason = NULL
                     WHERE project_id = ? AND catalog_node_id = ?""", projectId, nodeId);
            return existing.tailoringId();
        }
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("project_id", projectId);
        row.put("catalog_node_id", nodeId);
        row.put("is_selected", 1);
        Map<String, Object> created =
                WriteSupport.insertReturning(jdbc, "pms_project_tailoring", "tailoring_id", row);
        return ((Number) created.get("tailoring_id")).longValue();
    }

    private long createTask(long projectId, long nodeId, Map<String, Object> node) {
        Map<String, Object> task = new LinkedHashMap<>();
        task.put("project_id", projectId);
        task.put("task_name", node.get("name"));
        task.put("status", "TODO");
        task.put("sort_order", node.get("sort_order") == null ? 0 : node.get("sort_order"));
        task.put("catalog_node_id", nodeId);
        Map<String, Object> created = WriteSupport.insertReturning(jdbc, "pms_task", "task_id", task);
        return ((Number) created.get("task_id")).longValue();
    }

    private long createDeliverable(long projectId, Long parentTaskId, long nodeId, Map<String, Object> node) {
        Map<String, Object> deliverable = new LinkedHashMap<>();
        deliverable.put("project_id", projectId);
        deliverable.put("task_id", parentTaskId);
        deliverable.put("deliverable_name", node.get("name"));
        deliverable.put("deliverable_type", node.get("deliverable_category"));
        deliverable.put("status", "DRAFT");
        deliverable.put("catalog_node_id", nodeId);
        Map<String, Object> created =
                WriteSupport.insertReturning(jdbc, "pms_deliverable", "deliverable_id", deliverable);
        return ((Number) created.get("deliverable_id")).longValue();
    }

    /** 프로젝트 내 카탈로그 노드의 전개 태스크(tailoring 매핑 → catalog_node_id 폴백). */
    private Long findProjectTask(long projectId, long catalogNodeId) {
        Long viaTailoring = queryLong("""
                SELECT generated_task_id FROM pms_project_tailoring
                 WHERE project_id = ? AND catalog_node_id = ? AND generated_task_id IS NOT NULL
                 ORDER BY tailoring_id DESC LIMIT 1""", projectId, catalogNodeId);
        if (viaTailoring != null) return viaTailoring;
        return queryLong("SELECT task_id FROM pms_task WHERE project_id = ? AND catalog_node_id = ? "
                + "ORDER BY task_id DESC LIMIT 1", projectId, catalogNodeId);
    }

    // =====================================================================
    // 내부 유틸
    // =====================================================================

    private record TailoringRow(long tailoringId, boolean selected, Long taskId, Long deliverableId) {}

    private Map<Long, TailoringRow> loadCurrent(long projectId) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT tailoring_id, catalog_node_id, is_selected, generated_task_id, generated_deliverable_id
                  FROM pms_project_tailoring
                 WHERE project_id = ? AND catalog_node_id IS NOT NULL
                 ORDER BY tailoring_id""", projectId);
        Map<Long, TailoringRow> out = new LinkedHashMap<>();
        for (Map<String, Object> r : rows) {
            out.put(((Number) r.get("catalog_node_id")).longValue(), new TailoringRow(
                    ((Number) r.get("tailoring_id")).longValue(),
                    truthy(r.get("is_selected")),
                    r.get("generated_task_id") == null ? null : ((Number) r.get("generated_task_id")).longValue(),
                    r.get("generated_deliverable_id") == null ? null : ((Number) r.get("generated_deliverable_id")).longValue()));
        }
        return out;
    }

    private Map<Long, Map<String, Object>> fetchNodes(Set<Long> ids) {
        if (ids.isEmpty()) return Map.of();
        String ph = String.join(", ", ids.stream().map(i -> "?").toList());
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT node_id, parent_node_id, node_type, name, sort_order, deliverable_category "
                        + "FROM pms_catalog_node WHERE node_id IN (" + ph + ")", ids.toArray());
        Map<Long, Map<String, Object>> byId = new LinkedHashMap<>();
        for (Map<String, Object> r : rows) byId.put(((Number) r.get("node_id")).longValue(), r);
        return byId;
    }

    private static int typeRank(String type) {
        return switch (type == null ? "" : type) {
            case "PHASE" -> 0;
            case "ACTIVITY" -> 1;
            case "TASK" -> 2;
            case "DELIVERABLE" -> 3;
            default -> 4;
        };
    }

    private static Set<Long> idSet(Object raw) {
        if (raw == null) return new LinkedHashSet<>();
        if (!(raw instanceof List<?> list)) throw ApiException.badRequest("add/remove는 node id 배열이어야 합니다.");
        Set<Long> out = new LinkedHashSet<>();
        for (Object v : list) {
            if (!(v instanceof Number n) || n.longValue() <= 0) {
                throw ApiException.badRequest("add/remove에는 양의 정수 node id만 올 수 있습니다.");
            }
            out.add(n.longValue());
        }
        return out;
    }

    private Long queryLong(String sql, Object... args) {
        List<Map<String, Object>> rows = jdbc.queryForList(sql, args);
        if (rows.isEmpty()) return null;
        Object v = rows.get(0).values().iterator().next();
        return v == null ? null : ((Number) v).longValue();
    }

    private static boolean truthy(Object v) {
        return v instanceof Number n ? n.intValue() != 0 : Boolean.TRUE.equals(v);
    }

    private static String str(Object o) { return o == null ? null : o.toString(); }
}
