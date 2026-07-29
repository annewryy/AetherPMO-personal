package com.aetherpms.project;

import java.time.LocalDate;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import com.aetherpms.common.ApiException;

/**
 * 프로젝트 코드(project_code) — 사용자 직접 입력 검증 + (레거시) 자동 발번.
 *
 * <p><b>2026-07-29부터 생성·수정·수행전환 모두 사용자가 코드를 직접 입력한다.</b> 회사에 이미
 * 쓰던 사업번호 체계를 그대로 넣기 위해 형식은 강제하지 않고, 공백 정리와 <b>중복 검사</b>만 한다.
 * 아래 자동 발번(nextBaseCode/nextBiddingCode)은 롤백 여지를 위해 남겨둔 미사용 코드다.
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

    /** pms_project.project_code = VARCHAR(50). */
    private static final int MAX_LEN = 50;

    /**
     * 사용자가 입력한 사업번호를 정규화한다 — 앞뒤 공백 제거 + 내부 연속 공백 1칸으로.
     * 형식 검증은 하지 않는다(기존 사내 코드 체계를 그대로 받기 위함).
     *
     * @return 정규화된 코드. 입력이 비면 null.
     */
    public static String normalize(Object raw) {
        if (raw == null) return null;
        String s = raw.toString().trim().replaceAll("\\s+", " ");
        return s.isEmpty() ? null : s;
    }

    /** 이 코드를 이미 쓰는 프로젝트가 있는지(excludeProjectId 자신은 제외 — 수정 화면용). */
    public boolean isTaken(String code, Long excludeProjectId) {
        if (code == null) return false;
        String sql = "SELECT COUNT(*) FROM pms_project WHERE project_code = ?"
                + (excludeProjectId != null ? " AND project_id <> ?" : "");
        Object[] args = excludeProjectId != null
                ? new Object[] { code, excludeProjectId }
                : new Object[] { code };
        Integer n = jdbc.queryForObject(sql, Integer.class, args);
        return n != null && n > 0;
    }

    /**
     * 입력 코드를 검증해 저장 가능한 값으로 돌려준다 — 필수·길이·중복.
     * 중복이면 409(Conflict)로 던져 프론트가 "이미 사용 중인 사업번호"를 그대로 표시하게 한다.
     */
    public String requireAvailable(Object raw, Long excludeProjectId) {
        String code = normalize(raw);
        if (code == null) {
            throw ApiException.badRequest("projectCode(사업번호)는 필수입니다.");
        }
        if (code.length() > MAX_LEN) {
            throw ApiException.badRequest("projectCode(사업번호)는 " + MAX_LEN + "자를 넘을 수 없습니다.");
        }
        if (isTaken(code, excludeProjectId)) {
            throw ApiException.conflict("이미 사용 중인 사업번호입니다: " + code);
        }
        return code;
    }

    /** 신규 입찰(BIDDING) 프로젝트 코드 발번: PRJ-{연도}-{NNN}-B. (미사용 — 직접 입력으로 전환) */
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
