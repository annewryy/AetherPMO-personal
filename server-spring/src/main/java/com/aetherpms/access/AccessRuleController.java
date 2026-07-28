package com.aetherpms.access;

import java.util.List;
import java.util.Map;

import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.aetherpms.common.ApiException;

/**
 * 0034 §4 — 관리자 콘솔 '접근 규칙'(③ 부서×직책×인력구분). SYS_ADMIN 전용
 * (RbacInterceptor가 /api/admin/* 조회·쓰기 전부 SYS_ADMIN으로 가드).
 */
@RestController
public class AccessRuleController {

    private final AccessRuleService service;
    private final ExecAutoRegisterService execAuto;

    public AccessRuleController(AccessRuleService service, ExecAutoRegisterService execAuto) {
        this.service = service;
        this.execAuto = execAuto;
    }

    /** 0034 §5 결정4(A) — 경영진 전 프로젝트 참여 등록 일괄 백필(모델 최초 적용 시 1회 실행). */
    @PostMapping("/api/admin/access-rules/sync-exec")
    public Map<String, Object> syncExec() {
        return execAuto.syncAllProjects();
    }

    @GetMapping("/api/admin/access-rules")
    public List<Map<String, Object>> list() {
        return service.list();
    }

    @GetMapping("/api/admin/access-rules/menu-keys")
    public Map<String, Object> menuKeys() {
        return Map.of("keys", MenuKeys.ALL, "labels", MenuKeys.labels(), "positionCodes", PositionCode.ALL);
    }

    @PostMapping("/api/admin/access-rules")
    public Map<String, Object> create(@RequestBody(required = false) Map<String, Object> body) {
        if (body == null) throw ApiException.badRequest("요청 본문이 없습니다.");
        return service.create(body);
    }

    @PatchMapping("/api/admin/access-rules/{id}")
    public Map<String, Object> update(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body) {
        if (body == null) throw ApiException.badRequest("요청 본문이 없습니다.");
        return service.update(id, body);
    }

    @DeleteMapping("/api/admin/access-rules/{id}")
    public Map<String, Object> delete(@PathVariable long id) {
        service.delete(id);
        return Map.of("ok", true);
    }

    /** §4 판정 시뮬레이터 — personId 하나로 매칭 규칙 + 유효 메뉴 미리보기. */
    @GetMapping("/api/admin/access-rules/simulate")
    public Map<String, Object> simulate(@RequestParam("personId") long personId) {
        return service.simulate(personId);
    }
}
