package com.aetherpms.officialdoc;

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
import com.aetherpms.common.Json;
import com.aetherpms.common.WriteSupport;

/**
 * 공문(pms_official_doc) CRUD — 배치17 / 0017 §Phase2.
 *   POST   /api/official-docs          등록
 *   PATCH  /api/official-docs/{id}      부분수정
 *   DELETE /api/official-docs/{id}      삭제
 *
 * Node 오라클엔 공문 쓰기 로직이 없음(reads.ts 서브리소스 읽기만) → 기존 Spring 쓰기 관례
 * (batch2 write/·batch9 create·ApiException·AuditWriter·WriteSupport)로 구현.
 *
 * 응답: OfficialDoc DTO(camelCase) — GET /api/projects/{id}/official-docs(mapOfficialDoc)와 정합.
 * 발번(doc_number): 아마란스 전자결재 연동 전이라 자동발번 규칙 없음 — 입력값을 그대로 저장(선택).
 *   [경계: 결재선/상태 전이는 아마란스 위임 영역. 여기선 PMS 소유 메타(제목·번호·유형·일자 등)만.]
 * 검증·404·@Transactional·audit(INSERT/UPDATE/DELETE, before/after).
 */
@Service
public class OfficialDocService {

    private final JdbcTemplate jdbc;
    private final AuditWriter audit;

    public OfficialDocService(JdbcTemplate jdbc, AuditWriter audit,
            com.aetherpms.code.CommonCodeService codes) {
        this.jdbc = jdbc;
        this.audit = audit;
        this.codes = codes;
    }

    // 0044 — 공문 분류(DOC_CATEGORY) 검증용 공통코드. current_status(아마란스 결재 상태)는 고정 유지.
    private final com.aetherpms.code.CommonCodeService codes;

    // pms_official_doc CHECK 제약(스키마 V3).
    // 0044 — 공문 분류 어휘는 공통코드 DOC_CATEGORY가 원천(관리자 코드 관리).
    private static final List<String> STATUSES = List.of("기안", "결재중", "완료", "반려");

    // 등록 허용 키(camelCase). mapOfficialDoc 계약 + 스키마 컬럼.
    private static final Set<String> CREATE_KEYS = Set.of(
            "projectId", "title", "docNumber", "category",
            "draftDept", "drafter", "drafterId", "draftDate",
            "approvalLine", "currentApprover", "currentStatus", "remarks");

    // 수정 허용 키 — projectId(소속 프로젝트)는 불변으로 제외.
    private static final Set<String> UPDATE_KEYS = Set.of(
            "title", "docNumber", "category",
            "draftDept", "drafter", "drafterId", "draftDate",
            "approvalLine", "currentApprover", "currentStatus", "remarks");

    // ---- POST /api/official-docs -----------------------------------------
    @Transactional
    public Map<String, Object> create(Map<String, Object> body, Actor actor) {
        Map<String, Object> b = body == null ? Map.of() : body;
        rejectUnknown(b, CREATE_KEYS);

        long projectId = asPositiveLong(b.get("projectId"));
        if (projectId <= 0) {
            throw ApiException.badRequest("projectId는 필수이며 양의 정수여야 합니다.");
        }
        requireProject(projectId);

        String title = trimToNull(b.get("title"));
        if (title == null) {
            throw ApiException.badRequest("title은 필수입니다.");
        }

        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("project_id", projectId);
        fields.put("title", title);
        putStr(fields, "doc_number", b.get("docNumber"));
        if (b.get("category") != null) fields.put("category", codes.nullableValid("DOC_CATEGORY", b.get("category")));
        putStr(fields, "draft_dept", b.get("draftDept"));
        putStr(fields, "drafter_name", b.get("drafter"));
        putUuid(fields, "drafter_uid", b.get("drafterId"));
        putDate(fields, "draft_date", b.get("draftDate"));
        putJson(fields, "approval_line", b.get("approvalLine"));
        putStr(fields, "current_approver", b.get("currentApprover"));
        putEnum(fields, "current_status", b.get("currentStatus"), STATUSES);
        putStr(fields, "remarks", b.get("remarks"));

        Map<String, Object> created =
                WriteSupport.insertReturning(jdbc, "pms_official_doc", "doc_id", fields);
        long docId = ((Number) created.get("doc_id")).longValue();

        audit.write("OFFICIAL_DOC", docId, projectId, "INSERT", null, null, created,
                actor, "공문 등록");
        return mapRow(created);
    }

    // ---- PATCH /api/official-docs/{id} -----------------------------------
    @Transactional
    public Map<String, Object> update(long rawId, Map<String, Object> body, Actor actor) {
        long id = WriteSupport.parseId(rawId);
        Map<String, Object> b = body == null ? Map.of() : body;
        rejectUnknown(b, UPDATE_KEYS);
        if (b.isEmpty()) {
            throw ApiException.badRequest("수정할 필드가 없습니다.");
        }

        Map<String, Object> before = jdbc.queryForList(
                "SELECT * FROM pms_official_doc WHERE doc_id = ? FOR UPDATE", id)
                .stream().findFirst().orElse(null);
        if (before == null) {
            throw ApiException.notFound("공문을 찾을 수 없습니다.");
        }

        Map<String, Object> fields = new LinkedHashMap<>();
        if (b.containsKey("title")) {
            String title = trimToNull(b.get("title"));
            if (title == null) throw ApiException.badRequest("title은 비울 수 없습니다.");
            fields.put("title", title);
        }
        if (b.containsKey("docNumber")) putStrNullable(fields, "doc_number", b.get("docNumber"));
        if (b.containsKey("category")) if (b.get("category") != null) fields.put("category", codes.nullableValid("DOC_CATEGORY", b.get("category")));
        if (b.containsKey("draftDept")) putStrNullable(fields, "draft_dept", b.get("draftDept"));
        if (b.containsKey("drafter")) putStrNullable(fields, "drafter_name", b.get("drafter"));
        if (b.containsKey("drafterId")) putUuidNullable(fields, "drafter_uid", b.get("drafterId"));
        if (b.containsKey("draftDate")) putDateNullable(fields, "draft_date", b.get("draftDate"));
        if (b.containsKey("approvalLine")) putJson(fields, "approval_line", b.get("approvalLine"));
        if (b.containsKey("currentApprover")) putStrNullable(fields, "current_approver", b.get("currentApprover"));
        if (b.containsKey("currentStatus")) putEnum(fields, "current_status", b.get("currentStatus"), STATUSES);
        if (b.containsKey("remarks")) putStrNullable(fields, "remarks", b.get("remarks"));

        if (fields.isEmpty()) {
            throw ApiException.badRequest("수정할 유효한 필드가 없습니다.");
        }

        Map<String, Object> after = WriteSupport.updateReturning(
                jdbc, "pms_official_doc", "doc_id", id, fields, true);

        List<String> cols = new ArrayList<>(fields.keySet());
        Long projectId = ((Number) before.get("project_id")).longValue();
        audit.write("OFFICIAL_DOC", id, projectId, "UPDATE", cols,
                AuditWriter.pick(before, cols), AuditWriter.pick(after, cols),
                actor, "공문 수정");
        return mapRow(after);
    }

    // ---- DELETE /api/official-docs/{id} ----------------------------------
    @Transactional
    public Map<String, Object> delete(long rawId, Actor actor) {
        long id = WriteSupport.parseId(rawId);
        Map<String, Object> before = jdbc.queryForList(
                "SELECT * FROM pms_official_doc WHERE doc_id = ? FOR UPDATE", id)
                .stream().findFirst().orElse(null);
        if (before == null) {
            throw ApiException.notFound("공문을 찾을 수 없습니다.");
        }
        Long projectId = ((Number) before.get("project_id")).longValue();
        jdbc.update("DELETE FROM pms_official_doc WHERE doc_id = ?", id);
        audit.write("OFFICIAL_DOC", id, projectId, "DELETE", null, before, null,
                actor, "공문 삭제");
        return Map.of("deleted", true, "id", id);
    }

    // ---- 응답 매핑 (mapOfficialDoc 계약과 정합, SQL row 기준) ------------------
    private static Map<String, Object> mapRow(Map<String, Object> d) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", ((Number) d.get("doc_id")).longValue());
        out.put("projectId", ((Number) d.get("project_id")).longValue());
        out.put("docNumber", d.get("doc_number"));
        out.put("title", d.get("title"));
        out.put("category", d.get("category"));
        out.put("draftDept", d.get("draft_dept"));
        out.put("drafter", d.get("drafter_name"));
        out.put("drafterId", d.get("drafter_uid"));
        out.put("draftDate", dateStr(d.get("draft_date")));
        out.put("approvalLine", Json.readArray(asString(d.get("approval_line"))));
        out.put("currentApprover", d.get("current_approver"));
        out.put("currentStatus", d.get("current_status"));
        return out;
    }

    // ---- 헬퍼 ------------------------------------------------------------

    private void requireProject(long projectId) {
        Integer c = jdbc.queryForObject(
                "SELECT COUNT(*) FROM pms_project WHERE project_id = ?", Integer.class, projectId);
        if (c == null || c == 0) {
            throw ApiException.notFound("프로젝트를 찾을 수 없습니다.");
        }
    }

    private static void rejectUnknown(Map<String, Object> b, Set<String> allowed) {
        List<String> unknown = b.keySet().stream().filter(k -> !allowed.contains(k)).toList();
        if (!unknown.isEmpty()) {
            throw ApiException.badRequest("허용되지 않는 필드: " + String.join(", ", unknown));
        }
    }

    private static long asPositiveLong(Object v) {
        if (v == null) return 0;
        try {
            if (v instanceof Number n) return n.longValue();
            return Long.parseLong(v.toString().trim());
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static String trimToNull(Object v) {
        if (v == null) return null;
        String s = v.toString().trim();
        return s.isEmpty() ? null : s;
    }

    private static String asString(Object v) {
        return v == null ? null : v.toString();
    }

    private static String dateStr(Object v) {
        if (v == null) return null;
        if (v instanceof java.sql.Date d) return d.toLocalDate().toString();
        if (v instanceof LocalDate d) return d.toString();
        return v.toString();
    }

    /** 등록 시: 값 있으면 SET(빈문자열 무시). */
    private static void putStr(Map<String, Object> fields, String col, Object v) {
        String s = trimToNull(v);
        if (s != null) fields.put(col, s);
    }

    /** 수정 시: 키가 온 경우 — 값이 있으면 SET, 빈/null이면 명시적 NULL로 클리어. */
    private static void putStrNullable(Map<String, Object> fields, String col, Object v) {
        fields.put(col, trimToNull(v));
    }

    private static void putEnum(Map<String, Object> fields, String col, Object v, List<String> allowed) {
        String s = trimToNull(v);
        if (s == null) {
            // 수정에서 명시적 null 클리어 허용(등록에선 애초에 안 보냄).
            fields.put(col, null);
            return;
        }
        if (!allowed.contains(s)) {
            throw ApiException.badRequest("유효하지 않은 " + col + " 값: " + v
                    + " (허용: " + String.join(", ", allowed) + ")");
        }
        fields.put(col, s);
    }

    private static void putUuid(Map<String, Object> fields, String col, Object v) {
        String s = trimToNull(v);
        if (s != null) fields.put(col, s);
    }

    private static void putUuidNullable(Map<String, Object> fields, String col, Object v) {
        fields.put(col, trimToNull(v));
    }

    private static void putDate(Map<String, Object> fields, String col, Object v) {
        String s = trimToNull(v);
        if (s == null) return;
        fields.put(col, parseDate(col, s));
    }

    private static void putDateNullable(Map<String, Object> fields, String col, Object v) {
        String s = trimToNull(v);
        fields.put(col, s == null ? null : parseDate(col, s));
    }

    private static LocalDate parseDate(String col, String s) {
        try {
            return LocalDate.parse(s);
        } catch (Exception e) {
            throw ApiException.badRequest(col + " 날짜 형식이 올바르지 않습니다(YYYY-MM-DD): " + s);
        }
    }

    /** approval_line(JSON 컬럼) — 배열/객체를 JSON 문자열로 저장. null이면 클리어. */
    private static void putJson(Map<String, Object> fields, String col, Object v) {
        if (v == null) {
            fields.put(col, null);
            return;
        }
        fields.put(col, Json.write(v));
    }
}
