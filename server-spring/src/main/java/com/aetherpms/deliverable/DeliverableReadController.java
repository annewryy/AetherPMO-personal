package com.aetherpms.deliverable;

import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import com.aetherpms.common.ApiException;
import com.aetherpms.common.ReadMappers;
import com.aetherpms.common.ReadSupport;

/** deliverable 읽기(구 ReadController 분리). */
@RestController
public class DeliverableReadController {

    private final JdbcTemplate jdbc;
    private final DeliverableReadRepository repo;

    public DeliverableReadController(JdbcTemplate jdbc, DeliverableReadRepository repo) {
        this.jdbc = jdbc;
        this.repo = repo;
    }

    @GetMapping("/api/projects/{id}/deliverables")
    public List<Map<String, Object>> list(@PathVariable("id") long rawId) {
        long id = ReadSupport.parseId(rawId);
        ReadSupport.requireProject(jdbc, id);
        return repo.findByProjectIdOrderByDeliverableIdAsc(id).stream().map(ReadMappers::mapArtifact).toList();
    }

    @GetMapping("/api/deliverables/{id}")
    public Map<String, Object> detail(@PathVariable("id") long rawId) {
        long id = ReadSupport.parseId(rawId);
        return repo.findById(id).map(ReadMappers::mapArtifact)
                .orElseThrow(() -> ApiException.notFound("산출물을 찾을 수 없습니다."));
    }

    @org.springframework.web.bind.annotation.GetMapping("/api/deliverables")
    public List<Map<String, Object>> all() {
        return repo.findAllByOrderByDeliverableIdDesc().stream().map(ReadMappers::mapArtifact).toList();
    }
}
