package com.aetherpms.insourcing;

import com.aetherpms.common.CurrentActor;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 자사화 전환 API(0019).
 *   POST  /api/insourcing-transitions            전환 요청(인력관리 버튼)
 *   GET   /api/insourcing-transitions             전환 현황 목록(전용 전환관리)
 *   GET   /api/persons/{id}/insourcing-transition 인력의 진행중 전환(상세 패널 버튼 상태)
 *   PATCH /api/insourcing-transitions/{id}        상태 전이(공문발신/승인/반려/취소)
 */
@RestController
public class InsourcingController {

    private final InsourcingService service;

    public InsourcingController(InsourcingService service) {
        this.service = service;
    }

    @PostMapping("/api/insourcing-transitions")
    public ResponseEntity<Map<String, Object>> request(
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        Map<String, Object> b = body == null ? Map.of() : body;
        long personId = asLong(b.get("personId"));
        String reason = b.get("reason") == null ? null : String.valueOf(b.get("reason"));
        Map<String, Object> created = service.request(personId, reason, CurrentActor.resolve(req));
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @GetMapping("/api/insourcing-transitions")
    public List<Map<String, Object>> list(
            @RequestParam(name = "status", required = false) String status,
            @RequestParam(name = "personId", required = false) Long personId) {
        return service.list(status, personId);
    }

    @GetMapping("/api/persons/{id}/insourcing-transition")
    public ResponseEntity<Map<String, Object>> openForPerson(@PathVariable("id") long id) {
        Map<String, Object> open = service.openForPerson(id);
        // 진행중 전환이 없으면 204(빈 본문) — 프론트는 null 처리.
        return open == null ? ResponseEntity.noContent().build() : ResponseEntity.ok(open);
    }

    @PatchMapping("/api/insourcing-transitions/{id}")
    public Map<String, Object> act(@PathVariable("id") long id,
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        Map<String, Object> b = body == null ? Map.of() : body;
        String action = b.get("action") == null ? null : String.valueOf(b.get("action"));
        String note = b.get("note") == null ? null : String.valueOf(b.get("note"));
        return service.act(id, action, note, CurrentActor.resolve(req));
    }

    private static long asLong(Object v) {
        if (v instanceof Number n) return n.longValue();
        if (v instanceof String s && s.matches("-?\\d+")) return Long.parseLong(s);
        return 0L;
    }
}
