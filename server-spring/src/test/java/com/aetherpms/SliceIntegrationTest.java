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
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.MariaDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Testcontainers-MariaDB 통합 테스트 — Flyway V1/V2 적용된 실제 MariaDB 11에서
 * 3 슬라이스가 Node 계약대로 동작하는지 검증. Docker가 있어야 실행된다.
 *
 *  1) GET /api/projects — mapProject shape + 컨소시엄 결합
 *  2) GET /api/projects/1/progress — 재귀 CTE 롤업 숫자(overall=50, fallback=false)
 *     + project 2 fallback=true(수동 progress_rate=35)
 *  3) POST /api/issues — 트랜잭션 쓰기 + I-{순번} 발번, 201, camelCase
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
@EnabledIf("dockerAvailable") // Docker 없으면 전체 클래스 스킵 → ./gradlew build 통과
class SliceIntegrationTest {

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

    @Test
    void getProjects_returnsMappedShapeWithConsortium() {
        ResponseEntity<List<Map<String, Object>>> resp = rest.exchange(
                "/api/projects", HttpMethod.GET, null,
                new ParameterizedTypeReference<>() {});
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        List<Map<String, Object>> body = resp.getBody();
        // V4 시드가 프로젝트 3건(1·2·3). 아래 단언은 body.get(0)=project 1 고정 검증.
        assertThat(body).hasSize(3);

        Map<String, Object> p1 = body.get(0);
        // camelCase 계약 필드 존재
        assertThat(p1).containsKeys("id", "projectCode", "name", "status", "stage",
                "progress", "consortiumMembers", "vrbInfo");
        // status KO→EN 변환
        assertThat(p1.get("status")).isEqualTo("In Progress");
        // 컨소시엄: 고객사 제외 → 2건
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> members = (List<Map<String, Object>>) p1.get("consortiumMembers");
        assertThat(members).hasSize(2);
        assertThat(members.get(0)).containsKeys("companyName", "role", "shareRate", "description");
    }

    @Test
    void progress_recursiveCteRollup_producesRealNumbers() {
        ResponseEntity<Map<String, Object>> resp = rest.exchange(
                "/api/projects/1/progress", HttpMethod.GET, null,
                new ParameterizedTypeReference<>() {});
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        Map<String, Object> body = resp.getBody();
        assertThat(body.get("projectId")).isEqualTo(1);
        // 대상 4 산출물 중 APPROVED 2 → 50
        assertThat(body.get("overall")).isEqualTo(50);
        assertThat(body.get("fallback")).isEqualTo(false);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> phases = (List<Map<String, Object>>) body.get("phases");
        assertThat(phases).hasSize(1);
        Map<String, Object> phase = phases.get(0);
        assertThat(phase.get("rate")).isEqualTo(50); // PHASE 롤업도 2/4
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> activities = (List<Map<String, Object>>) phase.get("activities");
        assertThat(activities).hasSize(1);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> tasks = (List<Map<String, Object>>) activities.get(0).get("tasks");
        assertThat(tasks).hasSize(2);
    }

    @Test
    void progress_fallback_usesManualRate() {
        ResponseEntity<Map<String, Object>> resp = rest.exchange(
                "/api/projects/2/progress", HttpMethod.GET, null,
                new ParameterizedTypeReference<>() {});
        Map<String, Object> body = resp.getBody();
        assertThat(body.get("fallback")).isEqualTo(true);
        assertThat(body.get("overall")).isEqualTo(35); // 수동 progress_rate
    }

    @Test
    void postIssue_writesTransactionallyAndAllocatesDisplayCode() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);

        Map<String, Object> payload = Map.of(
                "project_id", 1,
                "title", "테스트 이슈",
                "type", "이슈",
                "priority", "상");
        ResponseEntity<Map<String, Object>> first = rest.exchange(
                "/api/issues", HttpMethod.POST, new HttpEntity<>(payload, headers),
                new ParameterizedTypeReference<>() {});
        assertThat(first.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        Map<String, Object> issue = first.getBody();
        assertThat(issue).containsKeys("id", "projectId", "title", "type", "displayCode");
        assertThat(issue.get("displayCode")).isEqualTo("I-1");
        assertThat(issue.get("sourceRuleId")).isNull(); // 수동 등록

        // 두 번째 발번 → I-2 (동시성 카운터 증가)
        ResponseEntity<Map<String, Object>> second = rest.exchange(
                "/api/issues", HttpMethod.POST, new HttpEntity<>(payload, headers),
                new ParameterizedTypeReference<>() {});
        assertThat(second.getBody().get("displayCode")).isEqualTo("I-2");
    }

    @Test
    void postIssue_rejectsUnknownFieldWithKoreanMessage() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        Map<String, Object> payload = Map.of(
                "project_id", 1, "title", "x", "type", "이슈", "bogus", "y");
        ResponseEntity<Map<String, Object>> resp = rest.exchange(
                "/api/issues", HttpMethod.POST, new HttpEntity<>(payload, headers),
                new ParameterizedTypeReference<>() {});
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(resp.getBody().get("message").toString()).contains("허용되지 않는 필드");
    }
}
