package com.aetherpms.issue;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * POST /api/issues — 이슈/리스크 신규 등록 (Node work-surface.ts A-3 이식).
 * 응답 201 · mapIssue camelCase. 오류는 GlobalExceptionHandler가 {"message"} 로.
 */
@RestController
public class IssueController {

    private final IssueService service;

    public IssueController(IssueService service) {
        this.service = service;
    }

    @PostMapping("/api/issues")
    public ResponseEntity<Map<String, Object>> create(@RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> result = service.createIssue(body == null ? Map.of() : body);
        return ResponseEntity.status(HttpStatus.CREATED).body(result);
    }
}
