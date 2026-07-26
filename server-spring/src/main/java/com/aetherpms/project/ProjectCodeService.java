package com.aetherpms.project;

import java.time.LocalDate;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * 프로젝트 코드(project_code) 발번 — 0001 발번 규칙 + 0017 §B.
 *
 * 코드 스킴:
 *   베이스 = PRJ-{연도}-{순번3자리}   (예: PRJ-2026-004)
 *   단계 접미사(0001): 입찰 '-B' → PRJ-2026-004-B, 수행 '-E'(후속 배치)
 *   신규 입찰 프로젝트는 베이스를 새로 발번하고 '-B'를 부착한다.
 *
 * 동시성 안전 발번(MariaDB) — DisplayCodeService/pms_code_counter 와 동일 패턴:
 *   INSERT ... ON DUPLICATE KEY UPDATE last_seq = LAST_INSERT_ID(last_seq + 1)
 *   후 SELECT last_seq 로 증가값 회수. 반드시 같은 트랜잭션(커넥션)에서 수행.
 *   전역(연도별) 카운터라 pms_project_code_counter(year_val) 사용
 *   (pms_code_counter는 project_id FK라 생성 시점에 부적합).
 */
@Service
public class ProjectCodeService {

    private final JdbcTemplate jdbc;

    public ProjectCodeService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 신규 입찰(BIDDING) 프로젝트 코드 발번: PRJ-{연도}-{NNN}-B. */
    public String nextBiddingCode() {
        return nextBaseCode() + "-B";
    }

    /** 발번 패턴 기본값 — 관리자 설정(project.code.pattern, V21)으로 오버라이드(요구 0004 §4). */
    private static final String DEFAULT_PATTERN = "PRJ-{연도}-{순번}";

    /** 베이스 코드 원자 발번(접미사 없음) — 패턴 토큰: {연도}(4)·{연도2}(2)·{순번}(3자리 0패딩). */
    public String nextBaseCode() {
        int year = LocalDate.now().getYear();
        jdbc.update(
                "INSERT INTO pms_project_code_counter (year_val, last_seq) "
              + "VALUES (?, 1) "
              + "ON DUPLICATE KEY UPDATE last_seq = LAST_INSERT_ID(last_seq + 1)",
                year);
        Long seq = jdbc.queryForObject(
                "SELECT last_seq FROM pms_project_code_counter WHERE year_val = ?",
                Long.class, year);
        long n = seq == null ? 1 : seq;

        String pattern = DEFAULT_PATTERN;
        try {
            String v = jdbc.queryForObject(
                    "SELECT setting_value FROM pms_app_setting WHERE setting_key = 'project.code.pattern'",
                    String.class);
            if (v != null && v.contains("{순번}")) pattern = v.trim();
        } catch (org.springframework.dao.EmptyResultDataAccessException ignored) {
            // 설정 없음 — 기본 패턴
        }
        return pattern
                .replace("{연도2}", String.format("%02d", year % 100))
                .replace("{연도}", String.valueOf(year))
                .replace("{순번}", String.format("%03d", n));
    }
}
