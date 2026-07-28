package com.aetherpms.person;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 인력관리 조회 엔드포인트 (설계 0014).
 *   GET /api/persons                 — 목록(서버측 필터)
 *   GET /api/persons/{id}            — 기본 정보
 *   GET /api/persons/{id}/projects   — 참여 이력(시간순)
 * 응답은 camelCase 도메인 DTO(0003). 오류는 GlobalExceptionHandler가 {"message"}로.
 */
@RestController
public class PersonController {

    private final PersonService service;

    public PersonController(PersonService service) {
        this.service = service;
    }

    @GetMapping("/api/persons")
    public List<Map<String, Object>> list(
            @RequestParam(name = "employmentTypes", required = false) String employmentTypes,
            @RequestParam(name = "match", required = false) String match,
            @RequestParam(name = "name", required = false) String name,
            @RequestParam(name = "company", required = false) String company,
            @RequestParam(name = "projectId", required = false) Long projectId,
            @RequestParam(name = "location", required = false) String location,
            @RequestParam(name = "customer", required = false) String customer,
            @RequestParam(name = "departments", required = false) String departments,
            @RequestParam(name = "includeInactive", required = false) String includeInactive) {
        PersonQuery q = new PersonQuery(
                splitTypes(employmentTypes), match, name, company, projectId, location, customer,
                departments == null || departments.isBlank() ? null
                        : java.util.Arrays.stream(departments.split(",")).map(String::trim)
                              .filter(d -> !d.isEmpty()).toList(),
                "true".equalsIgnoreCase(includeInactive));
        return service.list(q);
    }

    @GetMapping("/api/persons/{id}")
    public Map<String, Object> detail(@PathVariable("id") long id) {
        return service.detail(id);
    }

    @GetMapping("/api/persons/{id}/projects")
    public List<Map<String, Object>> projects(@PathVariable("id") long id) {
        return service.projectHistory(id);
    }

    /** "regular,turnkey" → [regular, turnkey]. 빈 토큰 제거. */
    private static List<String> splitTypes(String raw) {
        if (raw == null || raw.trim().isEmpty()) return List.of();
        List<String> out = new ArrayList<>();
        for (String t : raw.split(",")) {
            String v = t.trim();
            if (!v.isEmpty()) out.add(v);
        }
        return out;
    }
}
