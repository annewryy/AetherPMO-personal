package com.aetherpms.common;

import org.springframework.jdbc.core.JdbcTemplate;

/** 읽기 공용 헬퍼 — id 검증·프로젝트 존재 확인(구 ReadController private 헬퍼 승격). */
public final class ReadSupport {
    private ReadSupport() {}

    public static long parseId(long id) {
        if (id <= 0) throw ApiException.badRequest("유효하지 않은 id 입니다.");
        return id;
    }

    public static void requireProject(JdbcTemplate jdbc, long id) {
        Integer c = jdbc.queryForObject(
                "SELECT COUNT(*) FROM pms_project WHERE project_id = ?", Integer.class, id);
        if (c == null || c == 0) throw ApiException.notFound("프로젝트를 찾을 수 없습니다.");
    }
}
