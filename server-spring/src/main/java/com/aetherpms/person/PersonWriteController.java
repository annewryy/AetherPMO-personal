package com.aetherpms.person;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.aetherpms.common.Actor;
import com.aetherpms.common.ApiException;
import com.aetherpms.common.AuditWriter;
import com.aetherpms.common.CurrentActor;
import com.aetherpms.common.WriteSupport;

import jakarta.servlet.http.HttpServletRequest;

/**
 * 0039 — 인력 마스터(pms_person) 신규 등록·수정. 기존에는 참여인력 등록 과정에서만
 *   find-or-insert로 사람이 생겼고 인력관리 화면에서 직접 만들 방법이 없었다.
 *   내부(INTERNAL) 인력은 사번(amaranth_emp_no)이 dedup 키라 중복을 막는다.
 */
@RestController
public class PersonWriteController {

    private static final List<String> SOURCES = List.of("INTERNAL", "EXTERNAL");
    private static final List<String> EMPLOYMENT_TYPES =
            List.of("regular", "insourced", "project_contract", "turnkey", "freelancer");
    private static final List<String> STATUSES = List.of("재직", "종료");
    /** 외주 계열은 소속회사 필수(참여인력 등록 폼과 동일 규칙). */
    private static final List<String> OUTSOURCED = List.of("project_contract", "turnkey", "freelancer");

    private final JdbcTemplate jdbc;
    private final PersonService service;
    private final AuditWriter audit;

    public PersonWriteController(JdbcTemplate jdbc, PersonService service, AuditWriter audit) {
        this.jdbc = jdbc;
        this.service = service;
        this.audit = audit;
    }

    @PostMapping("/api/persons")
    @Transactional
    public ResponseEntity<Map<String, Object>> create(
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        Actor actor = CurrentActor.resolve(req);
        Map<String, Object> fields = normalize(body, true, null);
        assertEmpNoUnique(str(fields.get("amaranth_emp_no")), null);

        Map<String, Object> created =
                WriteSupport.insertReturning(jdbc, "pms_person", "person_id", fields);
        long personId = ((Number) created.get("person_id")).longValue();
        audit.write("PERSON", personId, null, "INSERT", null, null, created, actor,
                "인력 신규 등록: " + created.get("name"));
        return ResponseEntity.status(HttpStatus.CREATED).body(service.detail(personId));
    }

    @PatchMapping("/api/persons/{id}")
    @Transactional
    public Map<String, Object> update(@PathVariable("id") long id,
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        Actor actor = CurrentActor.resolve(req);
        WriteSupport.parseId(id);
        Map<String, Object> before = WriteSupport.findOne(jdbc, "pms_person", "person_id", id);
        if (before == null) throw ApiException.notFound("인력을 찾을 수 없습니다.");

        Map<String, Object> fields = normalize(body, false, before);
        if (fields.isEmpty()) throw ApiException.badRequest("수정할 필드가 없습니다.");
        if (fields.containsKey("amaranth_emp_no")) {
            assertEmpNoUnique(str(fields.get("amaranth_emp_no")), id);
        }

        Map<String, Object> after =
                WriteSupport.updateReturning(jdbc, "pms_person", "person_id", id, fields, true);
        List<String> cols = List.copyOf(fields.keySet());
        audit.write("PERSON", id, null, "UPDATE", cols,
                WriteSupport.pick(before, cols), WriteSupport.pick(after, cols), actor, "인력 정보 수정");
        return service.detail(id);
    }

    // ---- 내부 -----------------------------------------------------------------

    /** 내부 인력 사번은 dedup 키(V7 부분 유니크) — 사전 검증해 500 대신 409로 안내. */
    private void assertEmpNoUnique(String empNo, Long selfId) {
        if (empNo == null || empNo.isBlank()) return;
        List<Map<String, Object>> dup = selfId == null
                ? jdbc.queryForList("SELECT person_id, name FROM pms_person WHERE amaranth_emp_no = ?", empNo)
                : jdbc.queryForList("SELECT person_id, name FROM pms_person WHERE amaranth_emp_no = ? "
                        + "AND person_id <> ?", empNo, selfId);
        if (!dup.isEmpty()) {
            throw ApiException.conflict("이미 같은 사번의 인력이 있습니다: " + dup.get(0).get("name")
                    + " (사번 " + empNo + ")");
        }
    }

    /**
     * 화이트리스트 + 어휘 검증. create=true면 이름·인력구분 필수.
     * before는 수정 시 "결과 상태" 판정용(외주 계열인데 소속회사가 비는 것을 막는다).
     */
    private Map<String, Object> normalize(Map<String, Object> raw, boolean create, Map<String, Object> before) {
        Map<String, Object> b = raw == null ? Map.of() : raw;
        List<String> allowed = List.of("name", "source", "amaranthEmpNo", "employmentType",
                "companyId", "department", "deptCode", "position", "phone", "email", "status");
        List<String> unknown = b.keySet().stream().filter(k -> !allowed.contains(k)).toList();
        if (!unknown.isEmpty()) {
            throw ApiException.badRequest("허용되지 않는 필드: " + String.join(", ", unknown)
                    + " (허용: " + String.join(", ", allowed) + ")");
        }

        Map<String, Object> out = new LinkedHashMap<>();
        if (b.containsKey("name") || create) {
            String name = b.get("name") == null ? "" : b.get("name").toString().trim();
            if (name.isEmpty()) throw ApiException.badRequest("성명은 필수입니다.");
            out.put("name", name);
        }
        if (b.containsKey("source") || create) {
            String v = b.get("source") == null ? "EXTERNAL" : b.get("source").toString().trim();
            if (!SOURCES.contains(v)) {
                throw ApiException.badRequest("구분은 " + String.join(", ", SOURCES) + " 중 하나여야 합니다.");
            }
            out.put("source", v);
        }
        if (b.containsKey("employmentType") || create) {
            String v = b.get("employmentType") == null ? "regular" : b.get("employmentType").toString().trim();
            if (!EMPLOYMENT_TYPES.contains(v)) {
                throw ApiException.badRequest("인력구분은 " + String.join(", ", EMPLOYMENT_TYPES)
                        + " 중 하나여야 합니다.");
            }
            out.put("employment_type", v);
        }
        if (b.containsKey("status")) {
            String v = b.get("status") == null ? "재직" : b.get("status").toString().trim();
            if (!STATUSES.contains(v)) {
                throw ApiException.badRequest("재직상태는 " + String.join(", ", STATUSES) + " 중 하나여야 합니다.");
            }
            out.put("status", v);
        }
        if (b.containsKey("companyId")) {
            Object v = b.get("companyId");
            if (v == null) {
                out.put("company_id", null);
            } else {
                Integer cid = WriteSupport.intOrNull(v);
                if (cid == null || cid <= 0) throw ApiException.badRequest("companyId는 양의 정수여야 합니다.");
                Integer exists = jdbc.queryForObject(
                        "SELECT COUNT(*) FROM pms_company WHERE company_id = ?", Integer.class, cid);
                if (exists == null || exists == 0) throw ApiException.badRequest("존재하지 않는 소속회사입니다.");
                out.put("company_id", cid);
            }
        }
        putTrimmed(out, b, "amaranthEmpNo", "amaranth_emp_no");
        putTrimmed(out, b, "department", "department");
        // 0042 — 부서 코드는 조직도에 실재하는 코드만 받는다. 오타가 들어오면 그 인력은
        //   어느 부서 필터에도 안 걸리고 조용히 사라지므로 여기서 막는다.
        if (b.containsKey("deptCode")) {
            String dc = b.get("deptCode") == null ? null : b.get("deptCode").toString().trim();
            if (dc == null || dc.isEmpty()) {
                out.put("dept_code", null);
            } else {
                Integer ok = jdbc.queryForObject(
                        "SELECT COUNT(*) FROM pms_org_dept WHERE dept_code = ?", Integer.class, dc);
                if (ok == null || ok == 0) throw ApiException.badRequest("존재하지 않는 부서 코드입니다: " + dc);
                out.put("dept_code", dc);
            }
        }
        putTrimmed(out, b, "position", "position");
        putTrimmed(out, b, "phone", "phone");
        putTrimmed(out, b, "email", "email");

        // 외주 계열은 소속회사 필수 — 수정 시에도 "적용 후 상태" 기준으로 본다.
        String effType = out.containsKey("employment_type") ? str(out.get("employment_type"))
                : before == null ? null : str(before.get("employment_type"));
        Object effCompany = out.containsKey("company_id") ? out.get("company_id")
                : before == null ? null : before.get("company_id");
        if (effType != null && OUTSOURCED.contains(effType) && effCompany == null) {
            throw ApiException.badRequest("외주 계열 인력은 소속회사가 필수입니다.");
        }
        return out;
    }

    private static void putTrimmed(Map<String, Object> out, Map<String, Object> b, String key, String col) {
        if (!b.containsKey(key)) return;
        Object v = b.get(key);
        String s = v == null ? null : v.toString().trim();
        out.put(col, s == null || s.isEmpty() ? null : s);
    }

    private static String str(Object o) { return o == null ? null : o.toString(); }
}
