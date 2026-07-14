package com.aetherpms.engine;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.aetherpms.common.CurrentActor;

import jakarta.servlet.http.HttpServletRequest;

/**
 * 0009 모듈3 워크플로 편집기 라우트 — Node workflows-admin.ts 이식.
 * (GET /api/workflows 은 배치1 ReadController에 이미 존재)
 */
@RestController
public class WorkflowAdminController {

    private final WorkflowAdminService service;

    public WorkflowAdminController(WorkflowAdminService service) {
        this.service = service;
    }

    // ---- 워크플로 ----
    @PostMapping("/api/workflows")
    public ResponseEntity<Map<String, Object>> createWorkflow(
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(service.createWorkflow(body, CurrentActor.resolve(req)));
    }

    @PatchMapping("/api/workflows/{id}")
    public Map<String, Object> updateWorkflow(@PathVariable long id,
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        return service.updateWorkflow(id, body, CurrentActor.resolve(req));
    }

    @DeleteMapping("/api/workflows/{id}")
    public Map<String, Object> deleteWorkflow(@PathVariable long id, HttpServletRequest req) {
        return service.deleteWorkflow(id, CurrentActor.resolve(req));
    }

    // ---- 상태 ----
    @PostMapping("/api/workflows/{id}/statuses")
    public ResponseEntity<Map<String, Object>> createStatus(@PathVariable long id,
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(service.createStatus(id, body, CurrentActor.resolve(req)));
    }

    @PatchMapping("/api/workflows/{id}/statuses/{statusId}")
    public Map<String, Object> updateStatus(@PathVariable long id, @PathVariable long statusId,
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        return service.updateStatus(id, statusId, body, CurrentActor.resolve(req));
    }

    @DeleteMapping("/api/workflows/{id}/statuses/{statusId}")
    public Map<String, Object> deleteStatus(@PathVariable long id, @PathVariable long statusId, HttpServletRequest req) {
        return service.deleteStatus(id, statusId, CurrentActor.resolve(req));
    }

    // ---- 전이 ----
    @PostMapping("/api/workflows/{id}/transitions")
    public ResponseEntity<Map<String, Object>> createTransition(@PathVariable long id,
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(service.createTransition(id, body, CurrentActor.resolve(req)));
    }

    @DeleteMapping("/api/workflows/{id}/transitions/{transitionId}")
    public Map<String, Object> deleteTransition(@PathVariable long id, @PathVariable long transitionId, HttpServletRequest req) {
        return service.deleteTransition(id, transitionId, CurrentActor.resolve(req));
    }

    // ---- 조건 ----
    @PostMapping("/api/transitions/{id}/conditions")
    public ResponseEntity<Map<String, Object>> createCondition(@PathVariable long id,
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(service.createCondition(id, body, CurrentActor.resolve(req)));
    }

    @PatchMapping("/api/transitions/{id}/conditions/{conditionId}")
    public Map<String, Object> updateCondition(@PathVariable long id, @PathVariable long conditionId,
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        return service.updateCondition(id, conditionId, body, CurrentActor.resolve(req));
    }

    @DeleteMapping("/api/transitions/{id}/conditions/{conditionId}")
    public Map<String, Object> deleteCondition(@PathVariable long id, @PathVariable long conditionId, HttpServletRequest req) {
        return service.deleteCondition(id, conditionId, CurrentActor.resolve(req));
    }
}
