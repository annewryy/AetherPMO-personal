package com.aetherpms.meeting;

import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.aetherpms.common.CurrentActor;
import com.aetherpms.common.WorkSurfaceService;
import jakarta.servlet.http.HttpServletRequest;

/** 회의록 생성(0011). */
@RestController
public class MeetingWriteController {
    private final WorkSurfaceService service;
    public MeetingWriteController(WorkSurfaceService service) { this.service = service; }

    @PostMapping("/api/meeting-minutes")
    public ResponseEntity<Map<String, Object>> create(
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(service.createMeeting(body, CurrentActor.resolve(req)));
    }
}
