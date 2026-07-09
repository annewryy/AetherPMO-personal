package com.aetherpms.engine;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 신호 엔진 날짜 유틸 — Node engine/signals.ts parseDateOnly/dayDiff/linearExpected 이식.
 * date 컬럼은 JdbcTemplate에서 java.sql.Date/LocalDate/문자열로 온다.
 */
public final class SignalDates {

    private SignalDates() {}

    private static final Pattern DATE_RE = Pattern.compile("^(\\d{4})-(\\d{2})-(\\d{2})");

    /** null/빈/파싱불가 → null, 아니면 date(시각 절삭). */
    public static LocalDate parseDateOnly(Object v) {
        if (v == null) return null;
        if (v instanceof LocalDate d) return d;
        if (v instanceof java.sql.Date d) return d.toLocalDate();
        if (v instanceof LocalDateTime dt) return dt.toLocalDate();
        if (v instanceof java.sql.Timestamp ts) return ts.toLocalDateTime().toLocalDate();
        String s = v.toString();
        if (s.isEmpty()) return null;
        Matcher m = DATE_RE.matcher(s);
        if (!m.find()) return null;
        return LocalDate.of(Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2)), Integer.parseInt(m.group(3)));
    }

    /** from → to 일수 차 (to가 미래면 양수). */
    public static int dayDiff(LocalDate from, LocalDate to) {
        return (int) (to.toEpochDay() - from.toEpochDay());
    }

    public static String toDateStr(LocalDate d) {
        return d.toString();
    }

    /** 단계 기대치: 오늘이 계획구간 밖이면 0/100, 안이면 선형. */
    public static int linearExpected(LocalDate start, LocalDate end, LocalDate today) {
        int elapsed = dayDiff(start, today);
        int duration = dayDiff(start, end);
        if (elapsed <= 0) return 0;
        if (duration <= 0 || elapsed >= duration) return 100;
        return (int) Math.round((elapsed / (double) duration) * 100);
    }
}
