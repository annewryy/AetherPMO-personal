package com.aetherpms.project;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.aetherpms.auth.AuthContext;
import com.aetherpms.auth.ProjectScopeService;
import com.aetherpms.common.Actor;
import com.aetherpms.common.ApiException;
import com.aetherpms.common.AuditWriter;
import com.aetherpms.common.CurrentActor;
import com.aetherpms.common.ReadSupport;
import com.aetherpms.common.WriteSupport;

import jakarta.servlet.http.HttpServletRequest;

/**
 * 0039 — VRB(사업성 검토) 심의 정보 저장. 프로젝트당 1행(pms_vrb_info PK=project_id)이라
 *   생성/수정을 PUT 하나로 upsert 한다(행이 없으면 INSERT, 있으면 UPDATE).
 */
@RestController
public class VrbWriteController {

    private static final List<String> DATE_FIELDS = List.of("plannedDate", "submittedDate", "approvedDate");

    private final JdbcTemplate jdbc;
    private final ProjectScopeService scope;
    private final AuditWriter audit;

    public VrbWriteController(JdbcTemplate jdbc, ProjectScopeService scope, AuditWriter audit,
            com.aetherpms.code.CommonCodeService codes) {
        this.jdbc = jdbc;
        this.scope = scope;
        this.audit = audit;
        this.codes = codes;
    }

    // 0044 — VRB 상태 어휘는 공통코드 VRB_STATUS가 원천(관리자 코드 관리).
    private final com.aetherpms.code.CommonCodeService codes;

    @PutMapping("/api/projects/{id}/vrb")
    @Transactional
    public Map<String, Object> save(@PathVariable("id") long rawId,
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        long projectId = ReadSupport.parseId(rawId);
        ReadSupport.requireProject(jdbc, projectId);
        scope.assertCanEditProject(AuthContext.of(req), projectId);
        Actor actor = CurrentActor.resolve(req);

        Map<String, Object> fields = normalize(body);
        Map<String, Object> before = WriteSupport.findOne(jdbc, "pms_vrb_info", "project_id", projectId);

        Map<String, Object> after;
        if (before == null) {
            // status는 NOT NULL — 미지정이면 초기값 '미상신'.
            fields.putIfAbsent("status", "미상신");
            fields.put("project_id", projectId);
            jdbc.update("INSERT INTO pms_vrb_info (project_id, status, planned_date, submitted_date, "
                      + "approved_date, vrb_number, memo) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    projectId, fields.get("status"), fields.get("planned_date"), fields.get("submitted_date"),
                    fields.get("approved_date"), fields.get("vrb_number"), fields.get("memo"));
            after = WriteSupport.findOne(jdbc, "pms_vrb_info", "project_id", projectId);
            audit.write("PROJECT", projectId, projectId, "INSERT", null, null, after, actor, "VRB 심의 정보 등록");
        } else {
            if (fields.isEmpty()) throw ApiException.badRequest("수정할 필드가 없습니다.");
            after = WriteSupport.updateReturning(jdbc, "pms_vrb_info", "project_id", projectId, fields, true);
            List<String> cols = List.copyOf(fields.keySet());
            audit.write("PROJECT", projectId, projectId, "UPDATE", cols,
                    WriteSupport.pick(before, cols), WriteSupport.pick(after, cols), actor, "VRB 심의 정보 수정");
        }
        return map(after);
    }

    /** 화이트리스트 + 상태 어휘·날짜 형식 검증. 빈 문자열은 null(미지정)로 저장. */
    private Map<String, Object> normalize(Map<String, Object> raw) {
        Map<String, Object> b = raw == null ? Map.of() : raw;
        List<String> allowed = List.of("status", "plannedDate", "submittedDate", "approvedDate", "vrbNumber", "memo");
        List<String> unknown = b.keySet().stream().filter(k -> !allowed.contains(k)).toList();
        if (!unknown.isEmpty()) {
            throw ApiException.badRequest("허용되지 않는 필드: " + String.join(", ", unknown)
                    + " (허용: " + String.join(", ", allowed) + ")");
        }

        Map<String, Object> out = new LinkedHashMap<>();
        if (b.containsKey("status")) {
            out.put("status", codes.normalizeOrDefault("VRB_STATUS", b.get("status"), "미상신"));
        }
        for (String key : DATE_FIELDS) {
            if (!b.containsKey(key)) continue;
            String col = switch (key) {
                case "plannedDate" -> "planned_date";
                case "submittedDate" -> "submitted_date";
                default -> "approved_date";
            };
            Object v = b.get(key);
            String s = v == null ? "" : v.toString().trim();
            if (s.isEmpty()) { out.put(col, null); continue; }
            try {
                out.put(col, LocalDate.parse(s));
            } catch (java.time.format.DateTimeParseException e) {
                throw ApiException.badRequest(key + "는 yyyy-MM-dd 형식이어야 합니다.");
            }
        }
        putTrimmed(out, b, "vrbNumber", "vrb_number");
        putTrimmed(out, b, "memo", "memo");
        return out;
    }

    private static void putTrimmed(Map<String, Object> out, Map<String, Object> b, String key, String col) {
        if (!b.containsKey(key)) return;
        Object v = b.get(key);
        String s = v == null ? null : v.toString().trim();
        out.put(col, s == null || s.isEmpty() ? null : s);
    }

    private static Map<String, Object> map(Map<String, Object> row) {
        Map<String, Object> o = new LinkedHashMap<>();
        o.put("projectId", ((Number) row.get("project_id")).longValue());
        o.put("status", row.get("status"));
        o.put("plannedDate", dateStr(row.get("planned_date")));
        o.put("submittedDate", dateStr(row.get("submitted_date")));
        o.put("approvedDate", dateStr(row.get("approved_date")));
        o.put("vrbNumber", row.get("vrb_number"));
        o.put("memo", row.get("memo") == null ? "" : row.get("memo"));
        return o;
    }

    private static String dateStr(Object v) {
        if (v == null) return null;
        if (v instanceof java.sql.Date d) return d.toLocalDate().toString();
        if (v instanceof LocalDate d) return d.toString();
        return v.toString();
    }
}
