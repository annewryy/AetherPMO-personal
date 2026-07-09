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
 * Testcontainers-MariaDB 통합 테스트 — 전체 읽기 엔드포인트(reads.ts 계약).
 * Flyway V1~V4 전체 적용 + ddl-auto=validate 통과(컨텍스트 부팅 자체가 검증) +
 * 대표 읽기 응답 shape 검증(프로젝트 상세·서브리소스·catalog tree·workflows·companies).
 * Docker 없으면 클래스 전체 스킵 → ./gradlew build 통과.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
@EnabledIf("dockerAvailable")
class ReadsIntegrationTest {

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

    @Test
    void projectDetail_hasConsortiumVrbCounts() {
        Map<String, Object> body = get("/api/projects/3",
                new ParameterizedTypeReference<>() {}, HttpStatus.OK);
        assertThat(body).containsKeys("id", "name", "status", "consortiumMembers", "vrbInfo", "counts");
        assertThat(body.get("status")).isEqualTo("In Progress"); // KO→EN

        @SuppressWarnings("unchecked")
        Map<String, Object> counts = (Map<String, Object>) body.get("counts");
        assertThat(counts).containsKeys("issues", "actionItems", "deliverables", "meetingMinutes");
        assertThat(counts.get("issues")).isEqualTo(2);        // V4 seed 이슈 2건
        assertThat(counts.get("deliverables")).isEqualTo(2);  // V4 seed 산출물 2건
        assertThat(counts.get("actionItems")).isEqualTo(1);   // V4 seed 액션 1건

        @SuppressWarnings("unchecked")
        Map<String, Object> vrb = (Map<String, Object>) body.get("vrbInfo");
        assertThat(vrb.get("status")).isEqualTo("상신예정");
        assertThat(vrb.get("vrbNumber")).isEqualTo("VRB-2026-001");
    }

    @Test
    void projectDetail_notFound_returns404() {
        Map<String, Object> body = get("/api/projects/9999",
                new ParameterizedTypeReference<>() {}, HttpStatus.NOT_FOUND);
        assertThat(body.get("message").toString()).contains("프로젝트를 찾을 수 없습니다");
    }

    @Test
    void issues_mappedCamelCaseWithDisplayCode() {
        List<Map<String, Object>> body = get("/api/projects/3/issues",
                new ParameterizedTypeReference<>() {}, HttpStatus.OK);
        assertThat(body).hasSize(2);
        Map<String, Object> first = body.get(0);
        assertThat(first).containsKeys("id", "projectId", "title", "type", "priority",
                "owner", "status", "displayCode", "relatedTaskId");
        assertThat(first.get("displayCode")).isEqualTo("I-1");
        assertThat(first.get("owner")).isEqualTo("김프로");
    }

    @Test
    void actionItems_deliverables_meetings_officialDocs_activities_shape() {
        List<Map<String, Object>> ai = get("/api/projects/3/action-items",
                new ParameterizedTypeReference<>() {}, HttpStatus.OK);
        assertThat(ai).hasSize(1);
        assertThat(ai.get(0)).containsKeys("id", "title", "assignee", "status", "relatedIssueId");
        assertThat(ai.get(0).get("relatedIssueId")).isEqualTo(101); // 이슈 101 참조

        List<Map<String, Object>> del = get("/api/projects/3/deliverables",
                new ParameterizedTypeReference<>() {}, HttpStatus.OK);
        assertThat(del).hasSize(2);
        assertThat(del.get(0)).containsKeys("id", "name", "category", "version", "status", "submitDate");

        List<Map<String, Object>> mm = get("/api/projects/3/meeting-minutes",
                new ParameterizedTypeReference<>() {}, HttpStatus.OK);
        assertThat(mm).hasSize(1);
        assertThat(mm.get(0)).containsKeys("id", "title", "meetDate", "attendees");
        // attendees JSON 배열 원형 유지
        assertThat(mm.get(0).get("attendees")).isInstanceOf(List.class);

        List<Map<String, Object>> docs = get("/api/projects/3/official-docs",
                new ParameterizedTypeReference<>() {}, HttpStatus.OK);
        assertThat(docs).hasSize(1);
        assertThat(docs.get(0)).containsKeys("id", "docNumber", "title", "approvalLine", "currentStatus");
        assertThat(docs.get(0).get("approvalLine")).isInstanceOf(List.class);

        List<Map<String, Object>> acts = get("/api/projects/3/activities",
                new ParameterizedTypeReference<>() {}, HttpStatus.OK);
        assertThat(acts).hasSize(2);
        assertThat(acts.get(0)).containsKeys("id", "type", "text", "date", "userName");
        assertThat(acts.get(0).get("type")).isEqualTo("INSERT");
    }

    @Test
    void members_activeOnly_pmFirst() {
        List<Map<String, Object>> body = get("/api/projects/3/members",
                new ParameterizedTypeReference<>() {}, HttpStatus.OK);
        assertThat(body).hasSize(2);
        // is_project_manager desc → PM(김프로) 먼저
        assertThat(body.get(0).get("name")).isEqualTo("김프로");
        assertThat(body.get(0)).containsKeys("memberId", "role", "employmentType", "isActive");
        assertThat(body.get(0).get("employmentType")).isEqualTo("regular");
        // V6에서 employment_type 5종화: outsourcing → turnkey(외주≈턴키)로 이관.
        assertThat(body.get(1).get("employmentType")).isEqualTo("turnkey");
    }

    @Test
    void catalogTree_nested() {
        List<Map<String, Object>> roots = get("/api/catalog/tree",
                new ParameterizedTypeReference<>() {}, HttpStatus.OK);
        // V2 seed: PHASE(1) 루트 1개
        assertThat(roots).hasSize(1);
        Map<String, Object> phase = roots.get(0);
        assertThat(phase.get("nodeType")).isEqualTo("PHASE");
        assertThat(phase).containsKeys("id", "code", "name", "children", "isActive");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> activities = (List<Map<String, Object>>) phase.get("children");
        assertThat(activities).hasSize(1); // ACTIVITY 1개
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> tasks = (List<Map<String, Object>>) activities.get(0).get("children");
        assertThat(tasks).hasSize(2); // TASK 2개
    }

    @Test
    void workflows_nestedStatusesTransitionsConditions() {
        List<Map<String, Object>> body = get("/api/workflows",
                new ParameterizedTypeReference<>() {}, HttpStatus.OK);
        assertThat(body).hasSize(1);
        Map<String, Object> wf = body.get(0);
        assertThat(wf).containsKeys("id", "name", "isDefault", "usedNodeCount", "statuses", "transitions");
        assertThat(wf.get("name")).isEqualTo("산출물 승인");
        assertThat(wf.get("usedNodeCount")).isEqualTo(1); // node 3 연결

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> statuses = (List<Map<String, Object>>) wf.get("statuses");
        assertThat(statuses).hasSize(4);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> transitions = (List<Map<String, Object>>) wf.get("transitions");
        assertThat(transitions).hasSize(2);
        Map<String, Object> submit = transitions.get(0);
        assertThat(submit).containsKeys("id", "name", "fromStatusCode", "toStatusCode", "conditions");
        assertThat(submit.get("fromStatusCode")).isEqualTo("DRAFT");
        assertThat(submit.get("toStatusCode")).isEqualTo("SUBMITTED");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> conds = (List<Map<String, Object>>) submit.get("conditions");
        assertThat(conds).hasSize(1);
        assertThat(conds.get(0).get("operator")).isEqualTo("GTE");
        assertThat(conds.get(0).get("params")).isInstanceOf(Map.class);
    }

    // 0015 §B — GET /api/projects 서버측 필터(location/status).
    @Test
    void projectList_noFilter_returnsAllWithLocationKey() {
        List<Map<String, Object>> body = get("/api/projects",
                new ParameterizedTypeReference<>() {}, HttpStatus.OK);
        // 시드 프로젝트 전체(하위호환) + location 키 노출.
        assertThat(body).isNotEmpty();
        assertThat(body.get(0)).containsKey("location");
    }

    @Test
    void projectList_locationEtc_matchesNonCity() {
        // 시드 location 이 모두 NULL → '기타'(4종 외)로 전부 매칭.
        List<Map<String, Object>> all = get("/api/projects",
                new ParameterizedTypeReference<>() {}, HttpStatus.OK);
        List<Map<String, Object>> etc = get("/api/projects?location=기타",
                new ParameterizedTypeReference<>() {}, HttpStatus.OK);
        assertThat(etc).hasSameSizeAs(all);
    }

    @Test
    void projectList_locationCity_filtersByLike() {
        // 시드에 '서울' location 없음 → 빈 목록.
        List<Map<String, Object>> seoul = get("/api/projects?location=서울",
                new ParameterizedTypeReference<>() {}, HttpStatus.OK);
        assertThat(seoul).isEmpty();
    }

    @Test
    void projectList_statusFilter_usesDbKoValue() {
        // status 는 DB 저장값(한글, '진행중') 정확일치.
        List<Map<String, Object>> inProgress = get("/api/projects?status=진행중",
                new ParameterizedTypeReference<>() {}, HttpStatus.OK);
        assertThat(inProgress).isNotEmpty();
        // 응답 status 는 KO→EN 변환된 값.
        assertThat(inProgress).allSatisfy(p -> assertThat(p.get("status")).isEqualTo("In Progress"));
    }

    @Test
    void companies_masterList() {
        List<Map<String, Object>> body = get("/api/companies",
                new ParameterizedTypeReference<>() {}, HttpStatus.OK);
        assertThat(body).hasSize(3);
        assertThat(body.get(0)).containsKeys("id", "name", "type", "isActive");
        assertThat(body.get(0).get("type")).isEqualTo("OWN");
    }
}
