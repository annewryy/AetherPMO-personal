package com.aetherpms.actionitem;

import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import com.aetherpms.common.ApiException;
import com.aetherpms.common.ReadMappers;
import com.aetherpms.common.ReadSupport;

/** actionitem 읽기(구 ReadController 분리). */
@RestController
public class ActionItemReadController {

    private final JdbcTemplate jdbc;
    private final ActionItemReadRepository repo;

    public ActionItemReadController(JdbcTemplate jdbc, ActionItemReadRepository repo) {
        this.jdbc = jdbc;
        this.repo = repo;
    }

    @GetMapping("/api/projects/{id}/action-items")
    public List<Map<String, Object>> list(@PathVariable("id") long rawId) {
        long id = ReadSupport.parseId(rawId);
        ReadSupport.requireProject(jdbc, id);
        return repo.findByProjectIdOrderByActionIdAsc(id).stream().map(ReadMappers::mapActionItem).toList();
    }

    @GetMapping("/api/action-items/{id}")
    public Map<String, Object> detail(@PathVariable("id") long rawId) {
        long id = ReadSupport.parseId(rawId);
        return repo.findById(id).map(ReadMappers::mapActionItem)
                .orElseThrow(() -> ApiException.notFound("액션아이템을 찾을 수 없습니다."));
    }

    @org.springframework.web.bind.annotation.GetMapping("/api/action-items")
    public List<Map<String, Object>> all() {
        return repo.findAllByOrderByActionIdDesc().stream().map(ReadMappers::mapActionItem).toList();
    }
}
