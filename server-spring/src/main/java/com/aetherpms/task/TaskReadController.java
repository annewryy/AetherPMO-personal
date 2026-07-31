package com.aetherpms.task;

import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import com.aetherpms.common.ApiException;
import com.aetherpms.common.LinkEntity;
import com.aetherpms.common.LinkTableSupport;
import com.aetherpms.common.ReadMappers;
import com.aetherpms.common.ReadSupport;

/**
 * task 읽기(구 ReadController 분리).
 * 0039 — progress는 TaskProgressResolver로 덮어써 WBS/간트차트와 동일 수치를 보장한다
 *   (수동 progress_rate 우선 — 산출물 전이 시 리셋 — 없으면 산출물 상태 가중치 평균). 관련항목(이슈·액션아이템·회의록)은
 *   전부 역방향 링크(이 태스크를 참조하는 쪽)로 부착한다.
 */
@RestController
public class TaskReadController {

    private final JdbcTemplate jdbc;
    private final TaskReadRepository repo;
    private final TaskProgressResolver progressResolver;

    public TaskReadController(JdbcTemplate jdbc, TaskReadRepository repo, TaskProgressResolver progressResolver) {
        this.jdbc = jdbc;
        this.repo = repo;
        this.progressResolver = progressResolver;
    }

    @GetMapping("/api/projects/{id}/tasks")
    public List<Map<String, Object>> list(@PathVariable("id") long rawId) {
        long id = ReadSupport.parseId(rawId);
        ReadSupport.requireProject(jdbc, id);
        List<Map<String, Object>> rows = repo.findByProjectIdOrderBySortOrderAscTaskIdAsc(id).stream()
                .map(ReadMappers::mapTask).toList();
        applyEffectiveProgress(rows, id);
        attachLinks(rows);
        return rows;
    }

    @GetMapping("/api/tasks/{id}")
    public Map<String, Object> detail(@PathVariable("id") long rawId) {
        long id = ReadSupport.parseId(rawId);
        Map<String, Object> found = repo.findById(id).map(ReadMappers::mapTask)
                .orElseThrow(() -> ApiException.notFound("태스크를 찾을 수 없습니다."));
        long projectId = ((Number) found.get("projectId")).longValue();
        applyEffectiveProgress(List.of(found), projectId);
        attachLinks(List.of(found));
        return found;
    }

    private void applyEffectiveProgress(List<Map<String, Object>> rows, long projectId) {
        Map<Long, Integer> effective = progressResolver.effectiveProgressByProject(projectId);
        for (Map<String, Object> row : rows) {
            Integer eff = effective.get(((Number) row.get("id")).longValue());
            if (eff != null) row.put("progress", eff);
        }
    }

    /** 0040 — 이웃 타입 3종(issueIds/meetingIds/actionItemIds)을 쿼리 1회로 부착. */
    private void attachLinks(List<Map<String, Object>> rows) {
        LinkTableSupport.attachAll(jdbc, rows, "id", LinkEntity.TASK,
                List.of(LinkEntity.ISSUE, LinkEntity.MEETING, LinkEntity.ACTION_ITEM));
    }
}
