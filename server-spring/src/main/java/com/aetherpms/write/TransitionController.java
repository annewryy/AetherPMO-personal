package com.aetherpms.write;

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

    public TransitionController(TransitionService service) {
        this.service = service;
    }

    @GetMapping("/api/{entity}/{id}/transitions")
    public List<Map<String, Object>> list(@PathVariable String entity, @PathVariable long id,
            HttpServletRequest req) {
        return service.list(entity, id, CurrentActor.resolve(req));
    }

    @PostMapping("/api/{entity}/{id}/transition")
    public Map<String, Object> execute(@PathVariable String entity, @PathVariable long id,
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        return service.execute(entity, id, body, CurrentActor.resolve(req));
    }
}
