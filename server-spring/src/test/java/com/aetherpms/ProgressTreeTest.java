package com.aetherpms;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.aetherpms.progress.ProgressService;

/**
 * buildProgressTree 순수 로직 검증 — DB 불필요(Docker 없이 실행).
 * Node engine/progress.ts buildProgressTree 이식 정확성 확인.
 * 롤업 SQL이 낼 flat 행을 손으로 만들어 트리·rate 산정을 검증한다.
 */
class ProgressTreeTest {

    private static Map<String, Object> row(Object nodeId, Object parentId, String type,
                                           String code, String name, long sortOrder,
                                           long total, long approved) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("node_id", nodeId);
        r.put("parent_node_id", parentId);
        r.put("node_type", type);
        r.put("code", code);
        r.put("name", name);
        r.put("sort_order", sortOrder);
        r.put("total", total);
        r.put("approved", approved);
        return r;
    }

    @Test
    void buildsPhaseActivityTaskTreeWithRates() {
        List<Map<String, Object>> rows = new ArrayList<>();
        // PHASE 1 롤업 2/4=50, ACTIVITY 2 (2/4), TASK 3 (1/2), TASK 4 (1/2)
        rows.add(row(1L, null, "PHASE", "PH-1", "분석단계", 10, 4, 2));
        rows.add(row(2L, 1L, "ACTIVITY", "AC-1", "요구분석", 10, 4, 2));
        rows.add(row(3L, 2L, "TASK", "T-1", "수집", 10, 2, 1));
        rows.add(row(4L, 2L, "TASK", "T-2", "정의", 20, 2, 1));
        rows.add(row(null, null, "PROJECT", null, null, 0, 4, 2));

        List<Map<String, Object>> phases = ProgressService.buildProgressTree(rows);

        assertThat(phases).hasSize(1);
        Map<String, Object> phase = phases.get(0);
        assertThat(phase.get("nodeId")).isEqualTo(1L);
        assertThat(phase.get("rate")).isEqualTo(50);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> activities = (List<Map<String, Object>>) phase.get("activities");
        assertThat(activities).hasSize(1);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> tasks = (List<Map<String, Object>>) activities.get(0).get("tasks");
        assertThat(tasks).hasSize(2);
        assertThat(tasks.get(0).get("rate")).isEqualTo(50);
        @SuppressWarnings("unchecked")
        Map<String, Object> deliv = (Map<String, Object>) tasks.get(0).get("deliverables");
        assertThat(deliv.get("total")).isEqualTo(2L);
        assertThat(deliv.get("approved")).isEqualTo(1L);
    }

    @Test
    void orphanNodesWithoutParentAreDropped() {
        List<Map<String, Object>> rows = new ArrayList<>();
        // ACTIVITY 참조하는 PHASE가 없으면 트리에서 제외
        rows.add(row(2L, 99L, "ACTIVITY", "AC-X", "고아", 10, 0, 0));
        rows.add(row(null, null, "PROJECT", null, null, 0, 0, 0));
        assertThat(ProgressService.buildProgressTree(rows)).isEmpty();
    }
}
