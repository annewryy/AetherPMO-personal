package com.aetherpms.company;

import static com.aetherpms.common.WriteSupport.applyAliases;
import static com.aetherpms.common.WriteSupport.toLong;

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
import com.aetherpms.common.RowMappers;
import com.aetherpms.common.WriteSupport;

/**
 * 회사(기준정보) 관리(0009 모듈4) — 구 AdminService의 회사 CRUD 분리.
 */
@Service
public class CompanyAdminService {

    private final JdbcTemplate jdbc;
    private final AuditWriter audit;

    public CompanyAdminService(JdbcTemplate jdbc, AuditWriter audit) {
        this.jdbc = jdbc;
        this.audit = audit;
    }

    private static final List<String> COMPANY_TYPES = List.of("OWN", "PARTNER", "CLIENT");
    // 0039 — agency_code(V10, 나라장터 수요기관코드) 누락돼 프론트가 보내는 agencyCode가
    //   "허용되지 않는 필드"로 거부되어 신규 회사 등록이 항상 실패하던 버그 수정.
    private static final Set<String> COMPANY_FIELDS = Set.of("company_name", "company_type", "is_active", "agency_code");
    private static final Map<String, String> COMPANY_ALIASES = Map.of(
            "name", "company_name", "type", "company_type", "isActive", "is_active", "agencyCode", "agency_code");

    @Transactional
    public Map<String, Object> createCompany(Map<String, Object> body, Actor actor) {
        Map<String, Object> normalized = validateCompanyPayload(body, true);
        Map<String, Object> company = WriteSupport.insertReturning(jdbc, "pms_company", "company_id", normalized);
        audit.write("COMPANY", toLong(company.get("company_id")), null, "INSERT",
                null, null, company, actor, "회사 생성 (관리자)");
        return RowMappers.mapCompany(company);
    }

    @Transactional
    public Map<String, Object> updateCompany(long id, Map<String, Object> body, Actor actor) {
        WriteSupport.parseId(id);
        Map<String, Object> normalized = validateCompanyPayload(body, false);
        Map<String, Object> before = WriteSupport.findOne(jdbc, "pms_company", "company_id", id);
        if (before == null) throw ApiException.notFound("회사를 찾을 수 없습니다.");

        List<String> cols = List.copyOf(normalized.keySet());
        Map<String, Object> after = WriteSupport.updateReturning(jdbc, "pms_company", "company_id", id, normalized, false);
        audit.write("COMPANY", id, null, "UPDATE", cols,
                WriteSupport.pick(before, cols), WriteSupport.pick(after, cols), actor, "회사 수정 (관리자)");
        return RowMappers.mapCompany(after);
    }

    @Transactional
    public Map<String, Object> deleteCompany(long id, Actor actor) {
        WriteSupport.parseId(id);
        Map<String, Object> company = WriteSupport.findOne(jdbc, "pms_company", "company_id", id);
        if (company == null) throw ApiException.notFound("회사를 찾을 수 없습니다.");

        int clientProjects = count("SELECT COUNT(*) FROM pms_project WHERE client_company_id = ?", id);
        int projectCompanies = count("SELECT COUNT(*) FROM pms_project_company WHERE company_id = ?", id);
        if (clientProjects + projectCompanies > 0) {
            throw ApiException.conflict("참조 중인 회사는 삭제할 수 없습니다 (고객사 프로젝트 " + clientProjects
                    + " · 프로젝트 참여 " + projectCompanies + ").");
        }
        jdbc.update("DELETE FROM pms_company WHERE company_id = ?", id);
        audit.write("COMPANY", id, null, "DELETE", null, company, null, actor, "회사 삭제 (관리자, 참조 0건)");
        return Map.of("deleted", true, "id", id);
    }

    private Map<String, Object> validateCompanyPayload(Map<String, Object> raw, boolean requireAll) {
        Map<String, Object> body = applyAliases(raw, COMPANY_ALIASES);
        if (body.isEmpty()) throw ApiException.badRequest("수정할 필드가 없습니다.");
        List<String> rejected = body.keySet().stream().filter(k -> !COMPANY_FIELDS.contains(k)).toList();
        if (!rejected.isEmpty()) throw ApiException.badRequest("허용되지 않는 필드: " + String.join(", ", rejected));

        Map<String, Object> out = new LinkedHashMap<>();
        if (body.containsKey("company_name")) {
            Object n = body.get("company_name");
            if (!(n instanceof String s) || s.trim().isEmpty()) {
                throw ApiException.badRequest("company_name은 비어있지 않은 문자열이어야 합니다.");
            }
            out.put("company_name", ((String) n).trim());
        } else if (requireAll) {
            throw ApiException.badRequest("company_name은 필수입니다.");
        }
        if (body.containsKey("company_type")) {
            if (body.get("company_type") == null) {
                out.put("company_type", null);
            } else if (!COMPANY_TYPES.contains(str(body.get("company_type")))) {
                throw ApiException.badRequest("유효하지 않은 company_type: " + body.get("company_type")
                        + " (허용: " + String.join(", ", COMPANY_TYPES) + ")");
            } else {
                out.put("company_type", body.get("company_type"));
            }
        }
        if (body.containsKey("is_active")) {
            if (!(body.get("is_active") instanceof Boolean bv)) {
                throw ApiException.badRequest("is_active는 boolean이어야 합니다.");
            }
            out.put("is_active", bv);
        }
        if (body.containsKey("agency_code")) {
            Object a = body.get("agency_code");
            if (a == null) {
                out.put("agency_code", null);
            } else if (!(a instanceof String s) || s.trim().isEmpty()) {
                out.put("agency_code", null);
            } else {
                out.put("agency_code", s.trim());
            }
        }
        return out;
    }

    private int count(String sql, Object... args) {
        Integer c = jdbc.queryForObject(sql, Integer.class, args);
        return c == null ? 0 : c;
    }

    static String str(Object o) { return o == null ? null : o.toString(); }
}
