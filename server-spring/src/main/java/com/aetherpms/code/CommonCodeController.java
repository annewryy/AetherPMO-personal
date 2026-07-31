package com.aetherpms.code;

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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.aetherpms.common.CurrentActor;

import jakarta.servlet.http.HttpServletRequest;

/**
 * 0044 — 공통 코드 API.
 * 공개 목록(/api/codes?group=X)은 폼·필터용 활성 코드만,
 * 관리자 경로(/api/admin/codes/*)는 RbacInterceptor가 SYS_ADMIN으로 가드한다.
 * code가 한글/특수문자일 수 있어 CRUD 대상 코드는 경로가 아닌 쿼리 파라미터로 받는다.
 */
@RestController
public class CommonCodeController {

    private final CommonCodeService service;

    public CommonCodeController(CommonCodeService service) {
        this.service = service;
    }

    @GetMapping("/api/codes")
    public List<Map<String, Object>> listActive(@RequestParam String group) {
        return service.listActive(group);
    }

    @GetMapping("/api/admin/codes/groups")
    public List<Map<String, Object>> groups() {
        return service.groups();
    }

    @GetMapping("/api/admin/codes")
    public List<Map<String, Object>> listAll(@RequestParam String group) {
        return service.listAll(group);
    }

    @PostMapping("/api/admin/codes/{group}")
    public ResponseEntity<Map<String, Object>> create(@PathVariable String group,
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(service.create(group, body, CurrentActor.resolve(req)));
    }

    @PatchMapping("/api/admin/codes/{group}")
    public Map<String, Object> update(@PathVariable String group, @RequestParam String code,
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        return service.update(group, code, body, CurrentActor.resolve(req));
    }

    @DeleteMapping("/api/admin/codes/{group}")
    public Map<String, Object> delete(@PathVariable String group, @RequestParam String code,
            HttpServletRequest req) {
        return service.delete(group, code, CurrentActor.resolve(req));
    }
}
