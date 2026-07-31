package com.aetherpms.project;

import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.aetherpms.auth.AuthContext;
import com.aetherpms.auth.ProjectScopeService;
import com.aetherpms.common.CurrentActor;
import com.aetherpms.common.ReadSupport;

import jakarta.servlet.http.HttpServletRequest;

/**
 * 0044 §C — 프로젝트 테일러링 편집 API(전개 후 추가/삭제).
 *  GET  /api/projects/{id}/tailoring — 현재 선택 노드 집합(편집 모달 프리로드용)
 *  POST /api/projects/{id}/tailoring — { add: [nodeId...], remove: [nodeId...] }
 */
@RestController
public class ProjectTailoringController {

    private final JdbcTemplate jdbc;
    private final TailoringEditService service;
    private final ProjectScopeService scope;

    public ProjectTailoringController(JdbcTemplate jdbc, TailoringEditService service, ProjectScopeService scope) {
        this.jdbc = jdbc;
        this.service = service;
        this.scope = scope;
    }

    @GetMapping("/api/projects/{id}/tailoring")
    public Map<String, Object> state(@PathVariable("id") long rawId, HttpServletRequest req) {
        long projectId = ReadSupport.parseId(rawId);
        ReadSupport.requireProject(jdbc, projectId);
        scope.assertCanView(AuthContext.of(req), projectId);
        return service.state(projectId);
    }

    @PostMapping("/api/projects/{id}/tailoring")
    public Map<String, Object> edit(@PathVariable("id") long rawId,
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        long projectId = ReadSupport.parseId(rawId);
        ReadSupport.requireProject(jdbc, projectId);
        scope.assertCanEditProject(AuthContext.of(req), projectId);
        return service.edit(projectId, body, CurrentActor.resolve(req));
    }
}
