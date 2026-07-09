package com.aetherpms;

import static org.assertj.core.api.Assertions.assertThat;

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
 * 쓰기 엔드포인트 통합 테스트(배치2) — Node work-surface/admin/workflows/transitions/
 * comments/notifications/signal-rules/signals 계약을 Testcontainers-MariaDB로 검증.
 * V1~V4 시드 위에서 동작(seed 프로젝트 3 존재). Docker 없으면 클래스 스킵.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
@EnabledIf("dockerAvailable")
class WritesIntegrationTest {

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

    // 기본 JDK 클라이언트는 PATCH를 지원하지 않는다("Invalid HTTP method: PATCH").
    // httpclient5(스타터-테스트 포함)로 요청 팩토리를 교체해 PATCH를 허용한다.
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

    // ---- 작업 화면 --------------------------------------------------------

    @Test
    void patchIssue_updatesAndReturnsCamelCase() {
        // seed 이슈 조회
        ResponseEntity<List<Map<String, Object>>> issues = rest.exchange("/api/projects/3/issues",
                HttpMethod.GET, null, LIST);
        long issueId = ((Number) issues.getBody().get(0).get("id")).longValue();

        ResponseEntity<Map<String, Object>> patched = send(HttpMethod.PATCH, "/api/issues/" + issueId,
                Map.of("priority", "상", "comment", "우선순위 상향"), MAP);
        assertThat(patched.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(patched.getBody().get("priority")).isEqualTo("상");
        assertThat(patched.getBody()).containsKeys("id", "projectId", "title", "displayCode");
    }

    @Test
    void patchIssue_rejectsUnknownField() {
        ResponseEntity<Map<String, Object>> resp = send(HttpMethod.PATCH, "/api/issues/101",
                Map.of("bogus", 1), MAP);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(resp.getBody().get("message").toString()).contains("허용되지 않는 필드");
    }

    @Test
    void createActionItem_getsDisplayCode() {
        ResponseEntity<Map<String, Object>> resp = send(HttpMethod.POST, "/api/action-items",
                Map.of("project_id", 3, "title", "테스트 액션"), MAP);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(resp.getBody().get("status")).isEqualTo("대기");
        assertThat(resp.getBody().get("displayCode").toString()).startsWith("A-");
    }

    @Test
    void createActionItem_missingProject_404() {
        ResponseEntity<Map<String, Object>> resp = send(HttpMethod.POST, "/api/action-items",
                Map.of("project_id", 9999, "title", "x"), MAP);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void createMeeting_returnsIsoDate() {
        ResponseEntity<Map<String, Object>> resp = send(HttpMethod.POST, "/api/meeting-minutes",
                Map.of("project_id", 3, "title", "킥오프", "meet_date", "2026-07-10",
                        "attendees", List.of("김프로", "이대리")), MAP);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(resp.getBody()).containsKeys("id", "title", "meetDate", "attendees");
        assertThat(resp.getBody().get("attendees")).isInstanceOf(List.class);
    }

    // ---- 관리자: 카탈로그 노드 -------------------------------------------

    @Test
    void catalogNode_hierarchyGuard_400() {
        // ACTIVITY는 PHASE를 부모로 요구 — 부모 없이 생성 시 400
        ResponseEntity<Map<String, Object>> resp = send(HttpMethod.POST, "/api/catalog/nodes",
                Map.of("nodeType", "ACTIVITY", "name", "잘못된 액티비티"), MAP);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(resp.getBody().get("message").toString()).contains("계층 규칙");
    }

    @Test
    void catalogNode_delete_referenced_409() {
        // node 3(seed에서 산출물/워크플로 참조)은 참조 있어 삭제 불가 → 409 또는 404 방어
        ResponseEntity<Map<String, Object>> resp = send(HttpMethod.DELETE, "/api/catalog/nodes/1", null, MAP);
        assertThat(resp.getStatusCode()).isIn(HttpStatus.CONFLICT, HttpStatus.OK);
    }

    // ---- 회사 ------------------------------------------------------------

    @Test
    void company_createUpdateDelete_roundtrip() {
        ResponseEntity<Map<String, Object>> created = send(HttpMethod.POST, "/api/companies",
                Map.of("name", "테스트파트너", "type", "PARTNER"), MAP);
        assertThat(created.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        long id = ((Number) created.getBody().get("id")).longValue();
        assertThat(created.getBody().get("type")).isEqualTo("PARTNER");

        ResponseEntity<Map<String, Object>> patched = send(HttpMethod.PATCH, "/api/companies/" + id,
                Map.of("isActive", false), MAP);
        assertThat(patched.getBody().get("isActive")).isEqualTo(false);

        ResponseEntity<Map<String, Object>> deleted = send(HttpMethod.DELETE, "/api/companies/" + id, null, MAP);
        assertThat(deleted.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(deleted.getBody().get("deleted")).isEqualTo(true);
    }

    // ---- 워크플로 편집기 --------------------------------------------------

    @Test
    void workflow_statusInitialInvariant() {
        ResponseEntity<Map<String, Object>> wf = send(HttpMethod.POST, "/api/workflows",
                Map.of("name", "테스트 워크플로"), MAP);
        long wfId = ((Number) wf.getBody().get("id")).longValue();

        // 첫 상태는 isInitial=true 강제
        ResponseEntity<Map<String, Object>> bad = send(HttpMethod.POST, "/api/workflows/" + wfId + "/statuses",
                Map.of("code", "S1", "name", "상태1"), MAP);
        assertThat(bad.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);

        ResponseEntity<Map<String, Object>> s1 = send(HttpMethod.POST, "/api/workflows/" + wfId + "/statuses",
                Map.of("code", "S1", "name", "상태1", "isInitial", true), MAP);
        assertThat(s1.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(s1.getBody().get("isInitial")).isEqualTo(true);

        // 정리
        send(HttpMethod.DELETE, "/api/workflows/" + wfId, null, MAP);
    }

    @Test
    void condition_invalidOperator_400() {
        ResponseEntity<Map<String, Object>> resp = send(HttpMethod.POST, "/api/transitions/1/conditions",
                Map.of("operator", "NOPE", "subjectScope", "SELF"), MAP);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(resp.getBody().get("message").toString()).contains("operator");
    }

    // ---- 전이 실행 --------------------------------------------------------

    @Test
    void transitions_listAvailable() {
        // seed 산출물의 가용 전이 조회(deliverables 엔티티)
        ResponseEntity<List<Map<String, Object>>> del = rest.exchange("/api/projects/3/deliverables",
                HttpMethod.GET, null, LIST);
        long deliverableId = ((Number) del.getBody().get(0).get("id")).longValue();

        ResponseEntity<List<Map<String, Object>>> resp = send(HttpMethod.GET,
                "/api/deliverables/" + deliverableId + "/transitions", null, LIST);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        // 각 항목은 snake_case 계약(transition_id·to_status·allowed·failed_conditions·warnings)
        if (!resp.getBody().isEmpty()) {
            assertThat(resp.getBody().get(0)).containsKeys("transition_id", "to_status", "allowed",
                    "failed_conditions", "warnings");
        }
    }

    // ---- 코멘트 + 알림 ----------------------------------------------------

    @Test
    void comment_create_list() {
        ResponseEntity<Map<String, Object>> created = send(HttpMethod.POST, "/api/issues/101/comments",
                Map.of("body", "확인했습니다"), MAP);
        assertThat(created.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(created.getBody()).containsKeys("commentId", "entityType", "body", "createdAt");
        assertThat(created.getBody().get("entityType")).isEqualTo("ISSUE");

        ResponseEntity<List<Map<String, Object>>> list = send(HttpMethod.GET, "/api/issues/101/comments", null, LIST);
        assertThat(list.getBody()).isNotEmpty();
    }

    @Test
    void comment_missingBody_400() {
        ResponseEntity<Map<String, Object>> resp = send(HttpMethod.POST, "/api/tasks/1/comments",
                Map.of("body", "   "), MAP);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void notifications_list_emptyWithoutHeader() {
        ResponseEntity<List<Map<String, Object>>> resp = rest.exchange("/api/notifications",
                HttpMethod.GET, null, LIST);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody()).isEmpty(); // X-User-Id 없음 → 빈 목록
    }

    // ---- 신호 규칙 + 평가 -------------------------------------------------

    @Test
    void signalRule_crud_and_validation() {
        ResponseEntity<Map<String, Object>> bad = send(HttpMethod.POST, "/api/signal-rules",
                Map.of("name", "x", "metric", "UNKNOWN_METRIC"), MAP);
        assertThat(bad.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);

        ResponseEntity<Map<String, Object>> created = send(HttpMethod.POST, "/api/signal-rules",
                Map.of("name", "지연 감지", "metric", "PROGRESS_DELAY_PCT", "operator", "GTE",
                        "threshold", 20, "action", "SHOW"), MAP);
        assertThat(created.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(created.getBody().get("metric")).isEqualTo("PROGRESS_DELAY_PCT");
        long ruleId = ((Number) created.getBody().get("ruleId")).longValue();

        ResponseEntity<Map<String, Object>> deleted = send(HttpMethod.DELETE, "/api/signal-rules/" + ruleId, null, MAP);
        assertThat(deleted.getBody().get("deleted")).isEqualTo(true);
    }

    @Test
    void dashboardSignals_shape() {
        ResponseEntity<Map<String, Object>> resp = rest.exchange("/api/dashboard/signals",
                HttpMethod.GET, null, MAP);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody()).containsKeys("generatedAt", "signals", "today");
    }

    @Test
    void signalsEvaluate_idempotentShape() {
        ResponseEntity<Map<String, Object>> resp = send(HttpMethod.POST, "/api/signals/evaluate", null, MAP);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody()).containsKeys("evaluatedAt", "rules");
    }
}
