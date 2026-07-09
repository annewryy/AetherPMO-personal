package com.aetherpms.write;

import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.aetherpms.common.CurrentActor;

import jakarta.servlet.http.HttpServletRequest;

/**
 * 0007 §2.5 신호 규칙 관리 라우트 — Node signal-rules.ts 이식.
 */
@RestController
public class SignalRuleController {

    private final SignalRuleService service;

    public SignalRuleController(SignalRuleService service) {
        this.service = service;
    }

    @GetMapping("/api/signal-rules")
    public List<Map<String, Object>> list(
            @RequestParam(name = "project_id", required = false) String projectId) {
        return service.list(projectId);
    }

    @PostMapping("/api/signal-rules")
    public ResponseEntity<Map<String, Object>> create(
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(service.create(body, CurrentActor.resolve(req)));
    }

    @PatchMapping("/api/signal-rules/{id}")
    public Map<String, Object> update(@PathVariable long id,
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        return service.update(id, body, CurrentActor.resolve(req));
    }

    @DeleteMapping("/api/signal-rules/{id}")
    public Map<String, Object> delete(@PathVariable long id, HttpServletRequest req) {
        return service.delete(id, CurrentActor.resolve(req));
    }
}
