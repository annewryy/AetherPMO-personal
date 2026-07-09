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
 * 배치3 인력 마스터 — 조회(목록/상세/이력) + 저장 동기화(find-or-insert person) 통합 테스트.
 * V6/V7 마이그레이션(employment_type 5종 + pms_person 백필) 위에서 동작.
 * seed 프로젝트 3의 멤버 101(INTERNAL '김프로')·102(EXTERNAL '박외주')가 백필된다.
 * Docker 없으면 클래스 스킵.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
@EnabledIf("dockerAvailable")
class PersonsIntegrationTest {

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

    private static final ParameterizedTypeReference<Map<String, Object>> MAP = new ParameterizedTypeReference<>() {};
    private static final ParameterizedTypeReference<List<Map<String, Object>>> LIST = new ParameterizedTypeReference<>() {};

    private <T> ResponseEntity<T> send(HttpMethod method, String path, Object body,
                                       ParameterizedTypeReference<T> type) {
        HttpHeaders h = new HttpHeaders();
        h.set("Content-Type", "application/json");
        h.set("X-User-Id", "11111111-1111-1111-1111-111111111111");
        return rest.exchange(path, method, new HttpEntity<>(body, h), type);
    }

    // ---- 목록 ------------------------------------------------------------

    @Test
    void list_returnsBackfilledPersons_camelCase() {
        ResponseEntity<List<Map<String, Object>>> res =
                rest.exchange("/api/persons", HttpMethod.GET, null, LIST);
        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        List<Map<String, Object>> persons = res.getBody();
        assertThat(persons).isNotEmpty();
        Map<String, Object> first = persons.get(0);
        assertThat(first).containsKeys("personId", "source", "name", "employmentType",
                "status", "activeProjectCount");
        // seed 백필: 김프로(INTERNAL)·박외주(EXTERNAL) 존재.
        assertThat(persons.stream().map(p -> p.get("name")))
                .contains("김프로", "박외주");
    }

    @Test
    void list_filterByName() {
        ResponseEntity<List<Map<String, Object>>> res =
                rest.exchange("/api/persons?name=박외주", HttpMethod.GET, null, LIST);
        assertThat(res.getBody()).allMatch(p -> p.get("name").toString().contains("박외주"));
        assertThat(res.getBody()).isNotEmpty();
    }

    @Test
    void list_filterByEmploymentType_turnkey_afterOutsourcingMigration() {
        // 박외주는 outsourcing → V6에서 turnkey로 이관.
        ResponseEntity<List<Map<String, Object>>> res =
                rest.exchange("/api/persons?employmentTypes=turnkey", HttpMethod.GET, null, LIST);
        assertThat(res.getBody().stream().map(p -> p.get("name"))).contains("박외주");
        assertThat(res.getBody()).allMatch(p -> "turnkey".equals(p.get("employmentType")));
    }

    @Test
    void list_filterByProjectId_derivedFromMembership() {
        ResponseEntity<List<Map<String, Object>>> res =
                rest.exchange("/api/persons?projectId=3", HttpMethod.GET, null, LIST);
        assertThat(res.getBody().stream().map(p -> p.get("name")))
                .contains("김프로", "박외주");
    }

    @Test
    void list_invalidEmploymentType_400() {
        ResponseEntity<Map<String, Object>> res =
                rest.exchange("/api/persons?employmentTypes=bogus", HttpMethod.GET, null, MAP);
        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    // ---- 상세 + 이력 -----------------------------------------------------

    @Test
    void detail_and_projectHistory() {
        List<Map<String, Object>> persons =
                rest.exchange("/api/persons?name=김프로", HttpMethod.GET, null, LIST).getBody();
        long personId = ((Number) persons.get(0).get("personId")).longValue();

        ResponseEntity<Map<String, Object>> detail =
                rest.exchange("/api/persons/" + personId, HttpMethod.GET, null, MAP);
        assertThat(detail.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(detail.getBody().get("name")).isEqualTo("김프로");
        assertThat(detail.getBody()).containsKeys("source", "employmentType", "department", "status");

        ResponseEntity<List<Map<String, Object>>> history =
                rest.exchange("/api/persons/" + personId + "/projects", HttpMethod.GET, null, LIST);
        assertThat(history.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(history.getBody()).isNotEmpty();
        Map<String, Object> row = history.getBody().get(0);
        assertThat(row).containsKeys("projectId", "projectName", "role", "status");
        assertThat(row.get("projectId")).isEqualTo(3);
    }

    @Test
    void detail_notFound_404() {
        ResponseEntity<Map<String, Object>> res =
                rest.exchange("/api/persons/999999", HttpMethod.GET, null, MAP);
        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    // ---- 저장 동기화 (find-or-insert person) -----------------------------

    @Test
    void createMember_insertsNewPerson_thenReusesOnRepeat() {
        Map<String, Object> body = Map.of(
                "memberType", "EXTERNAL",
                "name", "신규프리",
                "employmentType", "freelancer",
                "participationRole", "DEV",
                "department", "개발팀");

        ResponseEntity<Map<String, Object>> first =
                send(HttpMethod.POST, "/api/projects/3/members", body, MAP);
        assertThat(first.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        Object personId1 = first.getBody().get("personId");
        assertThat(personId1).isNotNull();
        assertThat(first.getBody().get("employmentType")).isEqualTo("freelancer");

        // 동일 인력 재저장 → 같은 person 재사용(신규 insert 아님).
        ResponseEntity<Map<String, Object>> second =
                send(HttpMethod.POST, "/api/projects/3/members", body, MAP);
        assertThat(second.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(second.getBody().get("personId")).isEqualTo(personId1);

        // person이 인력관리 목록에도 노출.
        List<Map<String, Object>> found =
                rest.exchange("/api/persons?name=신규프리", HttpMethod.GET, null, LIST).getBody();
        assertThat(found).isNotEmpty();
        assertThat(found.get(0).get("employmentType")).isEqualTo("freelancer");
    }

    @Test
    void createMember_internalWithEmpNo_dedupBySabun() {
        Map<String, Object> body = Map.of(
                "memberType", "INTERNAL",
                "amaranthEmpNo", "EMP-9001",
                "name", "사번중복자",
                "employmentType", "regular");

        long p1 = ((Number) send(HttpMethod.POST, "/api/projects/3/members", body, MAP)
                .getBody().get("personId")).longValue();
        // 같은 사번, 다른 이름이어도 사번 키로 dedup.
        Map<String, Object> body2 = Map.of(
                "memberType", "INTERNAL",
                "amaranthEmpNo", "EMP-9001",
                "name", "사번중복자-개명",
                "employmentType", "regular");
        long p2 = ((Number) send(HttpMethod.POST, "/api/projects/3/members", body2, MAP)
                .getBody().get("personId")).longValue();
        assertThat(p2).isEqualTo(p1);
    }

    @Test
    void createMember_projectNotFound_404() {
        ResponseEntity<Map<String, Object>> res = send(HttpMethod.POST, "/api/projects/999999/members",
                Map.of("name", "x", "memberType", "EXTERNAL"), MAP);
        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void createMember_missingName_400() {
        ResponseEntity<Map<String, Object>> res = send(HttpMethod.POST, "/api/projects/3/members",
                Map.of("memberType", "EXTERNAL"), MAP);
        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }
}
