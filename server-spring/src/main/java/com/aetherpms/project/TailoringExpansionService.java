package com.aetherpms.project;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import com.aetherpms.common.ApiException;
import com.aetherpms.common.WriteSupport;

/**
 * 카탈로그 테일러링 전개 (배치11 / P3a) — Node server/src/routes/projects.ts §1 expandTailoring 이식.
 *
 * 0003 §1 트랜잭션 2~3단계:
 *   1) 요청된 catalog_node 를 pms_project_tailoring 에 기록(is_selected·exclude_reason 포함).
 *   2) 선택된 TASK 노드        → pms_task 생성(status='TODO') + generated_task_id 연결.
 *   3) 선택된 DELIVERABLE 노드  → 부모 TASK에 연결된 pms_deliverable 생성(status='DRAFT')
 *                                + generated_deliverable_id 연결.
 * 빈 배열도 유효(태스크/산출물 0개). 반드시 호출자의 @Transactional 안에서 실행.
 *
 * 입력 계약(camelCase, 프론트 web/src/types.ts 기준):
 *   [{ catalogNodeId, isSelected?(기본 true), excludeReason?, plannedStartDate?, plannedEndDate? }]
 *
 * Node 대비 판단:
 *   - Node expandTailoring 의 INSERT는 planned_start/end_date 를 사용하지 않는다(TailoringEntry에
 *     해당 필드 없음). 여기서도 동일하게 무시한다 — 계획일정은 별도 경로에서 관리(시드는 직접 채움).
 */
@Service
public class TailoringExpansionService {

    private final JdbcTemplate jdbc;

    public TailoringExpansionService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 전개 결과 카운트(응답용). */
    public record ExpansionResult(int createdTasks, int createdDeliverables) {}

    /**
     * @param rawTailoring 요청 body의 tailoring 값(배열이어야 함, null 허용 → 전개 없음).
     */
    public ExpansionResult expand(long projectId, Object rawTailoring) {
        if (rawTailoring == null) {
            return new ExpansionResult(0, 0);
        }
        if (!(rawTailoring instanceof List<?> list)) {
            throw ApiException.badRequest("tailoring은 배열이어야 합니다.");
        }
        if (list.isEmpty()) {
            return new ExpansionResult(0, 0);
        }

        // ---- 정규화 + 검증 (Node: catalog_node_id 정수 필수) ----------------
        List<Entry> entries = new ArrayList<>(list.size());
        for (Object o : list) {
            if (!(o instanceof Map<?, ?> m)) {
                throw ApiException.badRequest("tailoring 항목에 catalogNodeId가 필요합니다.");
            }
            Long nodeId = asPositiveLong(m.get("catalogNodeId"));
            if (nodeId == null) {
                throw ApiException.badRequest("tailoring 항목에 catalogNodeId가 필요합니다.");
            }
            // isSelected 기본 true — Node: is_selected !== false.
            Object sel = m.get("isSelected");
            boolean isSelected = !(Boolean.FALSE.equals(sel) || "false".equalsIgnoreCase(String.valueOf(sel)));
            Object reason = m.get("excludeReason");
            String excludeReason = reason == null || reason.toString().trim().isEmpty()
                    ? null : reason.toString();
            entries.add(new Entry(nodeId, isSelected, excludeReason));
        }

        // ---- 노드 조회(존재 검증) — Node: node_id = any(...) -----------------
        List<Long> nodeIds = entries.stream().map(Entry::catalogNodeId).distinct().toList();
        Map<Long, Map<String, Object>> nodeById = fetchNodes(nodeIds);
        List<Long> missing = nodeIds.stream().filter(id -> !nodeById.containsKey(id)).toList();
        if (!missing.isEmpty()) {
            throw ApiException.badRequest("존재하지 않는 catalogNodeId: "
                    + String.join(", ", missing.stream().map(String::valueOf).toList()));
        }

        // ---- 1) 테일러링 기록(선택/제외 모두) -------------------------------
        Map<Long, Long> tailoringIdByNode = new LinkedHashMap<>();
        for (Entry e : entries) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("project_id", projectId);
            row.put("catalog_node_id", e.catalogNodeId());
            row.put("is_selected", e.isSelected() ? 1 : 0);
            row.put("exclude_reason", e.excludeReason());
            Map<String, Object> created =
                    WriteSupport.insertReturning(jdbc, "pms_project_tailoring", "tailoring_id", row);
            tailoringIdByNode.put(e.catalogNodeId(), ((Number) created.get("tailoring_id")).longValue());
        }

        List<Entry> selected = entries.stream().filter(Entry::isSelected).toList();

        // ---- 2) TASK 노드 → pms_task -----------------------------------------
        Map<Long, Long> taskIdByNode = new LinkedHashMap<>();
        int createdTasks = 0;
        for (Entry e : selected) {
            Map<String, Object> node = nodeById.get(e.catalogNodeId());
            if (!"TASK".equals(node.get("node_type"))) continue;
            Map<String, Object> task = new LinkedHashMap<>();
            task.put("project_id", projectId);
            task.put("task_name", node.get("name"));
            task.put("status", "TODO");
            task.put("sort_order", node.get("sort_order") == null ? 0 : node.get("sort_order"));
            task.put("catalog_node_id", e.catalogNodeId());
            Map<String, Object> created =
                    WriteSupport.insertReturning(jdbc, "pms_task", "task_id", task);
            long taskId = ((Number) created.get("task_id")).longValue();
            taskIdByNode.put(e.catalogNodeId(), taskId);
            jdbc.update("UPDATE pms_project_tailoring SET generated_task_id = ? WHERE tailoring_id = ?",
                    taskId, tailoringIdByNode.get(e.catalogNodeId()));
            createdTasks++;
        }

        // ---- 3) DELIVERABLE 노드 → 부모 TASK에 연결된 pms_deliverable ---------
        int createdDeliverables = 0;
        for (Entry e : selected) {
            Map<String, Object> node = nodeById.get(e.catalogNodeId());
            if (!"DELIVERABLE".equals(node.get("node_type"))) continue;
            Long parentNodeId = node.get("parent_node_id") == null
                    ? null : ((Number) node.get("parent_node_id")).longValue();
            Long parentTaskId = parentNodeId == null ? null : taskIdByNode.get(parentNodeId);
            Map<String, Object> deliverable = new LinkedHashMap<>();
            deliverable.put("project_id", projectId);
            deliverable.put("task_id", parentTaskId);
            deliverable.put("deliverable_name", node.get("name"));
            deliverable.put("deliverable_type", node.get("deliverable_category"));
            deliverable.put("status", "DRAFT");
            deliverable.put("catalog_node_id", e.catalogNodeId());
            Map<String, Object> created =
                    WriteSupport.insertReturning(jdbc, "pms_deliverable", "deliverable_id", deliverable);
            long deliverableId = ((Number) created.get("deliverable_id")).longValue();
            jdbc.update(
                    "UPDATE pms_project_tailoring SET generated_deliverable_id = ? WHERE tailoring_id = ?",
                    deliverableId, tailoringIdByNode.get(e.catalogNodeId()));
            createdDeliverables++;
        }

        return new ExpansionResult(createdTasks, createdDeliverables);
    }

    private Map<Long, Map<String, Object>> fetchNodes(List<Long> nodeIds) {
        String ph = String.join(", ", nodeIds.stream().map(id -> "?").toList());
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT node_id, parent_node_id, node_type, name, sort_order, deliverable_category "
                        + "FROM pms_catalog_node WHERE node_id IN (" + ph + ")",
                nodeIds.toArray());
        Map<Long, Map<String, Object>> byId = new LinkedHashMap<>();
        for (Map<String, Object> r : rows) {
            byId.put(((Number) r.get("node_id")).longValue(), r);
        }
        return byId;
    }

    private static Long asPositiveLong(Object v) {
        if (v == null) return null;
        long n;
        if (v instanceof Number num) {
            double d = num.doubleValue();
            if (d != Math.floor(d)) return null;
            n = num.longValue();
        } else {
            try {
                n = Long.parseLong(v.toString().trim());
            } catch (NumberFormatException e) {
                return null;
            }
        }
        return n > 0 ? n : null;
    }

    private record Entry(long catalogNodeId, boolean isSelected, String excludeReason) {}
}
