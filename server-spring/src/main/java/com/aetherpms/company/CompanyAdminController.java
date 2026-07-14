package com.aetherpms.company;

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

/** 회사(기준정보) 관리 API(0009 모듈4). */
@RestController
public class CompanyAdminController {

    private final CompanyAdminService service;

    public CompanyAdminController(CompanyAdminService service) {
        this.service = service;
    }

    @PostMapping("/api/companies")
    public ResponseEntity<Map<String, Object>> createCompany(
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(service.createCompany(body, CurrentActor.resolve(req)));
    }

    @PatchMapping("/api/companies/{id}")
    public Map<String, Object> updateCompany(@PathVariable long id,
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        return service.updateCompany(id, body, CurrentActor.resolve(req));
    }

    @DeleteMapping("/api/companies/{id}")
    public Map<String, Object> deleteCompany(@PathVariable long id, HttpServletRequest req) {
        return service.deleteCompany(id, CurrentActor.resolve(req));
    }
}
