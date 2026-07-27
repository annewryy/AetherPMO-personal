package com.aetherpms.access;

import java.util.List;
import java.util.Map;

/**
 * 0034 §5-1 — 직책 표준 코드(실 인력 데이터 검증 완료, 2026-07-27).
 * dev 927명 분포: 직책 없음 751(STAFF 기본) · 파트장 80 · 팀장 67 · 본부장/실장 21 · 임원 8.
 * "사원·대리·과장" 등 직급 문자열은 데이터에 없어 SENIOR 등 세분 코드는 v1에서 제외.
 */
public final class PositionCode {

    private PositionCode() {}

    public static final String STAFF = "STAFF";
    public static final String PART_LEAD = "PART_LEAD";
    public static final String TEAM_LEAD = "TEAM_LEAD";
    public static final String DIV_HEAD = "DIV_HEAD";
    public static final String EXEC = "EXEC";

    public static final List<String> ALL = List.of(STAFF, PART_LEAD, TEAM_LEAD, DIV_HEAD, EXEC);

    /** 원문 → 표준코드. "(겸)" 접미사 제거 후 매칭, 매핑 밖 값은 안전 기본값 STAFF로 폴백. */
    private static final Map<String, String> MAP = Map.of(
            "파트장", PART_LEAD,
            "팀장", TEAM_LEAD,
            "본부장", DIV_HEAD,
            "실장", DIV_HEAD,
            "CEO", EXEC,
            "CFO", EXEC,
            "CVO", EXEC,
            "CDO", EXEC,
            "A.C.E.부회장", EXEC,
            "의장", EXEC);

    public static String of(String rawPosition) {
        if (rawPosition == null || rawPosition.isBlank()) return STAFF;
        String normalized = rawPosition.trim().replace("(겸)", "").trim();
        return MAP.getOrDefault(normalized, STAFF);
    }
}
