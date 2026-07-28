package com.aetherpms.deliverable;

import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import com.aetherpms.auth.AuthContext;
import com.aetherpms.auth.ProjectScopeService;
import com.aetherpms.common.ApiException;
import com.aetherpms.common.LinkEntity;
import com.aetherpms.common.LinkTableSupport;
import com.aetherpms.common.ReadMappers;
import com.aetherpms.common.ReadSupport;

import jakarta.servlet.http.HttpServletRequest;

/**
 * deliverable 읽기(구 ReadController 분리).
 * 0034 §0단계 — 참여 스코프(PM/WORKER 등 참여 한정 계정)는 참여 프로젝트 항목만 조회 가능.
 * 0039 — 관련항목(이슈·액션아이템·회의록)은 전부 역방향 링크로 부착.
 */
@RestController
public class DeliverableReadController {

    private final JdbcTemplate jdbc;
    private final DeliverableReadRepository repo;
    private final ProjectScopeService scope;

    public DeliverableReadController(JdbcTemplate jdbc, DeliverableReadRepository repo, ProjectScopeService scope) {
        this.jdbc = jdbc;
        this.repo = repo;
        this.scope = scope;
    }

    @GetMapping("/api/projects/{id}/deliverables")
    public List<Map<String, Object>> list(@PathVariable("id") long rawId, HttpServletRequest req) {
        long id = ReadSupport.parseId(rawId);
        ReadSupport.requireProject(jdbc, id);
        scope.assertCanView(AuthContext.of(req), id);
        List<Map<String, Object>> rows = repo.findByProjectIdOrderByDeliverableIdAsc(id).stream()
                .map(ReadMappers::mapArtifact).toList();
        attachLinks(rows);
        return rows;
    }

    @GetMapping("/api/deliverables/{id}")
    public Map<String, Object> detail(@PathVariable("id") long rawId, HttpServletRequest req) {
        long id = ReadSupport.parseId(rawId);
        Map<String, Object> found = repo.findById(id).map(ReadMappers::mapArtifact)
                .orElseThrow(() -> ApiException.notFound("산출물을 찾을 수 없습니다."));
        scope.assertCanView(AuthContext.of(req), ((Number) found.get("projectId")).longValue());
        attachLinks(List.of(found));
        return found;
    }

    @GetMapping("/api/deliverables")
    public List<Map<String, Object>> all(HttpServletRequest req) {
        List<Map<String, Object>> all = repo.findAllByOrderByDeliverableIdDesc().stream()
                .map(ReadMappers::mapArtifact).toList();
        AuthContext ctx = AuthContext.of(req);
        java.util.Set<Long> visible = scope.visibleProjectIdsOrNull(ctx);
        List<Map<String, Object>> out = visible == null ? all
                : all.stream().filter(m -> visible.contains(((Number) m.get("projectId")).longValue())).toList();
        attachLinks(out);
        return out;
    }

    /** 0040 — 이웃 타입 3종(issueIds/meetingIds/actionItemIds)을 쿼리 1회로 부착. */
    private void attachLinks(List<Map<String, Object>> rows) {
        LinkTableSupport.attachAll(jdbc, rows, "id", LinkEntity.DELIVERABLE,
                List.of(LinkEntity.ISSUE, LinkEntity.MEETING, LinkEntity.ACTION_ITEM));
    }
}
