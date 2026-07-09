package com.aetherpms.progress;

import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import com.aetherpms.common.ApiException;

/**
 * GET /api/projects/{id}/progress — 진척 롤업 (Node routes/progress.ts 이식).
 */
@RestController
public class ProgressController {

    private final ProgressService service;

    public ProgressController(ProgressService service) {
        this.service = service;
    }

    @GetMapping("/api/projects/{id}/progress")
    public Map<String, Object> progress(@PathVariable("id") long id) {
        if (id <= 0) {
            throw ApiException.badRequest("유효하지 않은 id 입니다.");
        }
        return service.getProjectProgress(id);
    }
}
