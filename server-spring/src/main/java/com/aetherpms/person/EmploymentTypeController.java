package com.aetherpms.person;

import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.aetherpms.common.CurrentActor;

import jakarta.servlet.http.HttpServletRequest;

/**
 * 0044 — 인력구분 코드 마스터 API.
 * 공개 목록(/api/employment-types)은 폼·필터용 활성 코드만,
 * 관리자 경로(/api/admin/employment-types)는 RbacInterceptor가 SYS_ADMIN으로 가드한다.
 */
@RestController
public class EmploymentTypeController {

    private final EmploymentTypeService service;

    public EmploymentTypeController(EmploymentTypeService service) {
        this.service = service;
    }

    @GetMapping("/api/employment-types")
    public List<Map<String, Object>> listActive() {
        return service.listActive();
    }

    @GetMapping("/api/admin/employment-types")
    public List<Map<String, Object>> listAll() {
        return service.listAll();
    }

    @PostMapping("/api/admin/employment-types")
    public ResponseEntity<Map<String, Object>> create(
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(service.create(body, CurrentActor.resolve(req)));
    }

    @PatchMapping("/api/admin/employment-types/{code}")
    public Map<String, Object> update(@PathVariable String code,
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        return service.update(code, body, CurrentActor.resolve(req));
    }

    @DeleteMapping("/api/admin/employment-types/{code}")
    public Map<String, Object> delete(@PathVariable String code, HttpServletRequest req) {
        return service.delete(code, CurrentActor.resolve(req));
    }
}
