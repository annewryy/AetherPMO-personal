package com.aetherpms;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.MariaDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * 배치17 Phase2 쓰기 통합 테스트 — PATCH /api/projects/{id} + 공문(official-doc) CRUD.
 *   V1~V10 시드 위(seed 프로젝트 3 존재). Docker 없으면 클래스 스킵.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
@EnabledIf("dockerAvailable")
class Batch17WritesIntegrationTest {

    static boolean dockerAvailable() {
        return org.testcontainers.DockerClientFactory.instance().isDockerAvailable();
    }

    @Container
    @SuppressWarnings("resource")
    static final MariaDBContainer<?> MARIADB = new MariaDBContainer<>("mariadb:11")
            .withDatabaseName("aetherpms")
            .withUsername("aetherpms")
            .withPassword("aetherpms");

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", MARIADB::getJdbcUrl);
        registry.add("spring.datasource.username", MARIADB::getUsername);
        registry.add("spring.datasource.password", MARIADB::getPassword);
    }

    @Autowired
    TestRestTemplate rest;

    // 기본 JDK 클라이언트는 PATCH 미지원 → httpclient5 팩토리로 교체.
    @org.junit.jupiter.api.BeforeEach
    void enablePatch() {
        rest.getRestTemplate().setRequestFactory(
                new org.springframework.http.client.HttpComponentsClientHttpRequestFactory());
    }

    private static final ParameterizedTypeReference<Map<String, Object>> MAP = new ParameterizedTypeReference<>() {};
    private static final ParameterizedTypeReference<List<Map<String, Object>>> LIST = new ParameterizedTypeReference<>() {};

    private <T> ResponseEntity<T> send(HttpMethod method, String path, Object body,
                                       ParameterizedTypeReference<T> type) {
        HttpHeaders h = new HttpHeaders();
        h.set("Content-Type", "application/json");
        h.set("X-User-Id", "11111111-1111-1111-1111-111111111111");
        return rest.exchange(path, method, new HttpEntity<>(body, h), type);
    }

    // ===================================================================
    // A. PATCH /api/projects/{id}
    // ===================================================================

    /** 새 프로젝트 생성 후 그 id 반환(seed 오염 방지). 사업번호는 필수라 고유값을 만들어 넣는다. */
    private long createProject(String name) {
        ResponseEntity<Map<String, Object>> resp = send(HttpMethod.POST, "/api/projects",
                Map.of("name", name, "projectCode", "B17-" + System.nanoTime()), MAP);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        return ((Number) resp.getBody().get("id")).longValue();
    }

    @Test
    void patchProject_partialUpdate_returnsDetailShape() {
        long id = createProject("PATCH 대상 프로젝트");

        Map<String, Object> in = new HashMap<>();
        in.put("name", "수정된 사업명");
        in.put("customerName", "조달청");
        in.put("budget", 2000000000);
        in.put("bidStatus", "제안제출");
        in.put("dept", "플랫폼팀");

        ResponseEntity<Map<String, Object>> resp = send(HttpMethod.PATCH, "/api/projects/" + id, in, MAP);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        Map<String, Object> body = resp.getBody();
        assertThat(body.get("name")).isEqualTo("수정된 사업명");
        assertThat(body.get("customer")).isEqualTo("조달청");
        assertThat(body.get("customerName")).isEqualTo("조달청");
        assertThat(((Number) body.get("budget")).longValue()).isEqualTo(2000000000L);
        assertThat(body.get("bidStatus")).isEqualTo("제안제출");
        assertThat(body.get("dept")).isEqualTo("플랫폼팀");
        // GET 상세와 동일 shape.
        assertThat(body).containsKeys("id", "projectCode", "consortiumMembers", "vrbInfo", "counts");

        // 미지정 필드(projectCode 등 불변)는 그대로 — 되읽어 확인.
        ResponseEntity<Map<String, Object>> got = rest.exchange("/api/projects/" + id, HttpMethod.GET, null, MAP);
        assertThat(got.getBody().get("name")).isEqualTo("수정된 사업명");
        assertThat(got.getBody().get("projectCode")).isEqualTo(body.get("projectCode"));
    }

    @Test
    void patchProject_notFound_404() {
        ResponseEntity<Map<String, Object>> resp = send(HttpMethod.PATCH, "/api/projects/999999",
                Map.of("name", "x"), MAP);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(resp.getBody().get("message").toString()).contains("프로젝트");
    }

    @Test
    void patchProject_unknownField_400() {
        long id = createProject("미지원키 테스트");
        Map<String, Object> in = new HashMap<>();
        in.put("bogusField", 1);
        ResponseEntity<Map<String, Object>> resp = send(HttpMethod.PATCH, "/api/projects/" + id, in, MAP);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(resp.getBody().get("message").toString()).contains("허용되지 않는 필드");
    }

    @Test
    void patchProject_emptyBody_400() {
        long id = createProject("빈 바디 테스트");
        ResponseEntity<Map<String, Object>> resp = send(HttpMethod.PATCH, "/api/projects/" + id,
                Map.of(), MAP);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void patchProject_invalidStatusEnum_400() {
        long id = createProject("enum 검증");
        Map<String, Object> in = new HashMap<>();
        in.put("status", "이상한값");
        ResponseEntity<Map<String, Object>> resp = send(HttpMethod.PATCH, "/api/projects/" + id, in, MAP);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void patchProject_statusStoredKo_returnedEn() {
        long id = createProject("상태 매핑");
        ResponseEntity<Map<String, Object>> resp = send(HttpMethod.PATCH, "/api/projects/" + id,
                Map.of("status", "진행중"), MAP);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        // 매퍼가 KO('진행중')→EN('In Progress').
        assertThat(resp.getBody().get("status")).isEqualTo("In Progress");
    }

    // ===================================================================
    // B. 공문 CRUD  /api/official-docs
    // ===================================================================

    private List<Map<String, Object>> officialDocs(long projectId) {
        return rest.exchange("/api/projects/" + projectId + "/official-docs",
                HttpMethod.GET, null, LIST).getBody();
    }

    @Test
    void officialDoc_create_update_delete_roundtrip() {
        long projectId = createProject("공문 CRUD 프로젝트");

        // ---- 등록 ----
        Map<String, Object> in = new HashMap<>();
        in.put("projectId", projectId);
        in.put("title", "착수보고 공문");
        in.put("docNumber", "PMS-2026-0001");
        in.put("category", "공문");
        in.put("draftDept", "사업관리팀");
        in.put("drafter", "박너울");
        in.put("draftDate", "2026-07-10");
        in.put("approvalLine", List.of(Map.of("step", 1, "name", "팀장")));
        in.put("currentApprover", "팀장");
        in.put("currentStatus", "결재중");

        ResponseEntity<Map<String, Object>> created = send(HttpMethod.POST, "/api/official-docs", in, MAP);
        assertThat(created.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        Map<String, Object> cb = created.getBody();
        long docId = ((Number) cb.get("id")).longValue();
        // mapOfficialDoc 계약 필드.
        assertThat(cb.get("projectId")).isEqualTo((int) projectId);
        assertThat(cb.get("title")).isEqualTo("착수보고 공문");
        assertThat(cb.get("docNumber")).isEqualTo("PMS-2026-0001");
        assertThat(cb.get("category")).isEqualTo("공문");
        assertThat(cb.get("drafter")).isEqualTo("박너울");
        assertThat(cb.get("draftDate")).isEqualTo("2026-07-10");
        assertThat(cb.get("currentStatus")).isEqualTo("결재중");
        assertThat(cb).containsKeys("approvalLine", "draftDept", "currentApprover", "drafterId");

        // GET 되읽기 정합.
        assertThat(officialDocs(projectId)).anySatisfy(d ->
                assertThat(((Number) d.get("id")).longValue()).isEqualTo(docId));

        // ---- 수정 ----
        ResponseEntity<Map<String, Object>> patched = send(HttpMethod.PATCH, "/api/official-docs/" + docId,
                Map.of("title", "착수보고 공문(수정)", "currentStatus", "완료"), MAP);
        assertThat(patched.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(patched.getBody().get("title")).isEqualTo("착수보고 공문(수정)");
        assertThat(patched.getBody().get("currentStatus")).isEqualTo("완료");
        // 미수정 필드 보존.
        assertThat(patched.getBody().get("docNumber")).isEqualTo("PMS-2026-0001");

        // ---- 삭제 ----
        ResponseEntity<Map<String, Object>> deleted = send(HttpMethod.DELETE, "/api/official-docs/" + docId, null, MAP);
        assertThat(deleted.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(deleted.getBody().get("deleted")).isEqualTo(Boolean.TRUE);
        assertThat(officialDocs(projectId)).noneSatisfy(d ->
                assertThat(((Number) d.get("id")).longValue()).isEqualTo(docId));
    }

    @Test
    void officialDoc_create_missingTitle_400() {
        long projectId = createProject("제목 누락 공문");
        Map<String, Object> in = new HashMap<>();
        in.put("projectId", projectId);
        in.put("category", "공문");
        ResponseEntity<Map<String, Object>> resp = send(HttpMethod.POST, "/api/official-docs", in, MAP);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(resp.getBody().get("message").toString()).contains("title");
    }

    @Test
    void officialDoc_create_unknownProject_404() {
        Map<String, Object> in = new HashMap<>();
        in.put("projectId", 999999);
        in.put("title", "고아 공문");
        ResponseEntity<Map<String, Object>> resp = send(HttpMethod.POST, "/api/official-docs", in, MAP);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void officialDoc_create_invalidCategory_400() {
        long projectId = createProject("잘못된 유형 공문");
        Map<String, Object> in = new HashMap<>();
        in.put("projectId", projectId);
        in.put("title", "x");
        in.put("category", "메모");
        ResponseEntity<Map<String, Object>> resp = send(HttpMethod.POST, "/api/official-docs", in, MAP);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void officialDoc_update_notFound_404() {
        ResponseEntity<Map<String, Object>> resp = send(HttpMethod.PATCH, "/api/official-docs/999999",
                Map.of("title", "x"), MAP);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void officialDoc_delete_notFound_404() {
        ResponseEntity<Map<String, Object>> resp = send(HttpMethod.DELETE, "/api/official-docs/999999", null, MAP);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void officialDoc_update_unknownField_400() {
        long projectId = createProject("공문 미지원키");
        Map<String, Object> in = new HashMap<>();
        in.put("projectId", projectId);
        in.put("title", "미지원키 문서");
        long docId = ((Number) send(HttpMethod.POST, "/api/official-docs", in, MAP).getBody().get("id")).longValue();

        // projectId 는 수정 불가(불변) → 400.
        ResponseEntity<Map<String, Object>> resp = send(HttpMethod.PATCH, "/api/official-docs/" + docId,
                Map.of("projectId", 3), MAP);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(resp.getBody().get("message").toString()).contains("허용되지 않는 필드");
    }
}
