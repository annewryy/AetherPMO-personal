package com.aetherpms.actionitem;

import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import com.aetherpms.auth.AuthContext;
import com.aetherpms.auth.ProjectScopeService;
import com.aetherpms.common.ApiException;
import com.aetherpms.common.LinkTableSupport;
import com.aetherpms.common.ReadMappers;
import com.aetherpms.common.ReadSupport;

import jakarta.servlet.http.HttpServletRequest;

/**
 * actionitem 읽기(구 ReadController 분리).
 * 0034 §0단계 — 참여 스코프(PM/WORKER 등 참여 한정 계정)는 참여 프로젝트 항목만 조회 가능.
 * 0039 — 관련항목 매핑(태스크·산출물·이슈·회의록) 부착.
 */
@RestController
public class ActionItemReadController {

    private final JdbcTemplate jdbc;
    private final ActionItemReadRepository repo;
    private final ProjectScopeService scope;

    public ActionItemReadController(JdbcTemplate jdbc, ActionItemReadRepository repo, ProjectScopeService scope) {
        this.jdbc = jdbc;
        this.repo = repo;
        this.scope = scope;
    }

    @GetMapping("/api/projects/{id}/action-items")
    public List<Map<String, Object>> list(@PathVariable("id") long rawId, HttpServletRequest req) {
        long id = ReadSupport.parseId(rawId);
        ReadSupport.requireProject(jdbc, id);
        scope.assertCanView(AuthContext.of(req), id);
        List<Map<String, Object>> rows = repo.findByProjectIdOrderByActionIdAsc(id).stream()
                .map(ReadMappers::mapActionItem).toList();
        attachLinks(rows);
        return rows;
    }

    @GetMapping("/api/action-items/{id}")
    public Map<String, Object> detail(@PathVariable("id") long rawId, HttpServletRequest req) {
        long id = ReadSupport.parseId(rawId);
        Map<String, Object> found = repo.findById(id).map(ReadMappers::mapActionItem)
                .orElseThrow(() -> ApiException.notFound("액션아이템을 찾을 수 없습니다."));
        scope.assertCanView(AuthContext.of(req), ((Number) found.get("projectId")).longValue());
        attachLinks(List.of(found));
        return found;
    }

    @GetMapping("/api/action-items")
    public List<Map<String, Object>> all(HttpServletRequest req) {
        List<Map<String, Object>> all = repo.findAllByOrderByActionIdDesc().stream()
                .map(ReadMappers::mapActionItem).toList();
        AuthContext ctx = AuthContext.of(req);
        java.util.Set<Long> visible = scope.visibleProjectIdsOrNull(ctx);
        List<Map<String, Object>> out = visible == null ? all
                : all.stream().filter(m -> visible.contains(((Number) m.get("projectId")).longValue())).toList();
        attachLinks(out);
        return out;
    }

    private void attachLinks(List<Map<String, Object>> rows) {
        LinkTableSupport.attach(jdbc, rows, "id", "pms_action_item_task_link", "action_id", "task_id", "taskIds");
        LinkTableSupport.attach(jdbc, rows, "id", "pms_action_item_deliverable_link", "action_id",
                "deliverable_id", "deliverableIds");
        LinkTableSupport.attach(jdbc, rows, "id", "pms_action_item_issue_link", "action_id", "issue_id", "issueIds");
        LinkTableSupport.attach(jdbc, rows, "id", "pms_meeting_action_link", "action_id", "meeting_id", "meetingIds");
    }
}
