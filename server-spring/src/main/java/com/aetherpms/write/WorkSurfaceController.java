package com.aetherpms.write;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.aetherpms.common.CurrentActor;

import jakarta.servlet.http.HttpServletRequest;

/**
 * 0011 작업 화면 쓰기 라우트 — Node work-surface.ts 이식.
 */
@RestController
public class WorkSurfaceController {

    private final WorkSurfaceService service;

    public WorkSurfaceController(WorkSurfaceService service) {
        this.service = service;
    }

    @PatchMapping("/api/tasks/{id}")
    public Map<String, Object> patchTask(@PathVariable long id,
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        return service.patch("tasks", id, body, CurrentActor.resolve(req));
    }

    @PatchMapping("/api/issues/{id}")
    public Map<String, Object> patchIssue(@PathVariable long id,
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        return service.patch("issues", id, body, CurrentActor.resolve(req));
    }

    @PatchMapping("/api/action-items/{id}")
    public Map<String, Object> patchActionItem(@PathVariable long id,
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        return service.patch("action-items", id, body, CurrentActor.resolve(req));
    }

    @PostMapping("/api/issues/{id}/convert-to-issue")
    public Map<String, Object> convertToIssue(@PathVariable long id,
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        return service.convertToIssue(id, body, CurrentActor.resolve(req));
    }

    @PostMapping("/api/action-items")
    public ResponseEntity<Map<String, Object>> createActionItem(
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        Map<String, Object> result = service.createActionItem(body, CurrentActor.resolve(req));
        return ResponseEntity.status(HttpStatus.CREATED).body(result);
    }

    @PostMapping("/api/meeting-minutes")
    public ResponseEntity<Map<String, Object>> createMeeting(
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        Map<String, Object> result = service.createMeeting(body, CurrentActor.resolve(req));
        return ResponseEntity.status(HttpStatus.CREATED).body(result);
    }
}
