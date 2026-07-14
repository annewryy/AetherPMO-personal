package com.aetherpms.activity;

import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import com.aetherpms.common.ReadMappers;
import com.aetherpms.common.ReadSupport;

/** activity 읽기(구 ReadController 분리). */
@RestController
public class ActivityReadController {

    private final JdbcTemplate jdbc;
    private final ActivityReadRepository repo;

    public ActivityReadController(JdbcTemplate jdbc, ActivityReadRepository repo) {
        this.jdbc = jdbc;
        this.repo = repo;
    }

    @GetMapping("/api/projects/{id}/activities")
    public List<Map<String, Object>> list(@PathVariable("id") long rawId) {
        long id = ReadSupport.parseId(rawId);
        ReadSupport.requireProject(jdbc, id);
        return repo.findByProjectIdOrderByAuditIdAsc(id).stream().map(ReadMappers::mapActivity).toList();
    }
}
