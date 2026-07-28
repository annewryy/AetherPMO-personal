package com.aetherpms.file;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.util.UriUtils;

import com.aetherpms.auth.AuthContext;
import com.aetherpms.auth.ProjectScopeService;
import com.aetherpms.common.ApiException;

import jakarta.servlet.http.HttpServletRequest;

/**
 * 0018/0038 — 산출물 파일 흐름 1차:
 *  양식(pms_doc_template.file_ref): POST/GET /api/doc-templates/{id}/file (쓰기=SYS_ADMIN, RbacInterceptor)
 *  산출물: GET /api/deliverables/{id}/template-file (연동 양식 다운로드)
 *          POST /api/deliverables/{id}/file (수정본 업로드 — 버전 증가, pms_deliverable_version)
 *          GET  /api/deliverables/{id}/file (최신 수정본 다운로드)
 *          GET  /api/deliverables/{id}/versions (버전 이력)
 */
@RestController
public class FileController {

    private final JdbcTemplate jdbc;
    private final FilePort files;
    private final ProjectScopeService scope;

    public FileController(JdbcTemplate jdbc, FilePort files, ProjectScopeService scope) {
        this.jdbc = jdbc;
        this.files = files;
        this.scope = scope;
    }

    // ---- 양식 파일 ----------------------------------------------------------

    @PostMapping("/api/doc-templates/{id}/file")
    public Map<String, Object> uploadTemplate(@PathVariable("id") long id,
                                              @RequestParam("file") MultipartFile file) {
        requireFile(file);
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM pms_doc_template WHERE template_id = ?",
                Integer.class, id);
        if (n == null || n == 0) throw ApiException.notFound("양식을 찾을 수 없습니다.");
        String key = "doc-templates/" + id + "/" + UUID.randomUUID() + "__" + safeName(file);
        putStream(key, file);
        jdbc.update("UPDATE pms_doc_template SET file_ref = ? WHERE template_id = ?", key, id);
        return Map.of("ok", true, "templateId", id, "fileName", safeName(file), "fileRef", key);
    }

    @GetMapping("/api/doc-templates/{id}/file")
    public ResponseEntity<InputStreamResource> downloadTemplate(@PathVariable("id") long id) {
        List<String> refs = jdbc.query("SELECT file_ref FROM pms_doc_template WHERE template_id = ?",
                (rs, i) -> rs.getString(1), id);
        if (refs.isEmpty()) throw ApiException.notFound("양식을 찾을 수 없습니다.");
        return stream(refs.get(0), "등록된 양식 파일이 없습니다. 산출물 관리에서 파일을 업로드하세요.");
    }

    // ---- 산출물 파일 --------------------------------------------------------

    /** 연동 양식(테일러링 노드 → 기본 양식) 템플릿 다운로드 — 태스크에서 산출물 착수용. */
    @GetMapping("/api/deliverables/{id}/template-file")
    public ResponseEntity<InputStreamResource> downloadDeliverableTemplate(@PathVariable("id") long id,
                                                                           HttpServletRequest req) {
        Map<String, Object> d = deliverable(id);
        scope.assertCanView(AuthContext.of(req), ((Number) d.get("project_id")).longValue());
        Object nodeId = d.get("catalog_node_id");
        String ref = null;
        if (nodeId != null) {
            List<String> refs = jdbc.query("""
                    SELECT t.file_ref FROM pms_catalog_node n
                    JOIN pms_doc_template t ON t.template_id = n.doc_template_id
                    WHERE n.node_id = ?""", (rs, i) -> rs.getString(1), nodeId);
            ref = refs.isEmpty() ? null : refs.get(0);
        }
        return stream(ref, "이 산출물에 연동된 양식 파일이 없습니다. (테일러링 기본 양식 또는 양식 파일 미등록)");
    }

    /** 수정본 업로드 — 버전 증가 + 이력 기록. */
    @PostMapping("/api/deliverables/{id}/file")
    public Map<String, Object> uploadDeliverable(@PathVariable("id") long id,
                                                 @RequestParam("file") MultipartFile file,
                                                 @RequestParam(value = "comment", required = false) String comment,
                                                 HttpServletRequest req) {
        requireFile(file);
        Map<String, Object> d = deliverable(id);
        AuthContext ctx = AuthContext.of(req);
        scope.assertItemWrite(ctx, "deliverables", id);  // 0032 §5② — WORKER는 본인 담당만
        int nextVer = jdbc.queryForObject(
                "SELECT COALESCE(MAX(version_no), 0) + 1 FROM pms_deliverable_version WHERE deliverable_id = ?",
                Integer.class, id);
        String name = safeName(file);
        String key = "deliverables/" + id + "/v" + nextVer + "/" + UUID.randomUUID() + "__" + name;
        putStream(key, file);
        jdbc.update("""
                INSERT INTO pms_deliverable_version
                  (deliverable_id, version_no, status, file_ref, file_name, change_comment, created_by_name)
                VALUES (?, ?, ?, ?, ?, ?, ?)""",
                id, nextVer, d.get("status"), key, name,
                comment == null || comment.isBlank() ? null : comment.trim(),
                ctx == null ? null : ctx.name());
        jdbc.update("UPDATE pms_deliverable SET file_name = ?, version_no = ? WHERE deliverable_id = ?",
                name, nextVer, id);
        return Map.of("ok", true, "deliverableId", id, "versionNo", nextVer, "fileName", name);
    }

    /** 최신 수정본 다운로드. */
    @GetMapping("/api/deliverables/{id}/file")
    public ResponseEntity<InputStreamResource> downloadDeliverable(@PathVariable("id") long id,
                                                                   HttpServletRequest req) {
        Map<String, Object> d = deliverable(id);
        scope.assertCanView(AuthContext.of(req), ((Number) d.get("project_id")).longValue());
        List<String> refs = jdbc.query("""
                SELECT file_ref FROM pms_deliverable_version
                WHERE deliverable_id = ? ORDER BY version_no DESC LIMIT 1""",
                (rs, i) -> rs.getString(1), id);
        return stream(refs.isEmpty() ? null : refs.get(0), "업로드된 파일이 없습니다.");
    }

    @GetMapping("/api/deliverables/{id}/versions")
    public List<Map<String, Object>> versions(@PathVariable("id") long id, HttpServletRequest req) {
        Map<String, Object> d = deliverable(id);
        scope.assertCanView(AuthContext.of(req), ((Number) d.get("project_id")).longValue());
        return jdbc.queryForList("""
                SELECT version_id AS versionId, version_no AS versionNo, file_name AS fileName,
                       change_comment AS changeComment, created_by_name AS createdByName,
                       created_at AS createdAt
                FROM pms_deliverable_version WHERE deliverable_id = ? ORDER BY version_no DESC""", id);
    }

    // ---- 헬퍼 ---------------------------------------------------------------

    private Map<String, Object> deliverable(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT project_id, catalog_node_id, status FROM pms_deliverable WHERE deliverable_id = ?", id);
        if (rows.isEmpty()) throw ApiException.notFound("산출물을 찾을 수 없습니다.");
        return rows.get(0);
    }

    private static void requireFile(MultipartFile file) {
        if (file == null || file.isEmpty()) throw ApiException.badRequest("업로드할 파일이 없습니다.");
    }

    private static String safeName(MultipartFile file) {
        String name = file.getOriginalFilename() == null ? "file" : file.getOriginalFilename();
        name = name.replace("\\", "/");
        name = name.substring(name.lastIndexOf('/') + 1);
        return name.isBlank() ? "file" : name;
    }

    private void putStream(String key, MultipartFile file) {
        try (InputStream in = file.getInputStream()) {
            files.put(key, in);
        } catch (java.io.IOException e) {
            throw new IllegalStateException("업로드 스트림 처리 실패", e);
        }
    }

    /** 키의 `uuid__원본명`에서 원본 파일명 복원해 첨부 다운로드 응답. */
    private ResponseEntity<InputStreamResource> stream(String ref, String missingMessage) {
        if (ref == null || ref.isBlank() || !files.exists(ref)) {
            throw ApiException.notFound(missingMessage);
        }
        String fileName = ref.substring(ref.lastIndexOf('/') + 1);
        int sep = fileName.indexOf("__");
        if (sep > 0) fileName = fileName.substring(sep + 2);
        String encoded = UriUtils.encode(fileName, StandardCharsets.UTF_8);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename*=UTF-8''" + encoded)
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(new InputStreamResource(files.get(ref)));
    }
}
