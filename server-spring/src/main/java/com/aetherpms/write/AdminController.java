package com.aetherpms.write;

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
 * 0009 관리자 쓰기 — 카탈로그 노드·회사 CRUD. Node routes/admin.ts 이식.
 * (GET /api/companies·/api/catalog/tree 은 배치1 ReadController에 이미 존재)
 */
@RestController
public class AdminController {

    private final AdminService service;

    public AdminController(AdminService service) {
        this.service = service;
    }

    // ---- 카탈로그 노드 ----
    @PostMapping("/api/catalog/nodes")
    public ResponseEntity<Map<String, Object>> createNode(
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(service.createNode(body, CurrentActor.resolve(req)));
    }

    @PatchMapping("/api/catalog/nodes/{id}")
    public Map<String, Object> updateNode(@PathVariable long id,
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        return service.updateNode(id, body, CurrentActor.resolve(req));
    }

    @DeleteMapping("/api/catalog/nodes/{id}")
    public Map<String, Object> deleteNode(@PathVariable long id, HttpServletRequest req) {
        return service.deleteNode(id, CurrentActor.resolve(req));
    }

    // ---- 회사 ----
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
