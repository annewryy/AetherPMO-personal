package com.aetherpms.engine;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import com.aetherpms.common.ReadMappers;

/** 워크플로 정의 읽기(구 ReadController 분리) — workflow+status+transition+condition 조립. */
@RestController
public class WorkflowReadController {

    private final JdbcTemplate jdbc;
    private final WorkflowReadRepository workflowRepository;
    private final WorkflowStatusReadRepository statusRepository;
    private final WorkflowTransitionReadRepository transitionRepository;
    private final TransitionConditionReadRepository conditionRepository;

    public WorkflowReadController(JdbcTemplate jdbc, WorkflowReadRepository workflowRepository,
            WorkflowStatusReadRepository statusRepository,
            WorkflowTransitionReadRepository transitionRepository,
            TransitionConditionReadRepository conditionRepository) {
        this.jdbc = jdbc;
        this.workflowRepository = workflowRepository;
        this.statusRepository = statusRepository;
        this.transitionRepository = transitionRepository;
        this.conditionRepository = conditionRepository;
    }

    @GetMapping("/api/workflows")
    public List<Map<String, Object>> workflows() {
        List<WorkflowEntity> wfs = workflowRepository.findAllByOrderByWorkflowIdAsc();
        List<WorkflowStatusEntity> statuses =
                statusRepository.findAllByOrderByWorkflowIdAscSortOrderAscStatusIdAsc();
        List<WorkflowTransitionEntity> transitions =
                transitionRepository.findAllByOrderByWorkflowIdAscTransitionIdAsc();
        List<TransitionConditionEntity> conditions =
                conditionRepository.findAllByOrderByTransitionIdAscSortOrderAscConditionIdAsc();

        Map<Long, Integer> nodeCountByWf = new LinkedHashMap<>();
        for (Map<String, Object> row : jdbc.queryForList(
                "SELECT workflow_id, COUNT(*) AS cnt FROM pms_catalog_node "
              + "WHERE workflow_id IS NOT NULL GROUP BY workflow_id")) {
            nodeCountByWf.put(((Number) row.get("workflow_id")).longValue(),
                    ((Number) row.get("cnt")).intValue());
        }

        Map<Long, List<Map<String, Object>>> condsByTr = new LinkedHashMap<>();
        for (TransitionConditionEntity c : conditions) {
            condsByTr.computeIfAbsent(c.getTransitionId(), k -> new ArrayList<>())
                    .add(ReadMappers.mapTransitionCondition(c));
        }
        Map<Long, String> codeByStatus = new LinkedHashMap<>();
        for (WorkflowStatusEntity s : statuses) codeByStatus.put(s.getStatusId(), s.getCode());

        List<Map<String, Object>> result = new ArrayList<>();
        for (WorkflowEntity w : wfs) {
            Map<String, Object> wf = new LinkedHashMap<>();
            wf.put("id", w.getWorkflowId());
            wf.put("name", w.getName());
            wf.put("description", w.getDescription());
            wf.put("isDefault", w.getIsDefault());
            wf.put("usedNodeCount", nodeCountByWf.getOrDefault(w.getWorkflowId(), 0));

            List<Map<String, Object>> wfStatuses = new ArrayList<>();
            for (WorkflowStatusEntity s : statuses) {
                if (s.getWorkflowId().equals(w.getWorkflowId())) {
                    wfStatuses.add(ReadMappers.mapWorkflowStatus(s));
                }
            }
            wf.put("statuses", wfStatuses);

            List<Map<String, Object>> wfTransitions = new ArrayList<>();
            for (WorkflowTransitionEntity t : transitions) {
                if (!t.getWorkflowId().equals(w.getWorkflowId())) continue;
                Map<String, Object> tr = new LinkedHashMap<>();
                tr.put("id", t.getTransitionId());
                tr.put("name", t.getName());
                tr.put("fromStatusId", t.getFromStatusId());
                tr.put("toStatusId", t.getToStatusId());
                tr.put("fromStatusCode", codeByStatus.get(t.getFromStatusId()));
                tr.put("toStatusCode", codeByStatus.get(t.getToStatusId()));
                tr.put("conditions", condsByTr.getOrDefault(t.getTransitionId(), new ArrayList<>()));
                wfTransitions.add(tr);
            }
            wf.put("transitions", wfTransitions);
            result.add(wf);
        }
        return result;
    }
}
