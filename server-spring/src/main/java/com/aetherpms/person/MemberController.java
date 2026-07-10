package com.aetherpms.person;

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
 * 참여인력 저장 (설계 0005 §D) — 저장 시 person find-or-insert + member.person_id 연결.
 * (GET /api/projects/{id}/members 는 배치1 ReadController에 이미 존재 — 여기선 쓰기만.)
 */
@RestController
public class MemberController {

    private final MemberService service;

    public MemberController(MemberService service) {
        this.service = service;
    }

    @PostMapping("/api/projects/{id}/members")
    public ResponseEntity<Map<String, Object>> createMember(@PathVariable("id") long projectId,
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        Map<String, Object> result = service.createMember(projectId, body, CurrentActor.resolve(req));
        return ResponseEntity.status(HttpStatus.CREATED).body(result);
    }

    @PatchMapping("/api/projects/{id}/members/{memberId}")
    public Map<String, Object> updateMember(@PathVariable("id") long projectId,
            @PathVariable("memberId") long memberId,
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        return service.updateMember(projectId, memberId, body, CurrentActor.resolve(req));
    }

    @DeleteMapping("/api/projects/{id}/members/{memberId}")
    public ResponseEntity<Void> deleteMember(@PathVariable("id") long projectId,
            @PathVariable("memberId") long memberId, HttpServletRequest req) {
        service.deleteMember(projectId, memberId, CurrentActor.resolve(req));
        return ResponseEntity.noContent().build();
    }
}
