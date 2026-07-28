package com.aetherpms.meeting;

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

/** 회의록 생성·수정(0011, 0039 §PATCH). */
@RestController
public class MeetingWriteController {
    private final WorkSurfaceService service;
    private final ProjectScopeService scope;
    public MeetingWriteController(WorkSurfaceService service, ProjectScopeService scope) {
        this.service = service; this.scope = scope;
    }

    @PostMapping("/api/meeting-minutes")
    public ResponseEntity<Map<String, Object>> create(
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        scope.assertItemCreateBody(AuthContext.of(req), body, "meeting-minutes");  // 0032 §5②
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(service.createMeeting(body, CurrentActor.resolve(req)));
    }

    @PatchMapping("/api/meeting-minutes/{id}")
    public Map<String, Object> update(@PathVariable long id,
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        scope.assertItemWrite(AuthContext.of(req), "meeting-minutes", id);
        return service.updateMeeting(id, body, CurrentActor.resolve(req));
    }
}
