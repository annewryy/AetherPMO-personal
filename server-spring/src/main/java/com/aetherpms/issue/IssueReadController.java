package com.aetherpms.issue;

import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import com.aetherpms.auth.AuthContext;
import com.aetherpms.auth.ProjectScopeService;
import com.aetherpms.common.ApiException;
import com.aetherpms.common.ReadSupport;

import jakarta.servlet.http.HttpServletRequest;

/**
 * 이슈 읽기(구 ReadController 분리). 생성/수정은 IssueController·IssueWriteController.
 * 0034 §0단계 — 참여 스코프(PM/WORKER 등 참여 한정 계정)는 참여 프로젝트 항목만 조회 가능.
 */
@RestController
public class IssueReadController {

    private final JdbcTemplate jdbc;
    private final IssueRepository repo;
    private final ProjectScopeService scope;

    public IssueReadController(JdbcTemplate jdbc, IssueRepository repo, ProjectScopeService scope) {
        this.jdbc = jdbc;
        this.repo = repo;
        this.scope = scope;
    }

    @GetMapping("/api/projects/{id}/issues")
    public List<Map<String, Object>> list(@PathVariable("id") long rawId, HttpServletRequest req) {
        long id = ReadSupport.parseId(rawId);
        ReadSupport.requireProject(jdbc, id);
        scope.assertCanView(AuthContext.of(req), id);
        List<Map<String, Object>> rows = repo.findByProjectIdOrderByIssueIdAsc(id).stream()
                .map(IssueMapper::mapIssue).toList();
        attachTaskIds(rows);
        return rows;
    }

    @GetMapping("/api/issues/{id}")
    public Map<String, Object> detail(@PathVariable("id") long rawId, HttpServletRequest req) {
        long id = ReadSupport.parseId(rawId);
        Map<String, Object> found = repo.findById(id).map(IssueMapper::mapIssue)
                .orElseThrow(() -> ApiException.notFound("이슈를 찾을 수 없습니다."));
        scope.assertCanView(AuthContext.of(req), ((Number) found.get("projectId")).longValue());
        attachTaskIds(List.of(found));
        return found;
    }

    @GetMapping("/api/issues")
    public List<Map<String, Object>> all(HttpServletRequest req) {
        List<Map<String, Object>> all = repo.findAllByOrderByIssueIdDesc().stream()
                .map(IssueMapper::mapIssue).toList();
        AuthContext ctx = AuthContext.of(req);
        java.util.Set<Long> visible = scope.visibleProjectIdsOrNull(ctx);
        List<Map<String, Object>> out = visible == null ? all
                : all.stream().filter(m -> visible.contains(((Number) m.get("projectId")).longValue())).toList();
        attachTaskIds(out);
        return out;
    }

    /** 0039 — 이슈별 매핑된 태스크 id를 배치 조회해 "taskIds"로 부착(N+1 방지). */
    private void attachTaskIds(List<Map<String, Object>> rows) {
        if (rows.isEmpty()) return;
        List<Long> ids = rows.stream().map(r -> ((Number) r.get("id")).longValue()).toList();
        String placeholders = String.join(",", java.util.Collections.nCopies(ids.size(), "?"));
        List<Map<String, Object>> links = jdbc.queryForList(
                "SELECT issue_id, task_id FROM pms_issue_task_link WHERE issue_id IN (" + placeholders + ")",
                ids.toArray());
        Map<Long, List<Long>> byIssue = new java.util.LinkedHashMap<>();
        for (Map<String, Object> l : links) {
            long iid = ((Number) l.get("issue_id")).longValue();
            byIssue.computeIfAbsent(iid, k -> new java.util.ArrayList<>())
                    .add(((Number) l.get("task_id")).longValue());
        }
        for (Map<String, Object> row : rows) {
            row.put("taskIds", byIssue.getOrDefault(((Number) row.get("id")).longValue(), List.of()));
        }
    }
}
