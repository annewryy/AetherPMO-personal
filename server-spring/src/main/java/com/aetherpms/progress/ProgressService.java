package com.aetherpms.progress;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;

import com.aetherpms.common.ApiException;

/**
 * 진척률 계산 서비스 — Node engine/progress.ts 의 getProjectProgress/buildProgressTree 이식.
 * 응답 {projectId, overall, fallback, phases[], totals}.
 */
@Service
public class ProgressService {

    private final ProgressRepository repository;

    public ProgressService(ProgressRepository repository) {
        this.repository = repository;
    }

    /** rate(total, approved): total>0 ? round(approved/total*100) : 0. */
    private static int rate(long total, long approved) {
        return total > 0 ? (int) Math.round((approved * 100.0) / total) : 0;
    }

    private static long asLong(Object v) {
        return v == null ? 0 : ((Number) v).longValue();
    }

    public Map<String, Object> getProjectProgress(long projectId) {
        if (!repository.projectExists(projectId)) {
            throw ApiException.notFound("프로젝트를 찾을 수 없습니다.");
        }

        List<Map<String, Object>> rows = repository.rollup(projectId);

        Map<String, Object> overallRow = rows.stream()
                .filter(r -> "PROJECT".equals(r.get("node_type")))
                .findFirst()
                .orElse(null);
        long total = overallRow == null ? 0 : asLong(overallRow.get("total"));
        long approved = overallRow == null ? 0 : asLong(overallRow.get("approved"));
        boolean fallback = total == 0;

        int overall;
        if (fallback) {
            Integer manual = repository.findManualProgressRate(projectId);
            overall = manual == null ? 0 : manual;
        } else {
            overall = rate(total, approved);
        }

        List<Map<String, Object>> phases = buildProgressTree(rows);

        // 응답: progress route는 {projectId, overall, fallback, phases} 만 반환(totals 제외).
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("projectId", projectId);
        out.put("overall", overall);
        out.put("fallback", fallback);
        out.put("phases", phases);
        return out;
    }

    /**
     * 롤업 행(flat) → 응답 트리(phases→activities→tasks).
     * Node buildProgressTree 이식. 부모가 테일러링에 없는 고아 노드는 제외.
     */
    public static List<Map<String, Object>> buildProgressTree(List<Map<String, Object>> rows) {
        List<Map<String, Object>> nodes = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            if (!"PROJECT".equals(r.get("node_type"))) {
                nodes.add(r);
            }
        }
        nodes.sort(Comparator
                .comparingLong((Map<String, Object> r) -> asLong(r.get("sort_order")))
                .thenComparingLong(r -> asLong(r.get("node_id"))));

        List<Map<String, Object>> phases = new ArrayList<>();
        Map<Long, Map<String, Object>> phaseById = new LinkedHashMap<>();
        Map<Long, Map<String, Object>> activityById = new LinkedHashMap<>();

        for (Map<String, Object> r : nodes) {
            if (!"PHASE".equals(r.get("node_type"))) continue;
            long nodeId = asLong(r.get("node_id"));
            Map<String, Object> phase = new LinkedHashMap<>();
            phase.put("nodeId", nodeId);
            phase.put("code", r.get("code"));
            phase.put("name", r.get("name"));
            phase.put("rate", rate(asLong(r.get("total")), asLong(r.get("approved"))));
            phase.put("activities", new ArrayList<>());
            phaseById.put(nodeId, phase);
            phases.add(phase);
        }
        for (Map<String, Object> r : nodes) {
            if (!"ACTIVITY".equals(r.get("node_type"))) continue;
            Long parentId = r.get("parent_node_id") == null ? null : asLong(r.get("parent_node_id"));
            Map<String, Object> parent = parentId == null ? null : phaseById.get(parentId);
            if (parent == null) continue;
            long nodeId = asLong(r.get("node_id"));
            Map<String, Object> activity = new LinkedHashMap<>();
            activity.put("nodeId", nodeId);
            activity.put("code", r.get("code"));
            activity.put("name", r.get("name"));
            activity.put("rate", rate(asLong(r.get("total")), asLong(r.get("approved"))));
            activity.put("tasks", new ArrayList<>());
            activityById.put(nodeId, activity);
            @SuppressWarnings("unchecked")
            List<Object> acts = (List<Object>) parent.get("activities");
            acts.add(activity);
        }
        for (Map<String, Object> r : nodes) {
            if (!"TASK".equals(r.get("node_type"))) continue;
            Long parentId = r.get("parent_node_id") == null ? null : asLong(r.get("parent_node_id"));
            Map<String, Object> parent = parentId == null ? null : activityById.get(parentId);
            if (parent == null) continue;
            long t = asLong(r.get("total"));
            long a = asLong(r.get("approved"));
            Map<String, Object> task = new LinkedHashMap<>();
            task.put("nodeId", asLong(r.get("node_id")));
            task.put("code", r.get("code"));
            task.put("name", r.get("name"));
            task.put("rate", rate(t, a));
            Map<String, Object> deliverables = new LinkedHashMap<>();
            deliverables.put("total", t);
            deliverables.put("approved", a);
            task.put("deliverables", deliverables);
            @SuppressWarnings("unchecked")
            List<Object> tasks = (List<Object>) parent.get("tasks");
            tasks.add(task);
        }
        return phases;
    }
}
