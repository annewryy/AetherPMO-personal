package com.aetherpms.person;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import com.aetherpms.common.ReadMappers;
import com.aetherpms.common.ReadSupport;

/** person 읽기(구 ReadController 분리). */
@RestController
public class MemberReadController {

    private final JdbcTemplate jdbc;
    private final ProjectMemberReadRepository repo;

    public MemberReadController(JdbcTemplate jdbc, ProjectMemberReadRepository repo) {
        this.jdbc = jdbc;
        this.repo = repo;
    }

    @GetMapping("/api/projects/{id}/members")
    public List<Map<String, Object>> list(@PathVariable("id") long rawId) {
        long id = ReadSupport.parseId(rawId);
        ReadSupport.requireProject(jdbc, id);
        return repo.findByProjectIdAndIsActiveTrueOrderByIsProjectManagerDescMemberIdAsc(id).stream().map(ReadMappers::mapProjectMember).toList();
    }

    /** 전역 멤버 목록 — 현재 사용자 선택기(X-User-Id 후보)용. 프론트 ProjectMember shape. */
    @GetMapping("/api/members")
    public List<Map<String, Object>> all() {
        return repo.findAll().stream().map(m -> {
            Map<String, Object> o = new LinkedHashMap<>();
            o.put("id", m.getMemberId());
            o.put("projectId", m.getProjectId());
            o.put("userId", m.getUserUid());
            o.put("name", m.getName());
            o.put("roleName", m.getRoleName());
            o.put("position", m.getPosition());
            o.put("memo", null);
            return o;
        }).toList();
    }
}
