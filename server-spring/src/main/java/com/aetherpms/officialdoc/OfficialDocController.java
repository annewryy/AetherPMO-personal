package com.aetherpms.officialdoc;

import com.aetherpms.auth.ProjectScopeService;
import com.aetherpms.auth.AuthContext;
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
 * 공문(official-doc) 쓰기 — 배치17 / 0017 §Phase2.
 *   POST   /api/official-docs          등록 (201)
 *   PATCH  /api/official-docs/{id}      부분수정
 *   DELETE /api/official-docs/{id}      삭제
 * (읽기 GET /api/projects/{id}/official-docs 는 배치1 ReadController.)
 */
@RestController
public class OfficialDocController {

    private final OfficialDocService service;

    private final ProjectScopeService scope;

    public OfficialDocController(OfficialDocService service, ProjectScopeService scope) {
        this.service = service;
        this.scope = scope;
    }

    @PostMapping("/api/official-docs")
    public ResponseEntity<Map<String, Object>> create(
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        scope.assertItemCreateBody(AuthContext.of(req), body, "official-docs");  // 0032 §5②
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(service.create(body, CurrentActor.resolve(req)));
    }

    @PatchMapping("/api/official-docs/{id}")
    public Map<String, Object> update(@PathVariable("id") long id,
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        scope.assertItemWrite(AuthContext.of(req), "official-docs", id);  // 0032 §5②
        return service.update(id, body, CurrentActor.resolve(req));
    }

    @DeleteMapping("/api/official-docs/{id}")
    public Map<String, Object> delete(@PathVariable("id") long id, HttpServletRequest req) {
        scope.assertItemWrite(AuthContext.of(req), "official-docs", id);  // 0032 §5②
        return service.delete(id, CurrentActor.resolve(req));
    }
}
