package com.aetherpms;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.core.ParameterizedTypeReference;
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
 * 배치19 — GET /api/projects/{id}/wbs 통합 테스트 (Testcontainers-MariaDB).
 * 프로젝트 1 시드(PHASE 계획일정 有, TASK 계획/담당자 空)에 태스크 최소 보강 후
 * WBS 트리 구조·태스크 status/assignee/dates·목표/실제/Δ·계획일정 소스(TASK vs PHASE tailoring)·404 검증.
 * Docker 없으면 클래스 전체 스킵.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
@EnabledIf("dockerAvailable")
class WbsScheduleIntegrationTest {

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

    // 담당자 uid — pms_project_member.user_uid ↔ pms_task.assignee_id 매핑용.
    static final String ASSIGNEE_UID = "11111111-1111-1111-1111-111111111111";

    /**
     * 프로젝트 1 태스크 계획일정/담당자 최소 보강.
     * - 태스크 1(node 3): 담당자·계획(과거~미래)·실제 시작.
     * - 태스크 2(node 4): 담당자만(계획일정 空 → targetRate null 검증).
     * - 프로젝트 1 멤버(user_uid 有) 추가 → assigneeName 해석.
     */
    @BeforeEach
    void boostSeed() {
        jdbc.update("DELETE FROM pms_project_member WHERE project_id = 1 AND user_uid = ?", ASSIGNEE_UID);
        jdbc.update("INSERT INTO pms_project_member (project_id, member_type, user_uid, name, "
                + "participation_role, employment_type, is_project_manager, is_active) "
                + "VALUES (1, 'INTERNAL', ?, '홍길동', 'DEV', 'regular', 0, 1)", ASSIGNEE_UID);

        // 태스크 1: 계획 2026-01-01~2026-06-30, 실제 시작 2026-01-05, 담당자.
        jdbc.update("UPDATE pms_task SET assignee_id = ?, planned_start_date = '2026-01-01', "
                + "planned_end_date = '2026-06-30', actual_start_date = '2026-01-05', actual_end_date = NULL "
                + "WHERE task_id = 1", ASSIGNEE_UID);
        // 태스크 2: 담당자만, 계획일정 없음.
        jdbc.update("UPDATE pms_task SET assignee_id = ?, planned_start_date = NULL, "
                + "planned_end_date = NULL, actual_start_date = NULL, actual_end_date = NULL "
                + "WHERE task_id = 2", ASSIGNEE_UID);
    }

    private <T> T get(String path, ParameterizedTypeReference<T> type, HttpStatus expected) {
        ResponseEntity<T> resp = rest.exchange(path, HttpMethod.GET, null, type);
        assertThat(resp.getStatusCode()).isEqualTo(expected);
        return resp.getBody();
    }

    @SuppressWarnings("unchecked")
    @Test
    void wbs_treeStructure_phaseActivityTask() {
        Map<String, Object> body = get("/api/projects/1/wbs",
                new ParameterizedTypeReference<>() {}, HttpStatus.OK);
        assertThat(body).containsKeys("projectId", "phases");
        assertThat(body.get("projectId")).isEqualTo(1);

        List<Map<String, Object>> phases = (List<Map<String, Object>>) body.get("phases");
        assertThat(phases).hasSize(1);
        Map<String, Object> phase = phases.get(0);
        assertThat(phase.get("nodeType")).isEqualTo("PHASE");
        assertThat(phase.get("code")).isEqualTo("PH-1");
        assertThat(phase).containsKeys("nodeId", "name", "actualRate", "targetRate", "delta",
                "plannedStartDate", "plannedEndDate", "actualStartDate", "actualEndDate");

        List<Map<String, Object>> activities = (List<Map<String, Object>>) phase.get("activities");
        assertThat(activities).hasSize(1);
        assertThat(activities.get(0).get("nodeType")).isEqualTo("ACTIVITY");

        List<Map<String, Object>> tasks = (List<Map<String, Object>>) activities.get(0).get("tasks");
        assertThat(tasks).hasSize(2);
        assertThat(tasks).allSatisfy(t -> assertThat(t.get("nodeType")).isEqualTo("TASK"));
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> taskByCode(Map<String, Object> body, String code) {
        List<Map<String, Object>> phases = (List<Map<String, Object>>) body.get("phases");
        List<Map<String, Object>> activities = (List<Map<String, Object>>) phases.get(0).get("activities");
        List<Map<String, Object>> tasks = (List<Map<String, Object>>) activities.get(0).get("tasks");
        return tasks.stream().filter(t -> code.equals(t.get("code"))).findFirst().orElseThrow();
    }

    @Test
    void task_status_assignee_dates_fromPmsTask() {
        Map<String, Object> body = get("/api/projects/1/wbs",
                new ParameterizedTypeReference<>() {}, HttpStatus.OK);

        Map<String, Object> t1 = taskByCode(body, "T-1");
        assertThat(t1.get("status")).isEqualTo("IN_PROGRESS"); // pms_task.status 시드
        assertThat(t1.get("assigneeId")).isEqualTo(ASSIGNEE_UID);
        assertThat(t1.get("assigneeName")).isEqualTo("홍길동"); // project_member.user_uid 해석
        assertThat(t1.get("plannedStartDate")).isEqualTo("2026-01-01");
        assertThat(t1.get("plannedEndDate")).isEqualTo("2026-06-30");
        assertThat(t1.get("actualStartDate")).isEqualTo("2026-01-05");
        assertThat(t1.get("actualEndDate")).isNull();
    }

    @Test
    void task_withoutPlannedDates_targetRateNull() {
        Map<String, Object> body = get("/api/projects/1/wbs",
                new ParameterizedTypeReference<>() {}, HttpStatus.OK);
        Map<String, Object> t2 = taskByCode(body, "T-2");
        // 계획일정 없음 → targetRate/delta null(판정불가), 날짜 null.
        assertThat(t2.get("targetRate")).isNull();
        assertThat(t2.get("delta")).isNull();
        assertThat(t2.get("plannedStartDate")).isNull();
        assertThat(t2.get("plannedEndDate")).isNull();
        assertThat(t2.get("status")).isEqualTo("TODO");
    }

    @Test
    void task_actualVsTarget_delta() {
        Map<String, Object> body = get("/api/projects/1/wbs",
                new ParameterizedTypeReference<>() {}, HttpStatus.OK);
        Map<String, Object> t1 = taskByCode(body, "T-1");
        // 실제 진척: 롤업(태스크1 = 산출물 2건 중 1 APPROVED = 50).
        assertThat(t1.get("actualRate")).isEqualTo(50);
        // 목표: 계획 2026-01-01~06-30 선형 기대치. delta = actual - target.
        Integer target = (Integer) t1.get("targetRate");
        assertThat(target).isNotNull();
        assertThat(t1.get("delta")).isEqualTo(50 - target);
        // 오늘이 계획 구간 안이면 0<target<=100 (0007 linearExpected 규칙과 일치).
        int expected = linearExpected(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 6, 30), LocalDate.now());
        assertThat(target).isEqualTo(expected);
    }

    @Test
    void phase_plannedDates_fromTailoring_notDerived() {
        Map<String, Object> body = get("/api/projects/1/wbs",
                new ParameterizedTypeReference<>() {}, HttpStatus.OK);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> phases = (List<Map<String, Object>>) body.get("phases");
        Map<String, Object> phase = phases.get(0);
        // PHASE 계획일정은 tailoring 값(2026-01-01~03-31) — 하위 태스크(2026-06-30)로 파생되지 않음.
        assertThat(phase.get("plannedStartDate")).isEqualTo("2026-01-01");
        assertThat(phase.get("plannedEndDate")).isEqualTo("2026-03-31");
        // PHASE 실제 진척: 롤업 4건 중 2 APPROVED = 50.
        assertThat(phase.get("actualRate")).isEqualTo(50);
    }

    @Test
    void activity_datesDerivedFromChildTasks() {
        Map<String, Object> body = get("/api/projects/1/wbs",
                new ParameterizedTypeReference<>() {}, HttpStatus.OK);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> phases = (List<Map<String, Object>>) body.get("phases");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> activities = (List<Map<String, Object>>) phases.get(0).get("activities");
        Map<String, Object> activity = activities.get(0);
        // ACTIVITY는 tailoring 계획일정 없음 → 하위 태스크 min(start)/max(end) 파생.
        // 태스크1(2026-01-01~06-30), 태스크2(NULL) → start=01-01, end=06-30.
        assertThat(activity.get("plannedStartDate")).isEqualTo("2026-01-01");
        assertThat(activity.get("plannedEndDate")).isEqualTo("2026-06-30");
        assertThat(activity.get("actualStartDate")).isEqualTo("2026-01-05"); // 태스크1 실제 시작
    }

    @Test
    void task_deliverableCounts() {
        Map<String, Object> body = get("/api/projects/1/wbs",
                new ParameterizedTypeReference<>() {}, HttpStatus.OK);
        @SuppressWarnings("unchecked")
        Map<String, Object> dc = (Map<String, Object>) taskByCode(body, "T-1").get("deliverableCounts");
        // 태스크1(node 3) 하위 산출물 2건, APPROVED 1건.
        assertThat(((Number) dc.get("total")).longValue()).isEqualTo(2L);
        assertThat(((Number) dc.get("approved")).longValue()).isEqualTo(1L);
    }

    @Test
    void notFound_returns404() {
        Map<String, Object> body = get("/api/projects/9999/wbs",
                new ParameterizedTypeReference<>() {}, HttpStatus.NOT_FOUND);
        assertThat(body.get("message").toString()).contains("프로젝트를 찾을 수 없습니다");
    }

    // 0007 §1 SignalDates.linearExpected 동일 규칙(테스트 자체 검증용).
    private static int linearExpected(LocalDate start, LocalDate end, LocalDate today) {
        long elapsed = today.toEpochDay() - start.toEpochDay();
        long duration = end.toEpochDay() - start.toEpochDay();
        if (elapsed <= 0) return 0;
        if (duration <= 0 || elapsed >= duration) return 100;
        return (int) Math.round((elapsed / (double) duration) * 100);
    }
}
