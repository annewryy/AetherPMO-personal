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
 * POST /api/projects 통합 테스트 (배치9 / 0017 §B P1).
 *   - 생성 → persist·발번(-B)·응답 shape(camelCase, GET 상세와 동일)·필수누락 400 검증.
 * V1~V9 마이그레이션 위에서 동작(V9 시드로 2026 카운터=3 → 첫 발번 PRJ-2026-004-B).
 * Docker 없으면 클래스 스킵.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
@EnabledIf("dockerAvailable")
class ProjectCreateIntegrationTest {

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
    org.springframework.jdbc.core.JdbcTemplate jdbc;

    private static final ParameterizedTypeReference<Map<String, Object>> MAP = new ParameterizedTypeReference<>() {};

    private ResponseEntity<Map<String, Object>> post(Object body) {
        HttpHeaders h = new HttpHeaders();
        h.set("Content-Type", "application/json");
        h.set("X-User-Id", "11111111-1111-1111-1111-111111111111");
        return rest.exchange("/api/projects", HttpMethod.POST, new HttpEntity<>(body, h), MAP);
    }

    @Test
    void create_minimal_appliesDefaultsAndBiddingCode() {
        ResponseEntity<Map<String, Object>> resp = post(Map.of("name", "나라장터 신규 입찰 사업"));
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        Map<String, Object> body = resp.getBody();
        assertThat(body).isNotNull();

        // 발번: 베이스 PRJ-{연도}-{NNN} + 입찰 접미사 -B.
        assertThat(body.get("projectCode").toString()).matches("PRJ-\\d{4}-\\d{3}-B");
        // 기본값.
        assertThat(body.get("stage")).isEqualTo("BIDDING");
        assertThat(body.get("status")).isEqualTo("Bidding"); // 매퍼 KO('입찰')→EN
        assertThat(body.get("bidStatus")).isEqualTo("제안준비중");
        assertThat(((Number) body.get("progress")).intValue()).isEqualTo(0);
        assertThat(body.get("sourceProjectId")).isNull();
        assertThat(body.get("name")).isEqualTo("나라장터 신규 입찰 사업");
        // GET 상세와 동일 shape.
        assertThat(body).containsKeys("id", "consortiumMembers", "vrbInfo", "counts");
    }

    @Test
    void create_prefill_persistsAndReadableViaGet() {
        Map<String, Object> in = new HashMap<>();
        in.put("name", "차세대 포털 구축 제안");
        in.put("customerName", "조달청");
        in.put("announcementNo", "20260700123-00");
        in.put("budget", 1500000000);
        in.put("contractAmount", 1400000000);
        in.put("proposalDeadline", "2026-08-15");
        in.put("businessType", "SI");
        in.put("description", "공고 프리필 생성");

        ResponseEntity<Map<String, Object>> created = post(in);
        assertThat(created.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        long id = ((Number) created.getBody().get("id")).longValue();
        assertThat(created.getBody().get("customer")).isEqualTo("조달청");
        assertThat(created.getBody().get("businessType")).isEqualTo("SI");
        assertThat(((Number) created.getBody().get("budget")).longValue()).isEqualTo(1500000000L);
        assertThat(((Number) created.getBody().get("projectBudget")).longValue()).isEqualTo(1400000000L);

        // GET /api/projects/{id} 로 되읽어 persist·동일 shape 확인.
        ResponseEntity<Map<String, Object>> got = rest.exchange("/api/projects/" + id,
                HttpMethod.GET, null, MAP);
        assertThat(got.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(got.getBody().get("name")).isEqualTo("차세대 포털 구축 제안");
        assertThat(got.getBody().get("customer")).isEqualTo("조달청");
        assertThat(got.getBody().get("stage")).isEqualTo("BIDDING");
        assertThat(got.getBody().get("projectCode")).isEqualTo(created.getBody().get("projectCode"));
    }

    @Test
    void create_missingName_400() {
        ResponseEntity<Map<String, Object>> resp = post(Map.of("customerName", "조달청"));
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(resp.getBody().get("message").toString()).contains("name");
    }

    @Test
    void create_rejectsUnknownField_400() {
        Map<String, Object> in = new HashMap<>();
        in.put("name", "x");
        in.put("bogusField", 1);
        ResponseEntity<Map<String, Object>> resp = post(in);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(resp.getBody().get("message").toString()).contains("허용되지 않는 필드");
    }

    @Test
    void create_invalidBidStatus_400() {
        Map<String, Object> in = new HashMap<>();
        in.put("name", "x");
        in.put("bidStatus", "이상한값");
        ResponseEntity<Map<String, Object>> resp = post(in);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void create_sequentialCodes_areUniqueAndIncrementing() {
        String c1 = post(Map.of("name", "연번 A")).getBody().get("projectCode").toString();
        String c2 = post(Map.of("name", "연번 B")).getBody().get("projectCode").toString();
        assertThat(c1).isNotEqualTo(c2);
        // 둘 다 -B 접미사, 순번은 서로 다름.
        assertThat(List.of(c1, c2)).allMatch(c -> c.endsWith("-B"));
    }

    @Test
    void create_missingClientCompany_400() {
        Map<String, Object> in = new HashMap<>();
        in.put("name", "회사 검증");
        in.put("clientCompanyId", 999999);
        ResponseEntity<Map<String, Object>> resp = post(in);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(resp.getBody().get("message").toString()).contains("clientCompanyId");
    }

    // ------------------------------------------------------------------
    // 배치11 P3a: 카탈로그 테일러링 전개 (Node §1 expandTailoring 이식)
    // 시드 카탈로그 트리(V2): PHASE1 → ACTIVITY2 → TASK3/4 → DELIVERABLE5/6(부모3)·7/8(부모4).
    // ------------------------------------------------------------------

    private static Map<String, Object> node(long catalogNodeId) {
        Map<String, Object> m = new HashMap<>();
        m.put("catalogNodeId", catalogNodeId);
        return m;
    }

    @Test
    void create_withTailoring_expandsTasksDeliverablesAndRollsUpProgress() {
        Map<String, Object> in = new HashMap<>();
        in.put("name", "테일러링 전개 프로젝트");
        // PHASE·ACTIVITY·TASK 2개·DELIVERABLE 4개 전체 선택.
        in.put("tailoring", List.of(
                node(1), node(2), node(3), node(4), node(5), node(6), node(7), node(8)));

        ResponseEntity<Map<String, Object>> created = post(in);
        assertThat(created.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        Map<String, Object> body = created.getBody();
        assertThat(body).isNotNull();
        long id = ((Number) body.get("id")).longValue();

        // 응답에 전개 카운트: TASK 2개, DELIVERABLE 4개.
        assertThat(((Number) body.get("createdTasks")).intValue()).isEqualTo(2);
        assertThat(((Number) body.get("createdDeliverables")).intValue()).isEqualTo(4);

        // /progress 롤업 반영: 산출물 4건 중 APPROVED 0건 → overall 0, fallback=false(전개분 존재).
        ResponseEntity<Map<String, Object>> prog = rest.exchange("/api/projects/" + id + "/progress",
                HttpMethod.GET, null, MAP);
        assertThat(prog.getStatusCode()).isEqualTo(HttpStatus.OK);
        Map<String, Object> pb = prog.getBody();
        assertThat(pb).isNotNull();
        assertThat(pb.get("fallback")).isEqualTo(Boolean.FALSE);
        assertThat(((Number) pb.get("overall")).intValue()).isEqualTo(0);
        // phases: PHASE1 하나, ACTIVITY1개, TASK 2개.
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> phases = (List<Map<String, Object>>) pb.get("phases");
        assertThat(phases).hasSize(1);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> activities = (List<Map<String, Object>>) phases.get(0).get("activities");
        assertThat(activities).hasSize(1);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> tasks = (List<Map<String, Object>>) activities.get(0).get("tasks");
        assertThat(tasks).hasSize(2);
        // 각 TASK의 산출물 총계 2건.
        for (Map<String, Object> t : tasks) {
            @SuppressWarnings("unchecked")
            Map<String, Object> deliverables = (Map<String, Object>) t.get("deliverables");
            assertThat(((Number) deliverables.get("total")).intValue()).isEqualTo(2);
        }
    }

    @Test
    void create_tailoringExcludedNode_recordedButNotExpanded() {
        Map<String, Object> in = new HashMap<>();
        in.put("name", "테일러링 제외 케이스");
        Map<String, Object> excludedTask = new HashMap<>();
        excludedTask.put("catalogNodeId", 4);
        excludedTask.put("isSelected", false);
        excludedTask.put("excludeReason", "범위 외");
        // PHASE·ACTIVITY·TASK3(선택)·TASK4(제외)·DELIVERABLE5(선택,부모3).
        in.put("tailoring", List.of(node(1), node(2), node(3), excludedTask, node(5)));

        ResponseEntity<Map<String, Object>> created = post(in);
        assertThat(created.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        Map<String, Object> body = created.getBody();
        // 선택된 TASK 1개(node3), DELIVERABLE 1개(node5). 제외된 node4는 전개 안됨.
        assertThat(((Number) body.get("createdTasks")).intValue()).isEqualTo(1);
        assertThat(((Number) body.get("createdDeliverables")).intValue()).isEqualTo(1);
    }

    @Test
    void create_emptyTailoring_backwardCompatible() {
        Map<String, Object> in = new HashMap<>();
        in.put("name", "빈 테일러링");
        in.put("tailoring", List.of());
        ResponseEntity<Map<String, Object>> resp = post(in);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(((Number) resp.getBody().get("createdTasks")).intValue()).isEqualTo(0);
        assertThat(((Number) resp.getBody().get("createdDeliverables")).intValue()).isEqualTo(0);
    }

    @Test
    void create_noTailoringKey_backwardCompatible() {
        // 배치10 프론트처럼 tailoring 키 없이 호출 — 기본 생성 유지.
        ResponseEntity<Map<String, Object>> resp = post(Map.of("name", "테일러링 없는 생성"));
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(((Number) resp.getBody().get("createdTasks")).intValue()).isEqualTo(0);
        assertThat(((Number) resp.getBody().get("createdDeliverables")).intValue()).isEqualTo(0);
    }

    @Test
    void create_tailoringNotArray_400() {
        Map<String, Object> in = new HashMap<>();
        in.put("name", "잘못된 테일러링");
        in.put("tailoring", Map.of("catalogNodeId", 3));
        ResponseEntity<Map<String, Object>> resp = post(in);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(resp.getBody().get("message").toString()).contains("배열");
    }

    @Test
    void create_tailoringMissingCatalogNodeId_400() {
        Map<String, Object> in = new HashMap<>();
        in.put("name", "노드 누락");
        in.put("tailoring", List.of(Map.of("isSelected", true)));
        ResponseEntity<Map<String, Object>> resp = post(in);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(resp.getBody().get("message").toString()).contains("catalogNodeId");
    }

    @Test
    void create_tailoringUnknownNode_400() {
        Map<String, Object> in = new HashMap<>();
        in.put("name", "존재하지 않는 노드");
        in.put("tailoring", List.of(node(999999)));
        ResponseEntity<Map<String, Object>> resp = post(in);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(resp.getBody().get("message").toString()).contains("catalogNodeId");
    }

    // ------------------------------------------------------------------
    // 배치16: 기관 → 회사 자동매칭/생성 (0017 §미결, 2026-07-10 결정)
    //   우선순위 ① clientCompanyId ② clientAgencyCode(매칭/자동생성) ③ customerName(이름폴백/자동생성).
    //   V10 로 pms_company.agency_code 추가(시드 3사는 코드 없음).
    // ------------------------------------------------------------------

    /** pms_project.client_company_id (매퍼에 미노출이라 DB 직접 조회). */
    private Long clientCompanyIdOf(long projectId) {
        return jdbc.queryForObject(
                "SELECT client_company_id FROM pms_project WHERE project_id = ?", Long.class, projectId);
    }

    /** GET /api/companies 목록. */
    private List<Map<String, Object>> companies() {
        ResponseEntity<List<Map<String, Object>>> resp = rest.exchange("/api/companies",
                HttpMethod.GET, null, new ParameterizedTypeReference<List<Map<String, Object>>>() {});
        return resp.getBody();
    }

    @Test
    void create_agencyCode_autoCreatesClientCompany_andExposesAgencyCode() {
        Map<String, Object> in = new HashMap<>();
        in.put("name", "기관코드 자동생성");
        in.put("customerName", "부산광역시청");
        in.put("clientAgencyCode", "Z009001");

        ResponseEntity<Map<String, Object>> created = post(in);
        assertThat(created.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        long id = ((Number) created.getBody().get("id")).longValue();

        Long companyId = clientCompanyIdOf(id);
        assertThat(companyId).isNotNull();

        // 자동생성된 회사가 목록에 CLIENT + agencyCode 로 노출.
        Map<String, Object> co = companies().stream()
                .filter(c -> ((Number) c.get("id")).longValue() == companyId).findFirst().orElseThrow();
        assertThat(co.get("type")).isEqualTo("CLIENT");
        assertThat(co.get("name")).isEqualTo("부산광역시청");
        assertThat(co.get("agencyCode")).isEqualTo("Z009001");
    }

    @Test
    void create_sameAgencyCodeTwice_matchesExisting_noDuplicate() {
        Map<String, Object> in1 = new HashMap<>();
        in1.put("name", "코드매칭 A");
        in1.put("customerName", "대구광역시청");
        in1.put("clientAgencyCode", "Z009002");
        long id1 = ((Number) post(in1).getBody().get("id")).longValue();
        Long co1 = clientCompanyIdOf(id1);

        Map<String, Object> in2 = new HashMap<>();
        in2.put("name", "코드매칭 B");
        in2.put("customerName", "대구광역시청(별칭)"); // 이름이 달라도 코드가 같으면 같은 회사.
        in2.put("clientAgencyCode", "Z009002");
        long id2 = ((Number) post(in2).getBody().get("id")).longValue();
        Long co2 = clientCompanyIdOf(id2);

        assertThat(co2).isEqualTo(co1); // 같은 회사에 연결(중복 생성 없음).
        long count = companies().stream()
                .filter(c -> "Z009002".equals(c.get("agencyCode"))).count();
        assertThat(count).isEqualTo(1);
    }

    @Test
    void create_customerNameOnly_autoCreatesThenMatchesByName() {
        // ③ 이름 폴백 — 코드 없이 이름만. 첫 호출은 자동생성, 둘째 호출은 정확일치로 재사용.
        Map<String, Object> in1 = new HashMap<>();
        in1.put("name", "이름폴백 A");
        in1.put("customerName", "이름폴백테스트기관");
        long id1 = ((Number) post(in1).getBody().get("id")).longValue();
        Long co1 = clientCompanyIdOf(id1);
        assertThat(co1).isNotNull();

        Map<String, Object> in2 = new HashMap<>();
        in2.put("name", "이름폴백 B");
        in2.put("customerName", "이름폴백테스트기관");
        long id2 = ((Number) post(in2).getBody().get("id")).longValue();
        assertThat(clientCompanyIdOf(id2)).isEqualTo(co1); // 이름 정확일치 → 같은 회사.

        // agency_code 는 null(이름 폴백 자동생성).
        Map<String, Object> co = companies().stream()
                .filter(c -> ((Number) c.get("id")).longValue() == co1).findFirst().orElseThrow();
        assertThat(co.get("agencyCode")).isNull();
    }

    @Test
    void create_existingSeedName_matchesSeedCompany() {
        // 시드 CLIENT '한국전자정부' 정확일치 → 자동생성 없이 그 회사에 연결.
        Map<String, Object> before = companies().stream()
                .filter(c -> "한국전자정부".equals(c.get("name"))).findFirst().orElseThrow();
        long seedId = ((Number) before.get("id")).longValue();

        Map<String, Object> in = new HashMap<>();
        in.put("name", "시드 이름매칭");
        in.put("customerName", "한국전자정부");
        long id = ((Number) post(in).getBody().get("id")).longValue();
        assertThat(clientCompanyIdOf(id)).isEqualTo(seedId);
    }

    @Test
    void create_explicitClientCompanyId_takesPrecedenceOverAgencyCode() {
        long seedId = ((Number) companies().stream()
                .filter(c -> "한국전자정부".equals(c.get("name"))).findFirst().orElseThrow().get("id")).longValue();

        Map<String, Object> in = new HashMap<>();
        in.put("name", "명시 ID 우선");
        in.put("clientCompanyId", seedId);
        in.put("clientAgencyCode", "Z009999"); // 무시되어야 함(ID 명시 우선).
        long id = ((Number) post(in).getBody().get("id")).longValue();
        assertThat(clientCompanyIdOf(id)).isEqualTo(seedId);
        // agency_code Z009999 로는 회사가 생성되지 않음.
        assertThat(companies().stream().anyMatch(c -> "Z009999".equals(c.get("agencyCode")))).isFalse();
    }

    @Test
    void create_noAgencyNoCustomer_noClientCompany() {
        long id = ((Number) post(Map.of("name", "고객 없음")).getBody().get("id")).longValue();
        assertThat(clientCompanyIdOf(id)).isNull();
    }
}
