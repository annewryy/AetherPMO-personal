package com.aetherpms.org;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 조직/회원 API(0020).
 *   GET  /api/org/departments               부서 트리(평탄)
 *   GET  /api/org/members?deptCode=&q=       회원 검색(참여인력 조직도 선택)
 *   POST /api/admin/org-sync                 아마란스 view → 미러 동기화(수동 배치 트리거)
 */
@RestController
public class OrgController {

    private final OrgService orgService;
    private final OrgSyncService syncService;

    public OrgController(OrgService orgService, OrgSyncService syncService) {
        this.orgService = orgService;
        this.syncService = syncService;
    }

    @GetMapping("/api/org/departments")
    public List<Map<String, Object>> departments() {
        return orgService.departments();
    }

    @GetMapping("/api/org/members")
    public List<Map<String, Object>> members(
            @RequestParam(name = "deptCode", required = false) String deptCode,
            @RequestParam(name = "q", required = false) String q,
            @RequestParam(name = "includeResigned", required = false, defaultValue = "false") boolean includeResigned) {
        return orgService.members(deptCode, q, includeResigned);
    }

    @GetMapping("/api/org/external-members")
    public List<Map<String, Object>> externalMembers(
            @RequestParam(name = "q", required = false) String q) {
        return orgService.externalMembers(q);
    }

    @PostMapping("/api/admin/org-sync")
    public Map<String, Object> sync() {
        return syncService.sync();
    }
}
