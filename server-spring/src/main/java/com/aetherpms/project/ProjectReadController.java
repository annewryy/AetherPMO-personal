package com.aetherpms.project;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import com.aetherpms.common.ApiException;
import com.aetherpms.common.ReadMappers;
import com.aetherpms.common.ReadSupport;

/** 프로젝트 상세 + VRB 읽기(구 ReadController 분리). */
@RestController
public class ProjectReadController {

    private final JdbcTemplate jdbc;
    private final ProjectRepository projectRepository;
    private final ProjectCompanyRepository companyRepository;
    private final VrbInfoReadRepository vrbRepository;

    public ProjectReadController(JdbcTemplate jdbc, ProjectRepository projectRepository,
            ProjectCompanyRepository companyRepository, VrbInfoReadRepository vrbRepository) {
        this.jdbc = jdbc;
        this.projectRepository = projectRepository;
        this.companyRepository = companyRepository;
        this.vrbRepository = vrbRepository;
    }

    @GetMapping("/api/projects/{id}")
    public Map<String, Object> projectDetail(@PathVariable("id") long rawId) {
        long id = ReadSupport.parseId(rawId);
        ProjectEntity entity = projectRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("프로젝트를 찾을 수 없습니다."));

        Map<String, Object> project = ProjectMapper.mapProject(entity);
        List<Map<String, Object>> members = new ArrayList<>();
        for (ProjectCompanyEntity c : companyRepository.findAllByOrderByProjectCompanyIdAsc()) {
            if (id == c.getProjectId() && !"고객사".equals(c.getRole())) {
                members.add(ProjectMapper.mapConsortium(c));
            }
        }
        project.put("consortiumMembers", members);
        project.put("vrbInfo", vrbRepository.findById(id).map(ReadMappers::mapVrbInfo).orElse(null));

        Map<String, Object> counts = new LinkedHashMap<>();
        counts.put("issues", count("pms_issue", id));
        counts.put("actionItems", count("pms_action_item", id));
        counts.put("deliverables", count("pms_deliverable", id));
        counts.put("meetingMinutes", count("pms_meeting_minutes", id));
        project.put("counts", counts);
        return project;
    }

    @GetMapping("/api/projects/{id}/vrb")
    public Map<String, Object> vrb(@PathVariable("id") long rawId) {
        long id = ReadSupport.parseId(rawId);
        ReadSupport.requireProject(jdbc, id);
        return vrbRepository.findById(id).map(ReadMappers::mapVrbInfo).orElse(null);
    }

    private int count(String table, long projectId) {
        Integer c = jdbc.queryForObject(
                "SELECT COUNT(*) FROM " + table + " WHERE project_id = ?", Integer.class, projectId);
        return c == null ? 0 : c;
    }
}
