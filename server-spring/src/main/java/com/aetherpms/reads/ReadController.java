package com.aetherpms.reads;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import com.aetherpms.common.ApiException;
import com.aetherpms.project.ProjectCompanyEntity;
import com.aetherpms.project.ProjectCompanyRepository;
import com.aetherpms.project.ProjectEntity;
import com.aetherpms.project.ProjectMapper;
import com.aetherpms.project.ProjectRepository;

/**
 * 전체 읽기 엔드포인트 — Node routes/reads.ts(+ 회사·멤버 읽기) 1:1 이식.
 * 응답은 camelCase 도메인 모델(프론트 web/src/types.ts). 오류는 GlobalExceptionHandler가
 * {"message":"한글"}로. status KO→EN·num() 0폴백은 매퍼가 담당.
 */
@RestController
public class ReadController {

    private final JdbcTemplate jdbc;
    private final ProjectRepository projectRepository;
    private final ProjectCompanyRepository companyRepository;
    private final VrbInfoReadRepository vrbRepository;
    private final DeliverableReadRepository deliverableRepository;
    private final ActionItemReadRepository actionItemRepository;
    private final com.aetherpms.issue.IssueRepository issueRepository;
    private final MeetingReadRepository meetingRepository;
    private final OfficialDocReadRepository officialDocRepository;
    private final ActivityReadRepository activityRepository;
    private final TaskReadRepository taskRepository;
    private final CatalogNodeReadRepository catalogRepository;
    private final WorkflowReadRepository workflowRepository;
    private final WorkflowStatusReadRepository statusRepository;
    private final WorkflowTransitionReadRepository transitionRepository;
    private final TransitionConditionReadRepository conditionRepository;
    private final CompanyReadRepository companyMasterRepository;
    private final ProjectMemberReadRepository memberRepository;

    public ReadController(JdbcTemplate jdbc,
                          ProjectRepository projectRepository,
                          ProjectCompanyRepository companyRepository,
                          VrbInfoReadRepository vrbRepository,
                          DeliverableReadRepository deliverableRepository,
                          ActionItemReadRepository actionItemRepository,
                          com.aetherpms.issue.IssueRepository issueRepository,
                          MeetingReadRepository meetingRepository,
                          OfficialDocReadRepository officialDocRepository,
                          ActivityReadRepository activityRepository,
                          TaskReadRepository taskRepository,
                          CatalogNodeReadRepository catalogRepository,
                          WorkflowReadRepository workflowRepository,
                          WorkflowStatusReadRepository statusRepository,
                          WorkflowTransitionReadRepository transitionRepository,
                          TransitionConditionReadRepository conditionRepository,
                          CompanyReadRepository companyMasterRepository,
                          ProjectMemberReadRepository memberRepository) {
        this.jdbc = jdbc;
        this.projectRepository = projectRepository;
        this.companyRepository = companyRepository;
        this.vrbRepository = vrbRepository;
        this.deliverableRepository = deliverableRepository;
        this.actionItemRepository = actionItemRepository;
        this.issueRepository = issueRepository;
        this.meetingRepository = meetingRepository;
        this.officialDocRepository = officialDocRepository;
        this.activityRepository = activityRepository;
        this.taskRepository = taskRepository;
        this.catalogRepository = catalogRepository;
        this.workflowRepository = workflowRepository;
        this.statusRepository = statusRepository;
        this.transitionRepository = transitionRepository;
        this.conditionRepository = conditionRepository;
        this.companyMasterRepository = companyMasterRepository;
        this.memberRepository = memberRepository;
    }

    // parseId(raw) — Node reads.ts: 정수·양수 아니면 400. (PathVariable long이 정수 보장,
    // 음수/0만 방어. 비정수 문자열은 Spring이 400 처리.)
    private long parseId(long id) {
        if (id <= 0) throw ApiException.badRequest("유효하지 않은 id 입니다.");
        return id;
    }

    private void requireProject(long id) {
        Integer c = jdbc.queryForObject(
                "SELECT COUNT(*) FROM pms_project WHERE project_id = ?", Integer.class, id);
        if (c == null || c == 0) throw ApiException.notFound("프로젝트를 찾을 수 없습니다.");
    }

    // ---- GET /api/projects/:id — 상세(+ 서브리소스 카운트) -------------------
    @GetMapping("/api/projects/{id}")
    public Map<String, Object> projectDetail(@PathVariable("id") long rawId) {
        long id = parseId(rawId);
        ProjectEntity entity = projectRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("프로젝트를 찾을 수 없습니다."));

        Map<String, Object> project = ProjectMapper.mapProject(entity);
        List<Map<String, Object>> members = new ArrayList<>();
        for (ProjectCompanyEntity c : companyRepository.findAllByOrderByProjectCompanyIdAsc()) {
            if (id == c.getProjectId() && !"고객사".equals(c.getRole())) {
                members.add(ProjectMapper.mapConsortium(c));
            }
        }
        project.put("consortiumMembers", members);
        project.put("vrbInfo", vrbRepository.findById(id).map(ReadMappers::mapVrbInfo).orElse(null));

        Map<String, Object> counts = new LinkedHashMap<>();
        counts.put("issues", count("pms_issue", id));
        counts.put("actionItems", count("pms_action_item", id));
        counts.put("deliverables", count("pms_deliverable", id));
        counts.put("meetingMinutes", count("pms_meeting_minutes", id));
        project.put("counts", counts);
        return project;
    }

    private int count(String table, long projectId) {
        Integer c = jdbc.queryForObject(
                "SELECT COUNT(*) FROM " + table + " WHERE project_id = ?", Integer.class, projectId);
        return c == null ? 0 : c;
    }

    // ---- 상세 탭용 서브리소스 (단순 SELECT + 매핑) --------------------------
    @GetMapping("/api/projects/{id}/issues")
    public List<Map<String, Object>> issues(@PathVariable("id") long rawId) {
        long id = parseId(rawId);
        requireProject(id);
        return issueRepository.findByProjectIdOrderByIssueIdAsc(id).stream()
                .map(com.aetherpms.issue.IssueMapper::mapIssue).toList();
    }

    @GetMapping("/api/projects/{id}/action-items")
    public List<Map<String, Object>> actionItems(@PathVariable("id") long rawId) {
        long id = parseId(rawId);
        requireProject(id);
        return actionItemRepository.findByProjectIdOrderByActionIdAsc(id).stream()
                .map(ReadMappers::mapActionItem).toList();
    }

    @GetMapping("/api/projects/{id}/deliverables")
    public List<Map<String, Object>> deliverables(@PathVariable("id") long rawId) {
        long id = parseId(rawId);
        requireProject(id);
        return deliverableRepository.findByProjectIdOrderByDeliverableIdAsc(id).stream()
                .map(ReadMappers::mapArtifact).toList();
    }

    @GetMapping("/api/projects/{id}/meeting-minutes")
    public List<Map<String, Object>> meetingMinutes(@PathVariable("id") long rawId) {
        long id = parseId(rawId);
        requireProject(id);
        return meetingRepository.findByProjectIdOrderByMeetingIdAsc(id).stream()
                .map(ReadMappers::mapMeeting).toList();
    }

    @GetMapping("/api/projects/{id}/official-docs")
    public List<Map<String, Object>> officialDocs(@PathVariable("id") long rawId) {
        long id = parseId(rawId);
        requireProject(id);
        return officialDocRepository.findByProjectIdOrderByDocIdAsc(id).stream()
                .map(ReadMappers::mapOfficialDoc).toList();
    }

    @GetMapping("/api/projects/{id}/activities")
    public List<Map<String, Object>> activities(@PathVariable("id") long rawId) {
        long id = parseId(rawId);
        requireProject(id);
        return activityRepository.findByProjectIdOrderByAuditIdAsc(id).stream()
                .map(ReadMappers::mapActivity).toList();
    }

    @GetMapping("/api/projects/{id}/tasks")
    public List<Map<String, Object>> tasks(@PathVariable("id") long rawId) {
        long id = parseId(rawId);
        requireProject(id);
        return taskRepository.findByProjectIdOrderBySortOrderAscTaskIdAsc(id).stream()
                .map(ReadMappers::mapTask).toList();
    }

    // VRB는 프로젝트당 0~1건 — 단건 또는 null 반환.
    @GetMapping("/api/projects/{id}/vrb")
    public Map<String, Object> vrb(@PathVariable("id") long rawId) {
        long id = parseId(rawId);
        requireProject(id);
        return vrbRepository.findById(id).map(ReadMappers::mapVrbInfo).orElse(null);
    }

    @GetMapping("/api/projects/{id}/members")
    public List<Map<String, Object>> members(@PathVariable("id") long rawId) {
        long id = parseId(rawId);
        requireProject(id);
        return memberRepository
                .findByProjectIdAndIsActiveTrueOrderByIsProjectManagerDescMemberIdAsc(id).stream()
                .map(ReadMappers::mapProjectMember).toList();
    }

    // ---- 아이템 단건 조회 (배치22) — 상세 페이지 URL 진입 시 id로 단건 로드 ----
    //   응답 shape = 목록 아이템과 동일(camelCase). 기존 목록 매퍼 재사용. 없으면 404.
    @GetMapping("/api/issues/{id}")
    public Map<String, Object> issueDetail(@PathVariable("id") long rawId) {
        long id = parseId(rawId);
        return issueRepository.findById(id)
                .map(com.aetherpms.issue.IssueMapper::mapIssue)
                .orElseThrow(() -> ApiException.notFound("이슈를 찾을 수 없습니다."));
    }

    @GetMapping("/api/action-items/{id}")
    public Map<String, Object> actionItemDetail(@PathVariable("id") long rawId) {
        long id = parseId(rawId);
        return actionItemRepository.findById(id)
                .map(ReadMappers::mapActionItem)
                .orElseThrow(() -> ApiException.notFound("액션아이템을 찾을 수 없습니다."));
    }

    @GetMapping("/api/deliverables/{id}")
    public Map<String, Object> deliverableDetail(@PathVariable("id") long rawId) {
        long id = parseId(rawId);
        return deliverableRepository.findById(id)
                .map(ReadMappers::mapArtifact)
                .orElseThrow(() -> ApiException.notFound("산출물을 찾을 수 없습니다."));
    }

    @GetMapping("/api/tasks/{id}")
    public Map<String, Object> taskDetail(@PathVariable("id") long rawId) {
        long id = parseId(rawId);
        return taskRepository.findById(id)
                .map(ReadMappers::mapTask)
                .orElseThrow(() -> ApiException.notFound("태스크를 찾을 수 없습니다."));
    }

    // ---- GET /api/catalog/tree — 중첩 JSON 트리 ---------------------------
    @GetMapping("/api/catalog/tree")
    public List<Map<String, Object>> catalogTree(
            @org.springframework.web.bind.annotation.RequestParam(name = "includeInactive", required = false) String includeInactive) {
        boolean showAll = "true".equals(includeInactive);
        Map<Long, Map<String, Object>> byId = new LinkedHashMap<>();
        for (CatalogNodeEntity n : catalogRepository.findAllByOrderBySortOrderAscNodeIdAsc()) {
            // coalesce(is_active, true): 기본 활성만. includeInactive=true면 전부.
            boolean active = n.getIsActive() == null || n.getIsActive();
            if (!showAll && !active) continue;
            byId.put(n.getNodeId(), ReadMappers.mapCatalogNode(n));
        }
        List<Map<String, Object>> roots = new ArrayList<>();
        for (Map<String, Object> node : byId.values()) {
            Object parentId = node.get("parentId");
            if (parentId != null && byId.containsKey(((Number) parentId).longValue())) {
                @SuppressWarnings("unchecked")
                List<Object> children = (List<Object>) byId.get(((Number) parentId).longValue()).get("children");
                children.add(node);
            } else {
                roots.add(node);
            }
        }
        return roots;
    }

    // ---- GET /api/companies — 기준정보 회사 목록 --------------------------
    @GetMapping("/api/companies")
    public List<Map<String, Object>> companies() {
        return companyMasterRepository.findAllByOrderByCompanyIdAsc().stream()
                .map(ReadMappers::mapCompany).toList();
    }

    // ---- GET /api/workflows — workflow + status + transition + condition --
    @GetMapping("/api/workflows")
    public List<Map<String, Object>> workflows() {
        List<WorkflowEntity> wfs = workflowRepository.findAllByOrderByWorkflowIdAsc();
        List<WorkflowStatusEntity> statuses =
                statusRepository.findAllByOrderByWorkflowIdAscSortOrderAscStatusIdAsc();
        List<WorkflowTransitionEntity> transitions =
                transitionRepository.findAllByOrderByWorkflowIdAscTransitionIdAsc();
        List<TransitionConditionEntity> conditions =
                conditionRepository.findAllByOrderByTransitionIdAscSortOrderAscConditionIdAsc();

        // usedNodeCount = 이 워크플로를 참조하는 카탈로그 노드 수
        Map<Long, Integer> nodeCountByWf = new LinkedHashMap<>();
        for (Map<String, Object> row : jdbc.queryForList(
                "SELECT workflow_id, COUNT(*) AS cnt FROM pms_catalog_node "
              + "WHERE workflow_id IS NOT NULL GROUP BY workflow_id")) {
            nodeCountByWf.put(((Number) row.get("workflow_id")).longValue(),
                    ((Number) row.get("cnt")).intValue());
        }

        // 조건: transition_id별 그룹
        Map<Long, List<Map<String, Object>>> condsByTr = new LinkedHashMap<>();
        for (TransitionConditionEntity c : conditions) {
            condsByTr.computeIfAbsent(c.getTransitionId(), k -> new ArrayList<>())
                    .add(ReadMappers.mapTransitionCondition(c));
        }
        // status_id → code (전이의 from/to code 조회)
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
