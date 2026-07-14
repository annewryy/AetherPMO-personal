package com.aetherpms.meeting;

import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import com.aetherpms.common.ReadMappers;
import com.aetherpms.common.ReadSupport;

/** meeting 읽기(구 ReadController 분리). */
@RestController
public class MeetingReadController {

    private final JdbcTemplate jdbc;
    private final MeetingReadRepository repo;

    public MeetingReadController(JdbcTemplate jdbc, MeetingReadRepository repo) {
        this.jdbc = jdbc;
        this.repo = repo;
    }

    @GetMapping("/api/projects/{id}/meeting-minutes")
    public List<Map<String, Object>> list(@PathVariable("id") long rawId) {
        long id = ReadSupport.parseId(rawId);
        ReadSupport.requireProject(jdbc, id);
        return repo.findByProjectIdOrderByMeetingIdAsc(id).stream().map(ReadMappers::mapMeeting).toList();
    }

    @org.springframework.web.bind.annotation.GetMapping("/api/meeting-minutes")
    public List<Map<String, Object>> all() {
        return repo.findAllByOrderByMeetingIdDesc().stream().map(ReadMappers::mapMeeting).toList();
    }
}
