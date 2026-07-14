package com.aetherpms.issue;

import java.util.Map;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.aetherpms.common.CurrentActor;
import com.aetherpms.common.WorkSurfaceService;
import jakarta.servlet.http.HttpServletRequest;

/** 이슈 필드 수정 + 리스크→이슈 전환(0011/0008). 생성은 IssueController. */
@RestController
public class IssueWriteController {
    private final WorkSurfaceService service;
    public IssueWriteController(WorkSurfaceService service) { this.service = service; }

    @PatchMapping("/api/issues/{id}")
    public Map<String, Object> patchIssue(@PathVariable long id,
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        return service.patch("issues", id, body, CurrentActor.resolve(req));
    }

    @PostMapping("/api/issues/{id}/convert-to-issue")
    public Map<String, Object> convertToIssue(@PathVariable long id,
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        return service.convertToIssue(id, body, CurrentActor.resolve(req));
    }
}
