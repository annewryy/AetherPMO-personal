package com.aetherpms.wbs;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;

import com.aetherpms.common.ApiException;
import com.aetherpms.engine.SignalDates;
import com.aetherpms.progress.ProgressRepository;

/**
 * WBS/일정 조회 서비스 — 배치19.
 * 프로젝트 상세 "WBS/일정" 탭(날짜축 간트 + 진척 숫자)이 한 번에 쓸 트리를 만든다.
 *
 * 재사용(중복 계산 금지):
 *  - 실제 진척%(actualRate): {@link ProgressRepository#rollup} 롤업 결과의 node별 total/approved → rate.
 *    (ProgressService.rate 와 동일 규칙: total>0 ? round(approved/total*100) : 0)
 *  - 목표 진척%(targetRate): {@link SignalDates#linearExpected} (0007 §1 기대치, 계획일정·경과 선형).
 *
 * 응답 트리(phase→activity→task), node별 필드(camelCase):
 *  nodeId·code·name·nodeType, actualRate·targetRate·delta(actual−target),
 *  status(TASK)·assigneeId·assigneeName(TASK),
 *  plannedStartDate·plannedEndDate·actualStartDate·actualEndDate,
 *  deliverableCounts{total,approved}(TASK).
 *
 * 계획일정 소스:
 *  - TASK    : pms_task.planned/actual (WbsRepository 조인).
 *  - PHASE   : pms_project_tailoring 계획일정. 없으면 하위 min(start)/max(end) 파생.
 *  - ACTIVITY: 하위 TASK min(start)/max(end) 파생.
 * 없는 값은 null(더미 금지).
 */
@Service
public class WbsService {

    private final WbsRepository repository;
    private final ProgressRepository progressRepository;

    public WbsService(WbsRepository repository, ProgressRepository progressRepository) {
        this.repository = repository;
        this.progressRepository = progressRepository;
    }

    private static int rate(long total, long approved) {
        return total > 0 ? (int) Math.round((approved * 100.0) / total) : 0;
    }

    private static long asLong(Object v) {
        return v == null ? 0 : ((Number) v).longValue();
    }

    private static Long asLongOrNull(Object v) {
        return v == null ? null : ((Number) v).longValue();
    }

    private static String str(Object v) {
        return v == null ? null : v.toString();
    }

    /** date 컬럼 → ISO yyyy-MM-dd 문자열(없으면 null). SignalDates.parseDateOnly 재사용. */
    private static String dateStr(Object v) {
        LocalDate d = SignalDates.parseDateOnly(v);
        return d == null ? null : d.toString();
    }

    public Map<String, Object> getProjectWbs(long projectId) {
        if (!repository.projectExists(projectId)) {
            throw ApiException.notFound("프로젝트를 찾을 수 없습니다.");
        }

        LocalDate today = LocalDate.now();

        // 실제 진척(롤업) — node_id → rate 인덱스. ProgressService와 동일 SQL 재사용.
        Map<Long, Integer> actualByNode = new LinkedHashMap<>();
        for (Map<String, Object> r : progressRepository.rollup(projectId)) {
            if ("PROJECT".equals(r.get("node_type"))) continue;
            Long nodeId = asLongOrNull(r.get("node_id"));
            if (nodeId == null) continue;
            actualByNode.put(nodeId, rate(asLong(r.get("total")), asLong(r.get("approved"))));
        }

        // TASK 산출물 카운트 — node_id → {total, approved}
        Map<Long, long[]> delivByNode = new LinkedHashMap<>();
        for (Map<String, Object> r : repository.taskDeliverableCounts(projectId)) {
            delivByNode.put(asLong(r.get("task_node_id")),
                    new long[]{asLong(r.get("total")), asLong(r.get("approved"))});
        }

        List<Map<String, Object>> rows = repository.wbsNodes(projectId);
        rows.sort(Comparator
                .comparingLong((Map<String, Object> r) -> asLong(r.get("sort_order")))
                .thenComparingLong(r -> asLong(r.get("node_id"))));

        List<Map<String, Object>> phases = new ArrayList<>();
        Map<Long, Map<String, Object>> phaseById = new LinkedHashMap<>();
        Map<Long, Map<String, Object>> activityById = new LinkedHashMap<>();

        // ---- PHASE ----
        for (Map<String, Object> r : rows) {
            if (!"PHASE".equals(r.get("node_type"))) continue;
            long nodeId = asLong(r.get("node_id"));
            Map<String, Object> node = baseNode(nodeId, r, actualByNode, today,
                    dateStr(r.get("phase_planned_start")), dateStr(r.get("phase_planned_end")),
                    null, null);
            node.put("status", null);
            node.put("assigneeId", null);
            node.put("assigneeName", null);
            node.put("activities", new ArrayList<>());
            phaseById.put(nodeId, node);
            phases.add(node);
        }

        // ---- ACTIVITY ----
        for (Map<String, Object> r : rows) {
            if (!"ACTIVITY".equals(r.get("node_type"))) continue;
            Long parentId = asLongOrNull(r.get("parent_node_id"));
            Map<String, Object> parent = parentId == null ? null : phaseById.get(parentId);
            if (parent == null) continue;
            long nodeId = asLong(r.get("node_id"));
            Map<String, Object> node = baseNode(nodeId, r, actualByNode, today, null, null, null, null);
            node.put("status", null);
            node.put("assigneeId", null);
            node.put("assigneeName", null);
            node.put("tasks", new ArrayList<>());
            activityById.put(nodeId, node);
            @SuppressWarnings("unchecked")
            List<Object> acts = (List<Object>) parent.get("activities");
            acts.add(node);
        }

        // ---- TASK ----
        for (Map<String, Object> r : rows) {
            if (!"TASK".equals(r.get("node_type"))) continue;
            Long parentId = asLongOrNull(r.get("parent_node_id"));
            Map<String, Object> parent = parentId == null ? null : activityById.get(parentId);
            if (parent == null) continue;
            long nodeId = asLong(r.get("node_id"));
            String plannedStart = dateStr(r.get("task_planned_start"));
            String plannedEnd = dateStr(r.get("task_planned_end"));
            String actualStart = dateStr(r.get("task_actual_start"));
            String actualEnd = dateStr(r.get("task_actual_end"));
            Map<String, Object> node = baseNode(nodeId, r, actualByNode, today,
                    plannedStart, plannedEnd, actualStart, actualEnd);
            // 태스크 상세 이동용 실제 pms_task.task_id — nodeId(카탈로그 노드 id)와 다르다.
            //   전개 매핑이 없으면 null(아직 태스크 미생성) → 프론트는 이동 비활성.
            node.put("taskId", asLongOrNull(r.get("task_id")));
            node.put("status", str(r.get("task_status")));
            node.put("assigneeId", str(r.get("assignee_id")));
            node.put("assigneeName", str(r.get("assignee_name")));
            long[] dc = delivByNode.get(nodeId);
            Map<String, Object> deliverableCounts = new LinkedHashMap<>();
            deliverableCounts.put("total", dc == null ? 0L : dc[0]);
            deliverableCounts.put("approved", dc == null ? 0L : dc[1]);
            node.put("deliverableCounts", deliverableCounts);
            @SuppressWarnings("unchecked")
            List<Object> tasks = (List<Object>) parent.get("tasks");
            tasks.add(node);
        }

        // ---- 상위 노드 계획일정 파생(min start / max end) + targetRate 재계산 ----
        for (Map<String, Object> phase : phases) {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> activities = (List<Map<String, Object>>) phase.get("activities");
            for (Map<String, Object> activity : activities) {
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> tasks = (List<Map<String, Object>>) activity.get("tasks");
                deriveDatesAndTarget(activity, tasks, today);
            }
            deriveDatesAndTarget(phase, activities, today);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("projectId", projectId);
        out.put("phases", phases);
        return out;
    }

    /** 공통 노드 필드 + targetRate/delta 산정(계획일정이 있으면 linearExpected). */
    private Map<String, Object> baseNode(long nodeId, Map<String, Object> r,
            Map<Long, Integer> actualByNode, LocalDate today,
            String plannedStart, String plannedEnd, String actualStart, String actualEnd) {
        Map<String, Object> node = new LinkedHashMap<>();
        node.put("nodeId", nodeId);
        node.put("code", r.get("code"));
        node.put("name", r.get("name"));
        node.put("nodeType", r.get("node_type"));
        int actual = actualByNode.getOrDefault(nodeId, 0);
        node.put("actualRate", actual);
        Integer target = expected(plannedStart, plannedEnd, today);
        node.put("targetRate", target);
        node.put("delta", target == null ? null : actual - target);
        node.put("plannedStartDate", plannedStart);
        node.put("plannedEndDate", plannedEnd);
        node.put("actualStartDate", actualStart);
        node.put("actualEndDate", actualEnd);
        return node;
    }

    /** 계획 시작·종료가 모두 있으면 0007 §1 선형 기대치, 아니면 null(판정불가). */
    private static Integer expected(String plannedStart, String plannedEnd, LocalDate today) {
        LocalDate s = SignalDates.parseDateOnly(plannedStart);
        LocalDate e = SignalDates.parseDateOnly(plannedEnd);
        if (s == null || e == null) return null;
        return SignalDates.linearExpected(s, e, today);
    }

    /**
     * 상위 노드 계획일정을 하위 min(start)/max(end)로 파생.
     * PHASE는 tailoring 계획일정이 이미 있으면 유지(우선), 없을 때만 파생.
     * 파생 후 targetRate/delta 재계산.
     */
    private static void deriveDatesAndTarget(Map<String, Object> parent,
            List<Map<String, Object>> children, LocalDate today) {
        String curStart = str(parent.get("plannedStartDate"));
        String curEnd = str(parent.get("plannedEndDate"));

        // 계획일정: PHASE tailoring 값 우선, 없으면 하위 min(start)/max(end) 파생.
        String plannedStart = curStart != null ? curStart : minChildDate(children, "plannedStartDate");
        String plannedEnd = curEnd != null ? curEnd : maxChildDate(children, "plannedEndDate");

        parent.put("plannedStartDate", plannedStart);
        parent.put("plannedEndDate", plannedEnd);
        parent.put("actualStartDate", minChildDate(children, "actualStartDate"));
        parent.put("actualEndDate", maxChildDate(children, "actualEndDate"));

        int actual = (Integer) parent.get("actualRate");
        Integer target = expected(plannedStart, plannedEnd, today);
        parent.put("targetRate", target);
        parent.put("delta", target == null ? null : actual - target);
    }

    private static String minChildDate(List<Map<String, Object>> children, String key) {
        String min = null;
        for (Map<String, Object> c : children) min = minDate(min, str(c.get(key)));
        return min;
    }

    private static String maxChildDate(List<Map<String, Object>> children, String key) {
        String max = null;
        for (Map<String, Object> c : children) max = maxDate(max, str(c.get(key)));
        return max;
    }

    // ISO yyyy-MM-dd 는 사전순 = 시간순.
    private static String minDate(String a, String b) {
        if (a == null) return b;
        if (b == null) return a;
        return a.compareTo(b) <= 0 ? a : b;
    }

    private static String maxDate(String a, String b) {
        if (a == null) return b;
        if (b == null) return a;
        return a.compareTo(b) >= 0 ? a : b;
    }
}
