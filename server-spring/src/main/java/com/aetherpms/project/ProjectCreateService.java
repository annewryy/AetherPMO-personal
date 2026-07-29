package com.aetherpms.project;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.aetherpms.common.Actor;
import com.aetherpms.common.ApiException;
import com.aetherpms.common.AuditWriter;
import com.aetherpms.common.WriteSupport;

/**
 * POST /api/projects — 프로젝트 생성 (배치9 / 0017 §B P1).
 *
 * 0017 플로우의 기반: 나라장터 공고 → 입찰 프로젝트. 지금은 백엔드 계약만(프론트 P2 별도).
 *
 * 입력(camelCase, 프론트 Project 계약 + pms_project 컬럼):
 *   필수: name(사업명).
 *   선택: customerName, clientCompanyId, budget, contractAmount(=projectBudget),
 *         announcementNo, proposalDeadline, businessType, description(=desc),
 *         team, dept, pmName(=manager), pmId(=managerId), bidStatus, location,
 *         plannedStartDate(=startDate), plannedEndDate(=endDate), remarks, milestones.
 *
 * 기본값(미지정 시): project_stage=BIDDING, status='입찰', bid_status='제안준비중',
 *                    progress_rate=0, source_project_id=null.
 * 사업번호: projectCode 필수 — 사용자가 직접 입력한다(2026-07-29 자동 발번 폐지).
 *           중복이면 409(ProjectCodeService.requireAvailable).
 *
 * 응답: GET /api/projects/{id} 와 동일 shape(ProjectMapper + consortiumMembers/vrbInfo/counts).
 * 원자성: 코드 중복검사+insert 를 @Transactional (JDBC insert + 같은 트랜잭션 JPA 재조회로 매핑 재사용).
 */
@Service
public class ProjectCreateService {

    private final JdbcTemplate jdbc;
    private final ProjectRepository projectRepository;
    private final ProjectCodeService projectCodeService;
    private final AuditWriter audit;
    private final TailoringExpansionService tailoringExpansion;
    private final com.aetherpms.person.MemberAutoService memberAuto;

    public ProjectCreateService(JdbcTemplate jdbc, ProjectRepository projectRepository,
                                ProjectCodeService projectCodeService, AuditWriter audit,
                                TailoringExpansionService tailoringExpansion,
                                com.aetherpms.person.MemberAutoService memberAuto) {
        this.jdbc = jdbc;
        this.projectRepository = projectRepository;
        this.projectCodeService = projectCodeService;
        this.audit = audit;
        this.tailoringExpansion = tailoringExpansion;
        this.memberAuto = memberAuto;
    }

    // pms_project CHECK 값들 — 생성 시 기본은 입찰 프리셋, 입력 허용 시 검증용.
    private static final List<String> STATUSES = List.of("입찰", "진행중", "지연", "보류", "완료");
    private static final List<String> BID_STATUSES =
            List.of("제안준비중", "제안제출", "결과대기", "수주", "실패");
    private static final List<String> STAGES = List.of("BIDDING", "EXECUTION", "COMPLETED");

    // 입력으로 받는 camelCase 키(그 외는 400으로 거부해 오타/미지원 필드를 조기 차단).
    private static final Set<String> ALLOWED_KEYS = Set.of(
            "name", "projectCode", "description", "desc",
            "customerName", "clientCompanyId", "clientAgencyCode",
            "budget", "contractAmount", "projectBudget",
            "announcementNo", "proposalDeadline", "businessType",
            "team", "dept", "location",
            "pmName", "manager", "pmId", "managerId",
            // 0031: 생성 시 담당조직 지정(유경님 생성 폼 파리티)
            "salesOwner", "proposalOwner", "proposalPm",
            "businessManager", "contractOwner", "legalOwner",
            "bidStatus", "status", "stage",
            "plannedStartDate", "startDate", "plannedEndDate", "endDate",
            "remarks", "milestones",
            // 배치11 P3a: 카탈로그 테일러링 전개. 프로젝트 컬럼이 아니라 별도 처리(하위호환: 없으면 기본 생성).
            "tailoring");

    @Transactional
    public Map<String, Object> create(Map<String, Object> body, Actor actor) {
        Map<String, Object> b = body == null ? Map.of() : body;
        rejectUnknown(b);

        Object nameRaw = b.get("name");
        String name = nameRaw == null ? null : nameRaw.toString();
        if (name == null || name.trim().isEmpty()) {
            throw ApiException.badRequest("name(사업명)은 필수입니다.");
        }

        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("project_name", name.trim());

        // ---- 고정 기본값(미지정 시) --------------------------------------
        String stage = optInList("stage", b.get("stage"), STAGES, "BIDDING");
        fields.put("project_stage", stage);
        fields.put("status", optInList("status", b.get("status"), STATUSES, "입찰"));
        fields.put("bid_status", optInList("bidStatus", b.get("bidStatus"), BID_STATUSES, "제안준비중"));
        fields.put("progress_rate", 0);
        // source_project_id 는 null(미설정) — 신규 입찰은 파생이 아님.

        // ---- 프리필/선택 필드 (0017 §B) ---------------------------------
        putStr(fields, "description", firstNonNull(b.get("description"), b.get("desc")));
        putStr(fields, "customer_name", b.get("customerName"));
        putDecimal(fields, "budget", b.get("budget"));
        putDecimal(fields, "contract_amount", firstNonNull(b.get("contractAmount"), b.get("projectBudget")));
        putStr(fields, "announcement_no", b.get("announcementNo"));
        putDate(fields, "proposal_deadline", b.get("proposalDeadline"));
        putStr(fields, "business_type", b.get("businessType"));
        putStr(fields, "team", b.get("team"));
        putStr(fields, "dept", b.get("dept"));
        putStr(fields, "location", b.get("location"));
        putStr(fields, "pm_name", firstNonNull(b.get("pmName"), b.get("manager")));
        putStr(fields, "sales_owner", b.get("salesOwner"));
        putStr(fields, "proposal_owner", b.get("proposalOwner"));
        putStr(fields, "proposal_pm", b.get("proposalPm"));
        putStr(fields, "business_manager", b.get("businessManager"));
        putStr(fields, "contract_owner", b.get("contractOwner"));
        putStr(fields, "legal_owner", b.get("legalOwner"));
        putStr(fields, "pm_id", firstNonNull(b.get("pmId"), b.get("managerId")));
        putDate(fields, "planned_start_date", firstNonNull(b.get("plannedStartDate"), b.get("startDate")));
        putDate(fields, "planned_end_date", firstNonNull(b.get("plannedEndDate"), b.get("endDate")));
        putStr(fields, "remarks", b.get("remarks"));
        putStr(fields, "milestones", b.get("milestones"));

        // ---- 기관 → 회사 자동매칭/생성 (배치16 / 0017 §미결, 2026-07-10 결정) --------
        //   우선순위: ① clientCompanyId 명시 → 존재검증 후 사용.
        //            ② clientAgencyCode → agency_code 매칭, 없으면 CLIENT 자동생성(코드+이름).
        //            ③ customerName 만 → company_name 정확일치 매칭, 없으면 CLIENT 자동생성(이름).
        //   customer_name 스냅샷은 위에서 항상 저장(이력). 매칭/생성 모두 이 @Transactional 안.
        Long clientCompanyId = resolveClientCompanyId(b);
        if (clientCompanyId != null) fields.put("client_company_id", clientCompanyId);

        // ---- 사업번호(사용자 직접 입력) + insert -------------------------
        //   2026-07-29: 자동 발번 폐지. 사내 기존 코드 체계를 그대로 입력받고 중복만 막는다.
        fields.put("project_code", projectCodeService.requireAvailable(b.get("projectCode"), null));
        if (actor.userId() != null) fields.put("created_by", actor.userId());

        Map<String, Object> created = WriteSupport.insertReturning(jdbc, "pms_project", "project_id", fields);
        long projectId = ((Number) created.get("project_id")).longValue();

        // ---- 배치11 P3a: 테일러링 전개(같은 트랜잭션) --------------------------
        // tailoring 없으면 (0,0) — 배치10 프론트 등 기존 호출은 tailoring 없이 기본 생성.
        TailoringExpansionService.ExpansionResult expansion =
                tailoringExpansion.expand(projectId, b.get("tailoring"));

        // 0031: 생성 시 지정한 책임자(pm_name)·담당조직 → 참여인력 자동 등록(책임자만 PM 플래그)
        if (created.get("pm_name") != null) {
            memberAuto.ensureMember(projectId, created.get("pm_name").toString(), true, actor);
        }
        for (String ownerCol : List.of("sales_owner", "proposal_owner", "proposal_pm", "business_manager", "contract_owner", "legal_owner")) {
            if (created.get(ownerCol) != null) {
                memberAuto.ensureMember(projectId, created.get(ownerCol).toString(), false, actor);
            }
        }

        String reason = (expansion.createdTasks() + expansion.createdDeliverables()) > 0
                ? "프로젝트 신규 생성(테일러링 전개)" : "프로젝트 신규 생성";
        audit.write("PROJECT", projectId, projectId, "INSERT", null, null, created, actor, reason);

        return detailShape(projectId, expansion);
    }

    // ---- 기관 → 회사 매칭/자동생성 (배치16) ------------------------------------

    /**
     * 고객사(client_company_id) 해석. 우선순위대로 매칭·자동생성한다(모두 create()의 @Transactional 안).
     *   ① clientCompanyId 명시 → 존재검증 후 그대로.
     *   ② clientAgencyCode 있음 → agency_code 매칭, 없으면 CLIENT 자동생성(company_name=customerName, agency_code=코드).
     *   ③ clientAgencyCode 없고 customerName 있음 → company_name 정확일치 매칭, 없으면 CLIENT 자동생성(이름만).
     *   ④ 둘 다 없음 → null(연결 없음, 기존 기본 생성 경로).
     * 더미데이터 금지: 자동생성은 공고의 실제 기관값(코드·이름)만 사용한다.
     */
    private Long resolveClientCompanyId(Map<String, Object> b) {
        // ① clientCompanyId 명시 — 기존 계약 유지(존재검증).
        Long explicitId = optPositiveLong("clientCompanyId", b.get("clientCompanyId"));
        if (explicitId != null) {
            Integer c = jdbc.queryForObject("SELECT COUNT(*) FROM pms_company WHERE company_id = ?",
                    Integer.class, explicitId);
            if (c == null || c == 0) throw ApiException.badRequest("존재하지 않는 clientCompanyId입니다.");
            return explicitId;
        }

        String agencyCode = trimToNull(b.get("clientAgencyCode"));
        String customerName = trimToNull(b.get("customerName"));

        // ② 기관코드 우선 — agency_code 매칭 → 없으면 CLIENT 자동생성.
        if (agencyCode != null) {
            Long matched = jdbc.query(
                    "SELECT company_id FROM pms_company WHERE agency_code = ?",
                    rs -> rs.next() ? rs.getLong(1) : null, agencyCode);
            if (matched != null) return matched;
            // 자동생성 회사명: 기관명(있으면) 없으면 기관코드. 실제 기관값만 사용.
            String name = customerName != null ? customerName : agencyCode;
            return createClientCompany(name, agencyCode);
        }

        // ③ 이름 폴백 — company_name 정확일치 → 없으면 CLIENT 자동생성.
        if (customerName != null) {
            Long matched = jdbc.query(
                    "SELECT company_id FROM pms_company WHERE company_name = ? ORDER BY company_id LIMIT 1",
                    rs -> rs.next() ? rs.getLong(1) : null, customerName);
            if (matched != null) return matched;
            return createClientCompany(customerName, null);
        }

        // ④ 매칭 근거 없음 — 연결 없이 진행(customer_name 스냅샷은 이미 저장됨).
        return null;
    }

    /**
     * CLIENT 회사 자동생성 후 company_id 반환. agency_code UNIQUE 동시성 충돌 시 재조회 폴백.
     *   같은 @Transactional 안이라 커밋 전 조회는 자기 삽입만 보이지만, 동시 트랜잭션이 먼저
     *   커밋해 UNIQUE 위반이 나면 그 코드로 재조회해 그 회사에 연결한다(중복 회사 방지).
     */
    private Long createClientCompany(String companyName, String agencyCode) {
        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("company_name", companyName);
        fields.put("company_type", "CLIENT");
        fields.put("is_active", 1);
        if (agencyCode != null) fields.put("agency_code", agencyCode);
        try {
            Map<String, Object> created =
                    WriteSupport.insertReturning(jdbc, "pms_company", "company_id", fields);
            return ((Number) created.get("company_id")).longValue();
        } catch (org.springframework.dao.DuplicateKeyException dup) {
            // agency_code UNIQUE 충돌 — 다른 트랜잭션이 같은 코드로 먼저 생성. 그 회사에 연결.
            if (agencyCode != null) {
                Long matched = jdbc.query(
                        "SELECT company_id FROM pms_company WHERE agency_code = ?",
                        rs -> rs.next() ? rs.getLong(1) : null, agencyCode);
                if (matched != null) return matched;
            }
            throw dup;
        }
    }

    private static String trimToNull(Object v) {
        if (v == null) return null;
        String s = v.toString().trim();
        return s.isEmpty() ? null : s;
    }

    /** GET /api/projects/{id} 와 동일 shape + 전개 결과 카운트(createdTasks/createdDeliverables). */
    private Map<String, Object> detailShape(long projectId, TailoringExpansionService.ExpansionResult expansion) {
        // 같은 트랜잭션에서 JPA 재조회 → ProjectMapper 재사용(GET 상세와 동일 매핑).
        ProjectEntity entity = projectRepository.findById(projectId)
                .orElseThrow(() -> ApiException.notFound("생성한 프로젝트를 찾을 수 없습니다."));
        Map<String, Object> out = ProjectMapper.mapProject(entity);

        // 신규 프로젝트라 서브리소스/컨소시엄/VRB 없음 — 상세와 동일 키를 빈값으로.
        out.put("consortiumMembers", new ArrayList<>());
        out.put("vrbInfo", null);
        Map<String, Object> counts = new LinkedHashMap<>();
        counts.put("issues", 0);
        counts.put("actionItems", 0);
        counts.put("deliverables", 0);
        counts.put("meetingMinutes", 0);
        out.put("counts", counts);

        // 전개 결과(Node 계약 createdTasks/createdDeliverables) — 상세 shape에 부가.
        out.put("createdTasks", expansion.createdTasks());
        out.put("createdDeliverables", expansion.createdDeliverables());
        return out;
    }

    // ---- 입력 헬퍼 --------------------------------------------------------

    private static void rejectUnknown(Map<String, Object> b) {
        List<String> unknown = b.keySet().stream().filter(k -> !ALLOWED_KEYS.contains(k)).toList();
        if (!unknown.isEmpty()) {
            throw ApiException.badRequest("허용되지 않는 필드: " + String.join(", ", unknown));
        }
    }

    /** 값이 있으면 리스트 검증 후 반환, 없으면 기본값. */
    private static String optInList(String field, Object v, List<String> list, String defaultVal) {
        if (v == null || v.toString().trim().isEmpty()) return defaultVal;
        String s = v.toString().trim();
        if (!list.contains(s)) {
            throw ApiException.badRequest("유효하지 않은 " + field + " 값: " + v
                    + " (허용: " + String.join(", ", list) + ")");
        }
        return s;
    }

    private static Long optPositiveLong(String field, Object v) {
        if (v == null || v.toString().trim().isEmpty()) return null;
        long n;
        if (v instanceof Number num) {
            double d = num.doubleValue();
            if (d != Math.floor(d)) throw ApiException.badRequest(field + "는 양의 정수여야 합니다.");
            n = num.longValue();
        } else {
            try { n = Long.parseLong(v.toString().trim()); }
            catch (NumberFormatException e) { throw ApiException.badRequest(field + "는 양의 정수여야 합니다."); }
        }
        if (n <= 0) throw ApiException.badRequest(field + "는 양의 정수여야 합니다.");
        return n;
    }

    private static void putStr(Map<String, Object> fields, String col, Object v) {
        if (v == null) return;
        String s = v.toString();
        if (s.trim().isEmpty()) return;
        fields.put(col, s.trim());
    }

    private static void putDecimal(Map<String, Object> fields, String col, Object v) {
        if (v == null || v.toString().trim().isEmpty()) return;
        try {
            fields.put(col, new BigDecimal(v.toString().trim()));
        } catch (NumberFormatException e) {
            throw ApiException.badRequest(col + " 값이 숫자가 아닙니다: " + v);
        }
    }

    private static void putDate(Map<String, Object> fields, String col, Object v) {
        if (v == null || v.toString().trim().isEmpty()) return;
        try {
            fields.put(col, LocalDate.parse(v.toString().trim()));
        } catch (Exception e) {
            throw ApiException.badRequest(col + " 날짜 형식이 올바르지 않습니다(YYYY-MM-DD): " + v);
        }
    }

    private static Object firstNonNull(Object... vals) {
        for (Object v : vals) {
            if (v != null && !(v instanceof String s && s.trim().isEmpty())) return v;
        }
        return null;
    }
}
