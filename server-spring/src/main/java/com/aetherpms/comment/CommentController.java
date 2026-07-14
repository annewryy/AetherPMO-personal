package com.aetherpms.comment;

import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.aetherpms.common.CurrentActor;

import jakarta.servlet.http.HttpServletRequest;

/**
 * 범용 코멘트 — Node comments-routes.ts 이식.
 */
@RestController
public class CommentController {

    private final CommentService service;

    public CommentController(CommentService service) {
        this.service = service;
    }

    @GetMapping("/api/{entity}/{id}/comments")
    public List<Map<String, Object>> list(@PathVariable String entity, @PathVariable long id) {
        return service.list(entity, id);
    }

    @PostMapping("/api/{entity}/{id}/comments")
    public ResponseEntity<Map<String, Object>> create(@PathVariable String entity, @PathVariable long id,
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        Map<String, Object> result = service.create(entity, id, body, CurrentActor.resolve(req));
        return ResponseEntity.status(HttpStatus.CREATED).body(result);
    }
}
