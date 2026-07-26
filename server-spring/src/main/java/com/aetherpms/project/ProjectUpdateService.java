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
 * PATCH /api/projects/{id} — 프로젝트 부분수정 (배치17 / 0017 §Phase2 P2).
 *
 * 배치9 create 의 필드셋과 정합(camelCase 화이트리스트). 부분수정이므로 넘어온 키만 SET,
 * 미지정 키는 건드리지 않는다. 미지원 키는 400(오타/미지원 필드 조기 차단).
 *
 * 불변 필드(수정 대상 아님): project_code(발번)·source_project_id(파생 출처)·created_by 등.
 *   기관→회사 자동매칭(배치16)은 create 전용 — 수정 시 customer 변경 재매칭은 이번 스코프 밖
 *   (customer_name 스냅샷만 갱신, client_company_id 는 건드리지 않음). [미결: 필요 시 후속]
 *
 * 검증: 존재 안 하면 404, status/bidStatus/stage enum 검증, 숫자/날짜 형식.
 * 응답: GET /api/projects/{id} 와 동일 shape(ProjectMapper + consortiumMembers/vrbInfo/counts).
 * 원자성: SELECT ... FOR UPDATE → UPDATE → audit(UPDATE, before/after) 를 @Transactional.
 */
@Service
public class ProjectUpdateService {

    private final JdbcTemplate jdbc;
    private final com.aetherpms.person.MemberAutoService memberAuto;
    private final ProjectRepository projectRepository;
    private final ProjectCompanyRepository companyRepository;
    private final AuditWriter audit;

    public ProjectUpdateService(JdbcTemplate jdbc, ProjectRepository projectRepository,
                                ProjectCompanyRepository companyRepository, AuditWriter audit, com.aetherpms.person.MemberAutoService memberAuto) {
        this.jdbc = jdbc;
        this.projectRepository = projectRepository;
        this.companyRepository = companyRepository;
        this.audit = audit;
        this.memberAuto = memberAuto;
    }

    // create 와 동일한 CHECK 값(수정 시에도 enum 검증).
    private static final List<String> STATUSES = List.of("입찰", "진행중", "지연", "보류", "완료");
    private static final List<String> BID_STATUSES =
            List.of("제안준비중", "제안제출", "결과대기", "수주", "실패");
    private static final List<String> STAGES = List.of("BIDDING", "EXECUTION", "COMPLETED");

    // 수정 허용 camelCase 키(create 필드셋 정합). 불변 필드(project_code·source·created_by)와
    // create 전용(clientCompanyId/clientAgencyCode/tailoring)은 제외 — 넘어오면 400.
    private static final Set<String> ALLOWED_KEYS = Set.of(
            "name", "description", "desc",
            "customerName",
            "budget", "contractAmount", "projectBudget",
            "announcementNo", "proposalDeadline", "businessType",
            "team", "dept", "location",
            "pmName", "manager", "pmId", "managerId",
            "bidStatus", "status", "stage",
            "plannedStartDate", "startDate", "plannedEndDate", "endDate",
            "remarks", "milestones",
            // 0027: 담당조직 정보(입찰 개요 카드 인라인 수정)
            "salesOwner", "proposalOwner", "proposalPm",
            "businessManager", "contractOwner", "legalOwner");

    @Transactional
    public Map<String, Object> update(long rawId, Map<String, Object> body, Actor actor) {
        long id = WriteSupport.parseId(rawId);
        Map<String, Object> b = body == null ? Map.of() : body;
        rejectUnknown(b);
        if (b.isEmpty()) {
            throw ApiException.badRequest("수정할 필드가 없습니다.");
        }

        // FOR UPDATE 로 현재 row 잠금(원자적 before 스냅샷).
        Map<String, Object> before = jdbc.queryForList(
                "SELECT * FROM pms_project WHERE project_id = ? FOR UPDATE", id)
                .stream().findFirst().orElse(null);
        if (before == null) {
            throw ApiException.notFound("프로젝트를 찾을 수 없습니다.");
        }

        // ---- camelCase 입력 → snake_case 컬럼(넘어온 키만). create putXxx 규칙 재사용. ----
        Map<String, Object> fields = new LinkedHashMap<>();
        if (b.containsKey("name")) {
            String name = b.get("name") == null ? null : b.get("name").toString().trim();
            if (name == null || name.isEmpty()) throw ApiException.badRequest("name(사업명)은 비울 수 없습니다.");
            fields.put("project_name", name);
        }
        putStrIfPresent(fields, "description", b, "description", "desc");
        putStrIfPresent(fields, "customer_name", b, "customerName");
        putDecimalIfPresent(fields, "budget", b, "budget");
        putDecimalIfPresent(fields, "contract_amount", b, "contractAmount", "projectBudget");
        putStrIfPresent(fields, "announcement_no", b, "announcementNo");
        putDateIfPresent(fields, "proposal_deadline", b, "proposalDeadline");
        putStrIfPresent(fields, "business_type", b, "businessType");
        putStrIfPresent(fields, "team", b, "team");
        putStrIfPresent(fields, "dept", b, "dept");
        putStrIfPresent(fields, "location", b, "location");
        putStrIfPresent(fields, "pm_name", b, "pmName", "manager");
        putStrIfPresent(fields, "pm_id", b, "pmId", "managerId");
        putDateIfPresent(fields, "planned_start_date", b, "plannedStartDate", "startDate");
        putDateIfPresent(fields, "planned_end_date", b, "plannedEndDate", "endDate");
        putStrIfPresent(fields, "remarks", b, "remarks");
        putStrIfPresent(fields, "milestones", b, "milestones");
        putStrIfPresent(fields, "sales_owner", b, "salesOwner");
        putStrIfPresent(fields, "proposal_owner", b, "proposalOwner");
        putStrIfPresent(fields, "proposal_pm", b, "proposalPm");
        putStrIfPresent(fields, "business_manager", b, "businessManager");
        putStrIfPresent(fields, "contract_owner", b, "contractOwner");
        putStrIfPresent(fields, "legal_owner", b, "legalOwner");
        if (b.containsKey("status")) fields.put("status", inList("status", b.get("status"), STATUSES));
        if (b.containsKey("bidStatus")) fields.put("bid_status", inList("bidStatus", b.get("bidStatus"), BID_STATUSES));
        if (b.containsKey("stage")) fields.put("project_stage", inList("stage", b.get("stage"), STAGES));

        if (fields.isEmpty()) {
            // 키는 있었으나 전부 빈문자열 등으로 무시된 경우.
            throw ApiException.badRequest("수정할 유효한 필드가 없습니다.");
        }

        Map<String, Object> after = WriteSupport.updateReturning(
                jdbc, "pms_project", "project_id", id, fields, false);

        // 0031: 책임자(pm_name)·담당조직 지정 → 참여인력 자동 등록(책임자만 PM 플래그)
        if (fields.containsKey("pm_name") && after.get("pm_name") != null) {
            memberAuto.ensureMember(id, after.get("pm_name").toString(), true, actor);
        }
        for (String ownerCol : List.of("sales_owner", "proposal_owner", "proposal_pm", "business_manager", "contract_owner", "legal_owner")) {
            if (fields.containsKey(ownerCol) && after.get(ownerCol) != null) {
                memberAuto.ensureMember(id, after.get(ownerCol).toString(), false, actor);
            }
        }

        List<String> cols = new ArrayList<>(fields.keySet());
        audit.write("PROJECT", id, id, "UPDATE", cols,
                AuditWriter.pick(before, cols), AuditWriter.pick(after, cols),
                actor, "프로젝트 수정");

        return detailShape(id);
    }

    /** GET /api/projects/{id} 와 동일 shape(consortiumMembers·vrbInfo·counts). */
    /** 0033 전환 서비스 등 외부에서 상세 shape 재사용. */
    public Map<String, Object> detailShapePublic(long id) { return detailShape(id); }

    private Map<String, Object> detailShape(long id) {
        ProjectEntity entity = projectRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("프로젝트를 찾을 수 없습니다."));
        Map<String, Object> out = ProjectMapper.mapProject(entity);

        List<Map<String, Object>> members = new ArrayList<>();
        for (ProjectCompanyEntity c : companyRepository.findAllByOrderByProjectCompanyIdAsc()) {
            if (id == c.getProjectId() && !"고객사".equals(c.getRole())) {
                members.add(ProjectMapper.mapConsortium(c));
            }
        }
        out.put("consortiumMembers", members);
        out.put("vrbInfo", vrbInfo(id));

        Map<String, Object> counts = new LinkedHashMap<>();
        counts.put("issues", count("pms_issue", id));
        counts.put("actionItems", count("pms_action_item", id));
        counts.put("deliverables", count("pms_deliverable", id));
        counts.put("meetingMinutes", count("pms_meeting_minutes", id));
        out.put("counts", counts);
        return out;
    }

    private int count(String table, long projectId) {
        Integer c = jdbc.queryForObject(
                "SELECT COUNT(*) FROM " + table + " WHERE project_id = ?", Integer.class, projectId);
        return c == null ? 0 : c;
    }

    /** pms_vrb_info(프로젝트당 0~1) — ReadMappers.mapVrbInfo 와 동일 camelCase shape. 없으면 null. */
    private Map<String, Object> vrbInfo(long projectId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT * FROM pms_vrb_info WHERE project_id = ?", projectId);
        if (rows.isEmpty()) return null;
        Map<String, Object> v = rows.get(0);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("projectId", ((Number) v.get("project_id")).longValue());
        out.put("status", v.get("status"));
        out.put("plannedDate", dateStr(v.get("planned_date")));
        out.put("submittedDate", dateStr(v.get("submitted_date")));
        out.put("approvedDate", dateStr(v.get("approved_date")));
        out.put("vrbNumber", v.get("vrb_number"));
        out.put("memo", v.get("memo"));
        return out;
    }

    private static String dateStr(Object v) {
        if (v == null) return null;
        if (v instanceof java.sql.Date d) return d.toLocalDate().toString();
        if (v instanceof LocalDate d) return d.toString();
        return v.toString();
    }

    // ---- 입력 헬퍼 (create putXxx 의 "키가 있을 때만" 버전) ----------------------

    private static void rejectUnknown(Map<String, Object> b) {
        List<String> unknown = b.keySet().stream().filter(k -> !ALLOWED_KEYS.contains(k)).toList();
        if (!unknown.isEmpty()) {
            throw ApiException.badRequest("허용되지 않는 필드: " + String.join(", ", unknown));
        }
    }

    private static String inList(String field, Object v, List<String> list) {
        String s = v == null ? null : v.toString().trim();
        if (s == null || s.isEmpty()) {
            throw ApiException.badRequest(field + " 값은 비울 수 없습니다.");
        }
        if (!list.contains(s)) {
            throw ApiException.badRequest("유효하지 않은 " + field + " 값: " + v
                    + " (허용: " + String.join(", ", list) + ")");
        }
        return s;
    }

    /** camelCase 별칭 중 첫 번째로 존재하는 키가 있으면 문자열 SET(빈문자열은 무시). */
    private static void putStrIfPresent(Map<String, Object> fields, String col,
                                        Map<String, Object> b, String... keys) {
        if (!anyPresent(b, keys)) return;
        Object v = firstValue(b, keys);
        if (v == null) return;
        String s = v.toString();
        if (s.trim().isEmpty()) return;
        fields.put(col, s.trim());
    }

    private static void putDecimalIfPresent(Map<String, Object> fields, String col,
                                            Map<String, Object> b, String... keys) {
        if (!anyPresent(b, keys)) return;
        Object v = firstValue(b, keys);
        if (v == null || v.toString().trim().isEmpty()) return;
        try {
            fields.put(col, new BigDecimal(v.toString().trim()));
        } catch (NumberFormatException e) {
            throw ApiException.badRequest(col + " 값이 숫자가 아닙니다: " + v);
        }
    }

    private static void putDateIfPresent(Map<String, Object> fields, String col,
                                         Map<String, Object> b, String... keys) {
        if (!anyPresent(b, keys)) return;
        Object v = firstValue(b, keys);
        if (v == null || v.toString().trim().isEmpty()) return;
        try {
            fields.put(col, LocalDate.parse(v.toString().trim()));
        } catch (Exception e) {
            throw ApiException.badRequest(col + " 날짜 형식이 올바르지 않습니다(YYYY-MM-DD): " + v);
        }
    }

    private static boolean anyPresent(Map<String, Object> b, String... keys) {
        for (String k : keys) if (b.containsKey(k)) return true;
        return false;
    }

    private static Object firstValue(Map<String, Object> b, String... keys) {
        for (String k : keys) {
            if (b.containsKey(k)) {
                Object v = b.get(k);
                if (v != null && !(v instanceof String s && s.trim().isEmpty())) return v;
            }
        }
        return null;
    }
}
