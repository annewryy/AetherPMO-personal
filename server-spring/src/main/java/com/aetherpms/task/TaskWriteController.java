package com.aetherpms.task;

import java.util.Map;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.aetherpms.common.CurrentActor;
import com.aetherpms.common.WorkSurfaceService;
import jakarta.servlet.http.HttpServletRequest;

/** 태스크 필드 수정(0011 A-1). 워크플로 전이 없는 진척/상태/담당자 등. */
@RestController
public class TaskWriteController {
    private final WorkSurfaceService service;
    public TaskWriteController(WorkSurfaceService service) { this.service = service; }

    @PatchMapping("/api/tasks/{id}")
    public Map<String, Object> patchTask(@PathVariable long id,
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        return service.patch("tasks", id, body, CurrentActor.resolve(req));
    }
}
