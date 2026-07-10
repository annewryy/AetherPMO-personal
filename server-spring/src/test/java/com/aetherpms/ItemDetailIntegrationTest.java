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
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.MariaDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * 배치22 — 아이템 단건 조회 API 통합 테스트.
 * GET /api/issues|action-items|deliverables|tasks/{id} 4종.
 * 검증: (1) 존재 시 shape·값이 목록 아이템과 동일(같은 매퍼 재사용), (2) 없으면 404 {message}.
 * 시드(V2/V4) id 사용: issue 101(I-1), action 101(A-1), deliverable 101(D-1), task 1.
 * Docker 없으면 클래스 전체 스킵.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
@EnabledIf("dockerAvailable")
class ItemDetailIntegrationTest {

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

    private <T> T get(String path, ParameterizedTypeReference<T> type, HttpStatus expected) {
        ResponseEntity<T> resp = rest.exchange(path, HttpMethod.GET, null, type);
        assertThat(resp.getStatusCode()).isEqualTo(expected);
        return resp.getBody();
    }

    private Map<String, Object> getOne(String path) {
        return get(path, new ParameterizedTypeReference<>() {}, HttpStatus.OK);
    }

    private List<Map<String, Object>> getList(String path) {
        return get(path, new ParameterizedTypeReference<>() {}, HttpStatus.OK);
    }

    // ---- 이슈 --------------------------------------------------------------
    @Test
    void issueDetail_matchesListItem() {
        Map<String, Object> one = getOne("/api/issues/101");
        // 목록에서 같은 id(I-1) 항목을 찾아 완전 일치 확인 — 같은 매퍼 → shape·값 동일.
        Map<String, Object> fromList = getList("/api/projects/3/issues").stream()
                .filter(m -> Integer.valueOf(101).equals(m.get("id"))).findFirst().orElseThrow();
        assertThat(one).isEqualTo(fromList);
        assertThat(one).containsKeys("id", "projectId", "title", "type", "priority",
                "owner", "status", "displayCode", "relatedTaskId");
        assertThat(one.get("displayCode")).isEqualTo("I-1");
    }

    @Test
    void issueDetail_notFound_returns404() {
        Map<String, Object> body = get("/api/issues/999999",
                new ParameterizedTypeReference<>() {}, HttpStatus.NOT_FOUND);
        assertThat(body.get("message").toString()).contains("이슈를 찾을 수 없습니다");
    }

    // ---- 액션아이템 --------------------------------------------------------
    @Test
    void actionItemDetail_matchesListItem() {
        Map<String, Object> one = getOne("/api/action-items/101");
        Map<String, Object> fromList = getList("/api/projects/3/action-items").stream()
                .filter(m -> Integer.valueOf(101).equals(m.get("id"))).findFirst().orElseThrow();
        assertThat(one).isEqualTo(fromList);
        assertThat(one).containsKeys("id", "title", "assignee", "status",
                "displayCode", "relatedIssueId");
        assertThat(one.get("displayCode")).isEqualTo("A-1");
        assertThat(one.get("relatedIssueId")).isEqualTo(101);
    }

    @Test
    void actionItemDetail_notFound_returns404() {
        Map<String, Object> body = get("/api/action-items/999999",
                new ParameterizedTypeReference<>() {}, HttpStatus.NOT_FOUND);
        assertThat(body.get("message").toString()).contains("액션아이템을 찾을 수 없습니다");
    }

    // ---- 산출물 ------------------------------------------------------------
    @Test
    void deliverableDetail_matchesListItem() {
        Map<String, Object> one = getOne("/api/deliverables/101");
        Map<String, Object> fromList = getList("/api/projects/3/deliverables").stream()
                .filter(m -> Integer.valueOf(101).equals(m.get("id"))).findFirst().orElseThrow();
        assertThat(one).isEqualTo(fromList);
        // 상세 전이 표시에 필요한 status·displayCode 포함 확인.
        assertThat(one).containsKeys("id", "name", "category", "version",
                "status", "displayCode", "submitDate");
        assertThat(one.get("displayCode")).isEqualTo("D-1");
        assertThat(one.get("status")).isEqualTo("APPROVED");
    }

    @Test
    void deliverableDetail_notFound_returns404() {
        Map<String, Object> body = get("/api/deliverables/999999",
                new ParameterizedTypeReference<>() {}, HttpStatus.NOT_FOUND);
        assertThat(body.get("message").toString()).contains("산출물을 찾을 수 없습니다");
    }

    // ---- 태스크 ------------------------------------------------------------
    @Test
    void taskDetail_matchesListItem() {
        Map<String, Object> one = getOne("/api/tasks/1");
        Map<String, Object> fromList = getList("/api/projects/1/tasks").stream()
                .filter(m -> Integer.valueOf(1).equals(m.get("id"))).findFirst().orElseThrow();
        assertThat(one).isEqualTo(fromList);
        // 상세 전이/코멘트 표시에 필요한 status·displayCode·catalogNodeId 포함 확인.
        assertThat(one).containsKeys("id", "parentId", "projectId", "name",
                "status", "progress", "displayCode", "catalogNodeId");
        assertThat(one.get("status")).isEqualTo("IN_PROGRESS");
    }

    @Test
    void taskDetail_notFound_returns404() {
        Map<String, Object> body = get("/api/tasks/999999",
                new ParameterizedTypeReference<>() {}, HttpStatus.NOT_FOUND);
        assertThat(body.get("message").toString()).contains("태스크를 찾을 수 없습니다");
    }
}
