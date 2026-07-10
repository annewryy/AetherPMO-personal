package com.aetherpms.project;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.aetherpms.common.CurrentActor;

import jakarta.servlet.http.HttpServletRequest;

/**
 * GET  /api/projects — 목록 읽기 (Node reads.ts §0 이식).
 * POST /api/projects — 프로젝트 생성 (배치9 / 0017 §B P1, 발번 0001).
 * 응답: mapProject 형태 + 프로젝트별 컨소시엄(고객사 제외) 결합.
 *
 * 0015 §B: 선택적 서버측 필터 파라미터(location, status)를 추가.
 *   - 파라미터가 없으면 현행대로 전체 반환(하위호환).
 *   - 필터는 전부 DB WHERE(ProjectRepository.findFiltered) — 클라이언트 필터 금지.
 */
@RestController
public class ProjectController {

    /** 0015 §B location 필터 정규 4종(자유텍스트라 LIKE 매칭). */
    private static final Set<String> LOCATIONS = Set.of("서울", "대전", "대구", "광주");
    private static final String LOCATION_ETC = "기타";

    private final ProjectRepository projectRepository;
    private final ProjectCompanyRepository companyRepository;
    private final ProjectCreateService createService;
    private final ProjectUpdateService updateService;

    public ProjectController(ProjectRepository projectRepository,
                             ProjectCompanyRepository companyRepository,
                             ProjectCreateService createService,
                             ProjectUpdateService updateService) {
        this.projectRepository = projectRepository;
        this.companyRepository = companyRepository;
        this.createService = createService;
        this.updateService = updateService;
    }

    // ---- POST /api/projects — 프로젝트 생성 (0017 §B P1) ------------------
    @PostMapping("/api/projects")
    public ResponseEntity<Map<String, Object>> create(
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        Map<String, Object> result = createService.create(body, CurrentActor.resolve(req));
        return ResponseEntity.status(HttpStatus.CREATED).body(result);
    }

    // ---- PATCH /api/projects/{id} — 프로젝트 부분수정 (0017 §Phase2 P2, 배치17) --------
    @PatchMapping("/api/projects/{id}")
    public Map<String, Object> update(
            @PathVariable("id") long id,
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        return updateService.update(id, body, CurrentActor.resolve(req));
    }

    @GetMapping("/api/projects")
    public List<Map<String, Object>> list(
            @RequestParam(required = false) String location,
            @RequestParam(required = false) String status) {

        String loc = location != null ? location.trim() : null;
        boolean hasLocation = loc != null && !loc.isEmpty();
        boolean etc = hasLocation && LOCATION_ETC.equals(loc);
        String locationLike = hasLocation && LOCATIONS.contains(loc) ? loc : null;
        String statusFilter = status != null && !status.trim().isEmpty() ? status.trim() : null;

        List<ProjectEntity> projects = anyFilter(locationLike, etc, statusFilter)
                ? projectRepository.findFiltered(locationLike, etc, statusFilter)
                : projectRepository.findAllByOrderByProjectIdAsc();
        List<ProjectCompanyEntity> companies = companyRepository.findAllByOrderByProjectCompanyIdAsc();

        List<Map<String, Object>> result = new ArrayList<>();
        for (ProjectEntity p : projects) {
            Map<String, Object> mapped = ProjectMapper.mapProject(p);
            List<Map<String, Object>> members = new ArrayList<>();
            for (ProjectCompanyEntity c : companies) {
                // 프로젝트 일치 + 고객사 제외 (Node: role !== '고객사')
                if (p.getProjectId().equals(c.getProjectId()) && !"고객사".equals(c.getRole())) {
                    members.add(ProjectMapper.mapConsortium(c));
                }
            }
            mapped.put("consortiumMembers", members);
            result.add(mapped);
        }
        return result;
    }

    private static boolean anyFilter(String locationLike, boolean etc, String status) {
        return locationLike != null || etc || status != null;
    }
}
