package com.aetherpms.officialdoc;

import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import com.aetherpms.common.ReadMappers;
import com.aetherpms.common.ReadSupport;

/** officialdoc 읽기(구 ReadController 분리). */
@RestController
public class OfficialDocReadController {

    private final JdbcTemplate jdbc;
    private final OfficialDocReadRepository repo;

    public OfficialDocReadController(JdbcTemplate jdbc, OfficialDocReadRepository repo) {
        this.jdbc = jdbc;
        this.repo = repo;
    }

    @GetMapping("/api/projects/{id}/official-docs")
    public List<Map<String, Object>> list(@PathVariable("id") long rawId) {
        long id = ReadSupport.parseId(rawId);
        ReadSupport.requireProject(jdbc, id);
        return repo.findByProjectIdOrderByDocIdAsc(id).stream().map(ReadMappers::mapOfficialDoc).toList();
    }

    @org.springframework.web.bind.annotation.GetMapping("/api/official-docs")
    public List<Map<String, Object>> all() {
        return repo.findAllByOrderByDocIdDesc().stream().map(ReadMappers::mapOfficialDoc).toList();
    }
}
