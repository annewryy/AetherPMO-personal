package com.aetherpms.project;

import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.aetherpms.common.Actor;
import com.aetherpms.common.ApiException;
import com.aetherpms.common.AuditWriter;
import com.aetherpms.person.MemberAutoService;

/**
 * 0033 — 입찰 → 수행 전환(스폰). 설계 0001 데이터 경계 그대로:
 *  - 복사: 사업명·고객사(회사FK)·공고번호·계약금액·사업유형·컨소시엄 역할/지분·팀·PM·설명·부서·수행장소
 *  - 행 복제: pms_project_company(컨소시엄)·pms_contact_point
 *  - 새로 생성: project_code(입찰 코드의 -B 제거, 충돌 시 신규 발번)·stage=EXECUTION·status=진행중·progress=0
 *  - 승계 안 함: 입찰 이슈/액션/산출물/태스크·bid_status·proposal_deadline (수행 테일러링은 이후 재선택)
 *  - 전환 완료 시 입찰: bid_status=수주 + status=완료(stage는 BIDDING 유지)
 *  - 이미 전환된 입찰(파생 수행 존재)은 409.
 */
@Service
public class ProjectConvertService {

    private final JdbcTemplate jdbc;
    private final ProjectCodeService codeService;
    private final ProjectUpdateService updateService; // detailShape 재사용 대신 조회용 아님 — 미사용 시 제거
    private final AuditWriter audit;
    private final MemberAutoService memberAuto;

    public ProjectConvertService(JdbcTemplate jdbc, ProjectCodeService codeService,
                                 ProjectUpdateService updateService, AuditWriter audit,
                                 MemberAutoService memberAuto) {
        this.jdbc = jdbc;
        this.codeService = codeService;
        this.updateService = updateService;
        this.audit = audit;
        this.memberAuto = memberAuto;
    }

    @Transactional
    public Map<String, Object> convertToExecution(long sourceId, Actor actor) {
        Map<String, Object> src = jdbc.queryForList(
                "SELECT * FROM pms_project WHERE project_id = ? FOR UPDATE", sourceId)
                .stream().findFirst()
                .orElseThrow(() -> ApiException.notFound("프로젝트를 찾을 수 없습니다."));

        if (!"BIDDING".equals(str(src.get("project_stage")))) {
            throw ApiException.badRequest("입찰 단계 프로젝트만 수행 전환할 수 있습니다.");
        }
        Integer derived = jdbc.queryForObject(
                "SELECT COUNT(*) FROM pms_project WHERE source_project_id = ?", Integer.class, sourceId);
        if (derived != null && derived > 0) {
            throw ApiException.conflict("이미 수행 전환된 프로젝트입니다 — 파생 수행 프로젝트가 존재합니다.");
        }

        // 수행 코드: 입찰 코드의 -B 제거(공통 베이스 유지, 0001). 충돌·부재 시 신규 발번.
        String srcCode = str(src.get("project_code"));
        String execCode = null;
        if (srcCode != null && srcCode.endsWith("-B")) {
            String base = srcCode.substring(0, srcCode.length() - 2);
            Integer dup = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM pms_project WHERE project_code = ?", Integer.class, base);
            if (dup != null && dup == 0) execCode = base;
        }
        if (execCode == null) execCode = codeService.nextBaseCode();

        jdbc.update("""
                INSERT INTO pms_project
                    (project_name, project_code, description, pm_id, pm_name, client_company_id,
                     customer_name, dept, team, location, business_type, announcement_no, bid_number,
                     contract_amount, budget, consortium_role, consortium_share,
                     status, project_stage, progress_rate, source_project_id, created_by)
                SELECT project_name, ?, description, pm_id, pm_name, client_company_id,
                       customer_name, dept, team, location, business_type, announcement_no, bid_number,
                       contract_amount, budget, consortium_role, consortium_share,
                       '진행중', 'EXECUTION', 0, project_id, ?
                  FROM pms_project WHERE project_id = ?""",
                execCode, actor.userId(), sourceId);
        Long newId = jdbc.queryForObject("SELECT LAST_INSERT_ID()", Long.class);

        // 행 복제: 컨소시엄 + 연락처(0001)
        jdbc.update("""
                INSERT INTO pms_project_company (project_id, company_id, company_name, role, share_rate, description)
                SELECT ?, company_id, company_name, role, share_rate, description
                  FROM pms_project_company WHERE project_id = ?""", newId, sourceId);
        jdbc.update("""
                INSERT INTO pms_contact_point (project_id, field, contact_type, user_id, name,
                                               company, company_id, title, phone, email, note)
                SELECT ?, field, contact_type, user_id, name, company, company_id, title, phone, email, note
                  FROM pms_contact_point WHERE project_id = ?""", newId, sourceId);

        // 입찰 원본: 수주·완료 처리(stage는 BIDDING 유지 — 0001)
        jdbc.update("UPDATE pms_project SET bid_status = '수주', status = '완료' WHERE project_id = ?", sourceId);

        // PM 참여인력 자동 등록(0031 규칙 재사용)
        if (src.get("pm_name") != null) {
            memberAuto.ensureMember(newId, src.get("pm_name").toString(), true, actor);
        }

        audit.write("PROJECT", newId, newId, "INSERT", null, null,
                Map.of("project_code", execCode, "source_project_id", sourceId),
                actor, "[전환] 입찰 → 수행 프로젝트 생성 (원본 " + srcCode + ")");
        audit.write("PROJECT", sourceId, sourceId, "UPDATE",
                List.of("bid_status", "status"),
                Map.of("bid_status", str(src.get("bid_status")), "status", str(src.get("status"))),
                Map.of("bid_status", "수주", "status", "완료"),
                actor, "[전환] 수행 전환 완료 — 수주·완료 처리 (파생 " + execCode + ")");

        return updateService.detailShapePublic(newId);
    }

    private static String str(Object o) { return o == null ? null : o.toString(); }
}
