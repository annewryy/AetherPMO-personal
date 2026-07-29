package com.aetherpms;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.MariaDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * 0040 — 엔티티 간 N:M 연결(pms_entity_link 단일화) 통합 테스트.
 *
 * <p>계약 자체는 통합 전과 동일하다. 여기서 지키는 것은 (1) 왕복·역방향 가시성(정규 순서가
 * 제대로 동작하는가), (2) 부분 갱신 시 다른 타입 연결이 살아남는가(= 이번 작업 최대의 함정),
 * (3) 간선 1개가 정말 행 1개로만 저장되는가 이다.
 *
 * <p>태스크·산출물은 생성 엔드포인트가 없어 JDBC로 직접 넣는다. Docker 없으면 클래스 전체 스킵.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
@EnabledIf("dockerAvailable")
class EntityLinkIntegrationTest {

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

    @Autowired
    JdbcTemplate jdbc;

    // 기본 JDK 클라이언트는 PATCH 미지원 → httpclient5 팩토리로 교체.
    @org.junit.jupiter.api.BeforeEach
    void enablePatch() {
        rest.getRestTemplate().setRequestFactory(
                new org.springframework.http.client.HttpComponentsClientHttpRequestFactory());
    }

    private static final ParameterizedTypeReference<Map<String, Object>> MAP = new ParameterizedTypeReference<>() {};

    private ResponseEntity<Map<String, Object>> send(HttpMethod method, String path, Object body) {
        HttpHeaders h = new HttpHeaders();
        h.set("Content-Type", "application/json");
        h.set("X-User-Id", "11111111-1111-1111-1111-111111111111");
        return rest.exchange(path, method, new HttpEntity<>(body, h), MAP);
    }

    private Map<String, Object> ok(HttpMethod method, String path, Object body) {
        ResponseEntity<Map<String, Object>> resp = send(method, path, body);
        assertThat(resp.getStatusCode().is2xxSuccessful())
                .as("응답 %s %s → %s / %s", method, path, resp.getStatusCode(), resp.getBody())
                .isTrue();
        return resp.getBody();
    }

    private Map<String, Object> get(String path) {
        ResponseEntity<Map<String, Object>> resp = rest.exchange(path, HttpMethod.GET, null, MAP);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        return resp.getBody();
    }

    /** 응답의 링크 키를 Long 목록으로. 키가 없으면 실패(빈 배열이어야지 null/부재는 계약 위반). */
    private static List<Long> ids(Map<String, Object> body, String key) {
        assertThat(body).as("응답에 %s 키가 있어야 한다: %s", key, body).containsKey(key);
        List<Long> out = new ArrayList<>();
        for (Object o : (List<?>) body.get(key)) out.add(((Number) o).longValue());
        return out;
    }

    // ---- 픽스처 ------------------------------------------------------------

    private long createProject(String name) {
        // 사업번호는 필수 입력(2026-07-29) — 테스트마다 고유값.
        Map<String, Object> body = Map.of("name", name, "projectCode", "EL-" + System.nanoTime());
        return ((Number) ok(HttpMethod.POST, "/api/projects", body).get("id")).longValue();
    }

    /** 태스크 생성 엔드포인트가 없어 직접 INSERT. 이름을 고유하게 잡아 되읽는다. */
    private long insertTask(long projectId, String name) {
        jdbc.update("INSERT INTO pms_task (project_id, task_name) VALUES (?, ?)", projectId, name);
        return jdbc.queryForObject(
                "SELECT task_id FROM pms_task WHERE project_id = ? AND task_name = ?",
                Long.class, projectId, name);
    }

    private long insertDeliverable(long projectId, String name) {
        jdbc.update("INSERT INTO pms_deliverable (project_id, deliverable_name) VALUES (?, ?)", projectId, name);
        return jdbc.queryForObject(
                "SELECT deliverable_id FROM pms_deliverable WHERE project_id = ? AND deliverable_name = ?",
                Long.class, projectId, name);
    }

    private Map<String, Object> createIssue(long projectId, String title, Map<String, Object> links) {
        Map<String, Object> body = new HashMap<>();
        body.put("project_id", projectId);
        body.put("title", title);
        body.put("type", "리스크");
        body.putAll(links);
        return ok(HttpMethod.POST, "/api/issues", body);
    }

    private Map<String, Object> createMeeting(long projectId, String title, Map<String, Object> links) {
        Map<String, Object> body = new HashMap<>();
        body.put("project_id", projectId);
        body.put("title", title);
        body.put("meet_date", "2026-07-28");
        body.putAll(links);
        return ok(HttpMethod.POST, "/api/meeting-minutes", body);
    }

    private Map<String, Object> createAction(long projectId, String title, Map<String, Object> links) {
        Map<String, Object> body = new HashMap<>();
        body.put("project_id", projectId);
        body.put("title", title);
        body.putAll(links);
        return ok(HttpMethod.POST, "/api/action-items", body);
    }

    private static long id(Map<String, Object> body) {
        return ((Number) body.get("id")).longValue();
    }

    // ===================================================================
    // 1. 왕복 — 이슈 create에 실은 task_ids가 상세 조회에 그대로 보인다.
    // ===================================================================
    @Test
    void issueCreate_withTaskIds_roundTrips() {
        long pid = createProject("0040 왕복");
        long t1 = insertTask(pid, "0040-왕복-T1");
        long t2 = insertTask(pid, "0040-왕복-T2");

        long issueId = id(createIssue(pid, "왕복 이슈", Map.of("task_ids", List.of(t1, t2))));

        assertThat(ids(get("/api/issues/" + issueId), "taskIds")).containsExactly(t1, t2);
    }

    // ===================================================================
    // 2. 역방향 가시성 — 이슈 쪽에서 건 연결이 태스크 상세에서도 보인다(정규 순서 핵심 케이스).
    // ===================================================================
    @Test
    void linkFromIssue_isVisibleFromTaskSide() {
        long pid = createProject("0040 역방향");
        long t1 = insertTask(pid, "0040-역방향-T1");

        long issueId = id(createIssue(pid, "역방향 이슈", Map.of("task_ids", List.of(t1))));

        assertThat(ids(get("/api/tasks/" + t1), "issueIds")).contains(issueId);
    }

    // ===================================================================
    // 3. 부분 갱신 격리 — task_ids만 PATCH해도 meeting_ids가 보존된다.
    // ===================================================================
    @Test
    void patchOneLinkType_keepsOtherLinkTypes() {
        long pid = createProject("0040 부분갱신");
        long t1 = insertTask(pid, "0040-부분-T1");
        long t2 = insertTask(pid, "0040-부분-T2");
        long meetingId = id(createMeeting(pid, "부분갱신 회의", Map.of()));

        long issueId = id(createIssue(pid, "부분갱신 이슈",
                Map.of("task_ids", List.of(t1), "meeting_ids", List.of(meetingId))));

        ok(HttpMethod.PATCH, "/api/issues/" + issueId, Map.of("task_ids", List.of(t2)));

        Map<String, Object> after = get("/api/issues/" + issueId);
        assertThat(ids(after, "taskIds")).containsExactly(t2);
        assertThat(ids(after, "meetingIds")).containsExactly(meetingId);
    }

    // ===================================================================
    // 4. 전부 해제 — 빈 배열은 그 타입만 전부 끊고 다른 타입은 유지.
    // ===================================================================
    @Test
    void patchEmptyArray_clearsOnlyThatType() {
        long pid = createProject("0040 전부해제");
        long t1 = insertTask(pid, "0040-해제-T1");
        long meetingId = id(createMeeting(pid, "해제 회의", Map.of()));

        long issueId = id(createIssue(pid, "해제 이슈",
                Map.of("task_ids", List.of(t1), "meeting_ids", List.of(meetingId))));

        ok(HttpMethod.PATCH, "/api/issues/" + issueId, Map.of("task_ids", List.of()));

        Map<String, Object> after = get("/api/issues/" + issueId);
        assertThat(ids(after, "taskIds")).isEmpty();
        assertThat(ids(after, "meetingIds")).containsExactly(meetingId);
    }

    // ===================================================================
    // 5. 키 미전송 시 유지 — status만 PATCH하면 링크는 불변.
    // ===================================================================
    @Test
    void patchWithoutLinkKeys_keepsLinks() {
        long pid = createProject("0040 키미전송");
        long t1 = insertTask(pid, "0040-미전송-T1");

        long issueId = id(createIssue(pid, "미전송 이슈", Map.of("task_ids", List.of(t1))));

        Map<String, Object> patched = ok(HttpMethod.PATCH, "/api/issues/" + issueId, Map.of("status", "조치중"));
        assertThat(ids(patched, "taskIds")).containsExactly(t1);
        assertThat(ids(get("/api/issues/" + issueId), "taskIds")).containsExactly(t1);
    }

    // ===================================================================
    // 6. 크로스 프로젝트 거부 — 타 프로젝트 태스크는 400.
    // ===================================================================
    @Test
    void crossProjectId_rejectedWith400() {
        long pidA = createProject("0040 크로스A");
        long pidB = createProject("0040 크로스B");
        long foreignTask = insertTask(pidB, "0040-크로스-B-T1");

        Map<String, Object> body = new HashMap<>();
        body.put("project_id", pidA);
        body.put("title", "크로스 이슈");
        body.put("type", "리스크");
        body.put("task_ids", List.of(foreignTask));

        ResponseEntity<Map<String, Object>> resp = send(HttpMethod.POST, "/api/issues", body);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(resp.getBody().get("message").toString())
                .contains("이 프로젝트 소속이 아닌 값이 있습니다");
    }

    // ===================================================================
    // 7. 중복 입력 멱등 — 같은 id를 두 번 보내도 결과는 1건, UNIQUE 위반 없음.
    // ===================================================================
    @Test
    void duplicateIdsInPayload_areIdempotent() {
        long pid = createProject("0040 중복");
        long t1 = insertTask(pid, "0040-중복-T1");

        Map<String, Object> created = createIssue(pid, "중복 이슈", Map.of("task_ids", List.of(t1, t1)));
        assertThat(ids(created, "taskIds")).containsExactly(t1);
        assertThat(ids(get("/api/issues/" + id(created)), "taskIds")).containsExactly(t1);
    }

    // ===================================================================
    // 8. 양방향 동일 간선 — 어느 쪽에서 걸든 행은 1개(정규 순서 저장).
    // ===================================================================
    @Test
    void sameEdgeFromBothSides_staysOneRow() {
        long pid = createProject("0040 단일간선");
        long actionId = id(createAction(pid, "단일간선 액션", Map.of()));
        long issueId = id(createIssue(pid, "단일간선 이슈", Map.of("action_ids", List.of(actionId))));

        assertThat(edgeCount(issueId, actionId)).isEqualTo(1);
        assertThat(ids(get("/api/action-items/" + actionId), "issueIds")).contains(issueId);

        // 반대 방향에서 같은 연결을 다시 건다 → 행이 늘어나면 안 된다.
        ok(HttpMethod.PATCH, "/api/action-items/" + actionId, Map.of("issue_ids", List.of(issueId)));

        assertThat(edgeCount(issueId, actionId)).isEqualTo(1);
        assertThat(ids(get("/api/issues/" + issueId), "actionItemIds")).contains(actionId);
    }

    /** ISSUE↔ACTION_ITEM 간선을 방향 무관하게 센다. */
    private int edgeCount(long issueId, long actionId) {
        return jdbc.queryForObject("""
                SELECT COUNT(*) FROM pms_entity_link
                 WHERE ( (src_type='ISSUE' AND src_id=? AND dst_type='ACTION_ITEM' AND dst_id=?)
                      OR (src_type='ACTION_ITEM' AND src_id=? AND dst_type='ISSUE' AND dst_id=?) )""",
                Integer.class, issueId, actionId, actionId, issueId);
    }

    // ===================================================================
    // 9. 회의록 4종 동시 — createMeeting에 4개 배열 전부.
    // ===================================================================
    @Test
    void meetingCreate_withAllFourLinkTypes() {
        long pid = createProject("0040 회의4종");
        long t1 = insertTask(pid, "0040-회의4종-T1");
        long d1 = insertDeliverable(pid, "0040-회의4종-D1");
        long issueId = id(createIssue(pid, "회의4종 이슈", Map.of()));
        long actionId = id(createAction(pid, "회의4종 액션", Map.of()));

        Map<String, Object> links = new HashMap<>();
        links.put("issue_ids", List.of(issueId));
        links.put("task_ids", List.of(t1));
        links.put("deliverable_ids", List.of(d1));
        links.put("action_ids", List.of(actionId));
        Map<String, Object> created = createMeeting(pid, "4종 회의", links);

        assertThat(ids(created, "issueIds")).containsExactly(issueId);
        assertThat(ids(created, "taskIds")).containsExactly(t1);
        assertThat(ids(created, "deliverableIds")).containsExactly(d1);
        assertThat(ids(created, "actionItemIds")).containsExactly(actionId);

        Map<String, Object> fetched = get("/api/meeting-minutes/" + id(created));
        assertThat(ids(fetched, "issueIds")).containsExactly(issueId);
        assertThat(ids(fetched, "taskIds")).containsExactly(t1);
        assertThat(ids(fetched, "deliverableIds")).containsExactly(d1);
        assertThat(ids(fetched, "actionItemIds")).containsExactly(actionId);
    }
}
