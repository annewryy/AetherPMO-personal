package com.aetherpms.engine;

import com.aetherpms.auth.ProjectScopeService;
import com.aetherpms.auth.AuthContext;
import java.util.List;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.aetherpms.common.CurrentActor;

import jakarta.servlet.http.HttpServletRequest;

/**
 * 워크플로 전이 — Node routes/transitions.ts 이식.
 * GET  /api/{entity}/{id}/transitions — 가용 전이(+조건 평가)
 * POST /api/{entity}/{id}/transition  — 전이 실행
 */
@RestController
public class TransitionController {

    private final TransitionService service;
    private final ProjectScopeService scope;

    public TransitionController(TransitionService service, ProjectScopeService scope) {
        this.service = service;
        this.scope = scope;
    }

    @GetMapping("/api/{entity}/{id}/transitions")
    public List<Map<String, Object>> list(@PathVariable String entity, @PathVariable long id,
            HttpServletRequest req) {
        return service.list(entity, id, CurrentActor.resolve(req));
    }

    @PostMapping("/api/{entity}/{id}/transition")
    public Map<String, Object> execute(@PathVariable String entity, @PathVariable long id,
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        // 0032 §5② — 상태 전이도 쓰기: projects는 프로젝트 수정 권한, 그 외는 항목 쓰기 가드
        if ("projects".equals(entity)) scope.assertCanEditProject(AuthContext.of(req), id);
        else scope.assertItemWrite(AuthContext.of(req), entity, id);
        return service.execute(entity, id, body, CurrentActor.resolve(req));
    }
}
