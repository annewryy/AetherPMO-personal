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
        return repo.findByProjectIdOrderByIssueIdAsc(id).stream().map(IssueMapper::mapIssue).toList();
    }

    @GetMapping("/api/issues/{id}")
    public Map<String, Object> detail(@PathVariable("id") long rawId, HttpServletRequest req) {
        long id = ReadSupport.parseId(rawId);
        Map<String, Object> found = repo.findById(id).map(IssueMapper::mapIssue)
                .orElseThrow(() -> ApiException.notFound("이슈를 찾을 수 없습니다."));
        scope.assertCanView(AuthContext.of(req), ((Number) found.get("projectId")).longValue());
        return found;
    }

    @GetMapping("/api/issues")
    public List<Map<String, Object>> all(HttpServletRequest req) {
        List<Map<String, Object>> all = repo.findAllByOrderByIssueIdDesc().stream()
                .map(IssueMapper::mapIssue).toList();
        AuthContext ctx = AuthContext.of(req);
        if (!scope.isScoped(ctx)) return all;
        java.util.Set<Long> mine = scope.memberProjectIds(ctx);
        return all.stream().filter(m -> mine.contains(((Number) m.get("projectId")).longValue())).toList();
    }
}
