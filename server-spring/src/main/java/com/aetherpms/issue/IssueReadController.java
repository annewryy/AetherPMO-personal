package com.aetherpms.issue;

import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import com.aetherpms.common.ApiException;
import com.aetherpms.common.ReadSupport;

/** 이슈 읽기(구 ReadController 분리). 생성/수정은 IssueController·IssueWriteController. */
@RestController
public class IssueReadController {

    private final JdbcTemplate jdbc;
    private final IssueRepository repo;

    public IssueReadController(JdbcTemplate jdbc, IssueRepository repo) {
        this.jdbc = jdbc;
        this.repo = repo;
    }

    @GetMapping("/api/projects/{id}/issues")
    public List<Map<String, Object>> list(@PathVariable("id") long rawId) {
        long id = ReadSupport.parseId(rawId);
        ReadSupport.requireProject(jdbc, id);
        return repo.findByProjectIdOrderByIssueIdAsc(id).stream().map(IssueMapper::mapIssue).toList();
    }

    @GetMapping("/api/issues/{id}")
    public Map<String, Object> detail(@PathVariable("id") long rawId) {
        long id = ReadSupport.parseId(rawId);
        return repo.findById(id).map(IssueMapper::mapIssue)
                .orElseThrow(() -> ApiException.notFound("이슈를 찾을 수 없습니다."));
    }

    @org.springframework.web.bind.annotation.GetMapping("/api/issues")
    public List<Map<String, Object>> all() {
        return repo.findAllByOrderByIssueIdDesc().stream().map(IssueMapper::mapIssue).toList();
    }
}
