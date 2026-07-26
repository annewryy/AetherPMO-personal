package com.aetherpms.project;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.aetherpms.common.CurrentActor;
import com.aetherpms.auth.AuthContext;
import com.aetherpms.auth.ProjectScopeService;

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

    /** 0025: project_stage 허용값(콤마 구분 stage 파라미터 검증용). */
    private static final Set<String> STAGES = Set.of("BIDDING", "EXECUTION", "COMPLETED");

    private final ProjectRepository projectRepository;
    private final ProjectCompanyRepository companyRepository;
    private final ProjectCreateService createService;
    private final ProjectUpdateService updateService;
    private final ProjectConvertService convertService;
    private final JdbcTemplate jdbc;
    private final ProjectScopeService scope;

    public ProjectController(ProjectRepository projectRepository,
                             ProjectCompanyRepository companyRepository,
                             ProjectCreateService createService,
                             ProjectUpdateService updateService,
                             JdbcTemplate jdbc,
                             ProjectConvertService convertService,
                             ProjectScopeService scope) {
        this.projectRepository = projectRepository;
        this.companyRepository = companyRepository;
        this.createService = createService;
        this.updateService = updateService;
        this.jdbc = jdbc;
        this.convertService = convertService;
        this.scope = scope;
    }

    // ---- POST /api/projects — 프로젝트 생성 (0017 §B P1) ------------------
    @PostMapping("/api/projects")
    public ResponseEntity<Map<String, Object>> create(
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        // 0032 §3 — 프로젝트(입찰) 등록: WORKER는 불가(PM은 등록 가능)
        AuthContext cctx = AuthContext.of(req);
        if (cctx != null && "WORKER".equals(cctx.role())) {
            throw com.aetherpms.common.ApiException.forbidden("프로젝트 등록은 PM·관리자만 수행할 수 있습니다.");
        }
        Map<String, Object> result = createService.create(body, CurrentActor.resolve(req));
        return ResponseEntity.status(HttpStatus.CREATED).body(result);
    }

    // ---- PATCH /api/projects/{id} — 프로젝트 부분수정 (0017 §Phase2 P2, 배치17) --------
    @PatchMapping("/api/projects/{id}")
    public Map<String, Object> update(
            @PathVariable("id") long id,
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        scope.assertCanEditProject(AuthContext.of(req), id);  // 0032 §4 — PM=담당 프로젝트만
        return updateService.update(id, body, CurrentActor.resolve(req));
    }

    // ---- POST /api/projects/{id}/convert-to-execution — 입찰→수행 전환(0033/설계 0001) ----
    @PostMapping("/api/projects/{id}/convert-to-execution")
    public Map<String, Object> convertToExecution(@PathVariable("id") long id,
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        scope.assertCanEditProject(AuthContext.of(req), id);  // 0032 §4 — 전환=프로젝트 수정 권한
        return convertService.convertToExecution(id, body, CurrentActor.resolve(req));
    }

    @GetMapping("/api/projects")
    public List<Map<String, Object>> list(
            @RequestParam(required = false) String location,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String stage,
            HttpServletRequest req) {

        String loc = location != null ? location.trim() : null;
        boolean hasLocation = loc != null && !loc.isEmpty();
        boolean etc = hasLocation && LOCATION_ETC.equals(loc);
        String locationLike = hasLocation && LOCATIONS.contains(loc) ? loc : null;
        String statusFilter = status != null && !status.trim().isEmpty() ? status.trim() : null;

        // 0025 §B-4: stage 필터(콤마 허용 — 예: EXECUTION,COMPLETED). 미지정이면 전체.
        Set<String> stageFilter = parseStages(stage);

        List<ProjectEntity> projects = anyFilter(locationLike, etc, statusFilter)
                ? projectRepository.findFiltered(locationLike, etc, statusFilter)
                : projectRepository.findAllByOrderByProjectIdAsc();
        if (stageFilter != null) {
            projects = projects.stream()
                    .filter(p -> stageFilter.contains(p.getProjectStage()))
                    .toList();
        }
        // 0035 — 참여 스코프(PM/WORKER, rbac.enforce 시): 참여인력 등록 프로젝트만
        AuthContext ctx = AuthContext.of(req);
        if (scope.isScoped(ctx)) {
            java.util.Set<Long> mine = scope.memberProjectIds(ctx);
            projects = projects.stream().filter(p -> mine.contains(p.getProjectId())).toList();
        }
        List<ProjectCompanyEntity> companies = companyRepository.findAllByOrderByProjectCompanyIdAsc();

        // 0025 §B-3: 목록 카드 집계(투입 인력수·산출물 상태 카운트) — GROUP BY 2쿼리, N+1 금지.
        Map<Long, Integer> memberCounts = countsByProject(
                "SELECT project_id, COUNT(*) FROM pms_project_member WHERE is_active = 1 GROUP BY project_id");
        Map<Long, int[]> artifactCounts = artifactCountsByProject();

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
            mapped.put("memberCount", memberCounts.getOrDefault(p.getProjectId(), 0));
            int[] ac = artifactCounts.getOrDefault(p.getProjectId(), new int[3]);
            mapped.put("artifactTotal", ac[0]);
            mapped.put("artifactApproved", ac[1]);
            mapped.put("artifactInReview", ac[2]);
            result.add(mapped);
        }
        return result;
    }

    private static boolean anyFilter(String locationLike, boolean etc, String status) {
        return locationLike != null || etc || status != null;
    }

    /** stage 파라미터 파싱 — 허용값 외는 무시, 유효값이 없으면 null(필터 안 함). */
    private static Set<String> parseStages(String stage) {
        if (stage == null || stage.isBlank()) return null;
        Set<String> parsed = new java.util.HashSet<>();
        for (String s : stage.split(",")) {
            String v = s.trim().toUpperCase();
            if (STAGES.contains(v)) parsed.add(v);
        }
        return parsed.isEmpty() ? null : parsed;
    }

    private Map<Long, Integer> countsByProject(String sql) {
        Map<Long, Integer> out = new HashMap<>();
        jdbc.query(sql, rs -> { out.put(rs.getLong(1), rs.getInt(2)); });
        return out;
    }

    /** project_id → [total, approved, underReview] (pms_deliverable). */
    private Map<Long, int[]> artifactCountsByProject() {
        Map<Long, int[]> out = new HashMap<>();
        jdbc.query("""
                SELECT project_id,
                       COUNT(*),
                       SUM(status = 'APPROVED'),
                       SUM(status = 'UNDER_REVIEW')
                  FROM pms_deliverable
                 GROUP BY project_id""",
                rs -> { out.put(rs.getLong(1), new int[]{rs.getInt(2), rs.getInt(3), rs.getInt(4)}); });
        return out;
    }
}
