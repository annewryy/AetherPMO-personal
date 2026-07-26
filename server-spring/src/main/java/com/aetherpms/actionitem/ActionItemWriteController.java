package com.aetherpms.actionitem;

import com.aetherpms.auth.ProjectScopeService;
import com.aetherpms.auth.AuthContext;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.aetherpms.common.CurrentActor;
import com.aetherpms.common.WorkSurfaceService;
import jakarta.servlet.http.HttpServletRequest;

/** 액션아이템 생성·필드 수정(0011). */
@RestController
public class ActionItemWriteController {
    private final WorkSurfaceService service;
    private final ProjectScopeService scope;
    public ActionItemWriteController(WorkSurfaceService service, ProjectScopeService scope) {
        this.service = service; this.scope = scope;
    }

    @PatchMapping("/api/action-items/{id}")
    public Map<String, Object> patch(@PathVariable long id,
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        scope.assertItemWrite(AuthContext.of(req), "action-items", id);  // 0032 §5②
        return service.patch("action-items", id, body, CurrentActor.resolve(req));
    }

    @PostMapping("/api/action-items")
    public ResponseEntity<Map<String, Object>> create(
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        scope.assertItemCreateBody(AuthContext.of(req), body, "action-items");  // 0032 §5②
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(service.createActionItem(body, CurrentActor.resolve(req)));
    }
}
