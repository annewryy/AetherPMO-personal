package com.aetherpms.meeting;

import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import com.aetherpms.auth.AuthContext;
import com.aetherpms.auth.ProjectScopeService;
import com.aetherpms.common.ApiException;
import com.aetherpms.common.LinkTableSupport;
import com.aetherpms.common.ReadMappers;
import com.aetherpms.common.ReadSupport;

import jakarta.servlet.http.HttpServletRequest;

/** meeting 읽기(구 ReadController 분리). 0039 — 링크(issueIds/taskIds/deliverableIds) 부착 + 참여 스코프. */
@RestController
public class MeetingReadController {

    private final JdbcTemplate jdbc;
    private final MeetingReadRepository repo;
    private final ProjectScopeService scope;

    public MeetingReadController(JdbcTemplate jdbc, MeetingReadRepository repo, ProjectScopeService scope) {
        this.jdbc = jdbc;
        this.repo = repo;
        this.scope = scope;
    }

    @GetMapping("/api/projects/{id}/meeting-minutes")
    public List<Map<String, Object>> list(@PathVariable("id") long rawId, HttpServletRequest req) {
        long id = ReadSupport.parseId(rawId);
        ReadSupport.requireProject(jdbc, id);
        scope.assertCanView(AuthContext.of(req), id);
        List<Map<String, Object>> rows = repo.findByProjectIdOrderByMeetingIdAsc(id).stream()
                .map(ReadMappers::mapMeeting).toList();
        attachLinks(rows);
        return rows;
    }

    @GetMapping("/api/meeting-minutes/{id}")
    public Map<String, Object> detail(@PathVariable("id") long rawId, HttpServletRequest req) {
        long id = ReadSupport.parseId(rawId);
        Map<String, Object> found = repo.findById(id).map(ReadMappers::mapMeeting)
                .orElseThrow(() -> ApiException.notFound("회의록을 찾을 수 없습니다."));
        long projectId = ((Number) found.get("projectId")).longValue();
        scope.assertCanView(AuthContext.of(req), projectId);
        attachLinks(List.of(found));
        found.put("actionItemIds", jdbc.query(
                "SELECT action_id FROM pms_action_item WHERE source_meeting_id = ? ORDER BY action_id",
                (rs, i) -> rs.getLong(1), id));
        return found;
    }

    @GetMapping("/api/meeting-minutes")
    public List<Map<String, Object>> all(HttpServletRequest req) {
        List<Map<String, Object>> all = repo.findAllByOrderByMeetingIdDesc().stream()
                .map(ReadMappers::mapMeeting).toList();
        AuthContext ctx = AuthContext.of(req);
        Set<Long> visible = scope.visibleProjectIdsOrNull(ctx);
        List<Map<String, Object>> out = visible == null ? all
                : all.stream().filter(m -> visible.contains(((Number) m.get("projectId")).longValue())).toList();
        attachLinks(out);
        return out;
    }

    private void attachLinks(List<Map<String, Object>> rows) {
        LinkTableSupport.attach(jdbc, rows, "id", "pms_meeting_issue_link", "meeting_id", "issue_id", "issueIds");
        LinkTableSupport.attach(jdbc, rows, "id", "pms_meeting_task_link", "meeting_id", "task_id", "taskIds");
        LinkTableSupport.attach(jdbc, rows, "id", "pms_meeting_deliverable_link", "meeting_id",
                "deliverable_id", "deliverableIds");
    }
}
