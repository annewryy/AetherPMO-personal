package com.aetherpms.catalog;

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

/** 카탈로그 노드 관리 API(0009 모듈2). */
@RestController
public class CatalogAdminController {

    private final CatalogAdminService service;
    private final CatalogCopyService copyService;

    public CatalogAdminController(CatalogAdminService service, CatalogCopyService copyService) {
        this.service = service;
        this.copyService = copyService;
    }

    /** 0044 §E — 선택 복사로 새 고객사 분류 생성. /api/admin/* 경로라 SYS_ADMIN 가드. */
    @PostMapping("/api/admin/catalog/copy")
    public ResponseEntity<Map<String, Object>> copy(
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(copyService.copy(body, CurrentActor.resolve(req)));
    }

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
}
