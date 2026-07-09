package com.aetherpms.engine;

import java.util.ArrayList;
import java.util.List;

/**
 * 신호 지표 어휘 — Node engine/signals.ts 상수 이식(단일 원천).
 * 지표 추가 = 상수 + 평가 함수 추가.
 */
public final class SignalConstants {

    private SignalConstants() {}

    /** 등록(SHOW/CREATE_RISK) 계열 metric. */
    public static final List<String> CREATE_METRICS = List.of(
            "PROGRESS_DELAY_PCT", "STALLED_DAYS", "DUE_IN_DAYS",
            "TASK_OVERDUE_DAYS", "TASK_PROGRESS_GAP",
            "DELIVERABLE_REJECT_COUNT", "DELIVERABLE_OVERDUE_COUNT");

    /** 전환(ESCALATE_ISSUE) 계열 metric. */
    public static final List<String> ESCALATE_METRICS = List.of(
            "RISK_UNRESOLVED_DAYS", "RISK_PRIORITY_AGE", "SOURCE_METRIC_WORSENED", "RISK_NO_ACTION_DAYS");

    public static final List<String> KNOWN_METRICS = concat(CREATE_METRICS, ESCALATE_METRICS);
    public static final List<String> KNOWN_ACTIONS = List.of("SHOW", "CREATE_RISK", "ESCALATE_ISSUE");
    public static final List<String> KNOWN_OPERATORS = List.of("GT", "GTE", "LT", "LTE", "EQ");

    private static List<String> concat(List<String> a, List<String> b) {
        List<String> out = new ArrayList<>(a);
        out.addAll(b);
        return out;
    }

    /** operator 비교 — 미지 operator/임계값 없음은 fail-closed(false). */
    public static boolean compare(String operator, double value, Double threshold) {
        if (threshold == null || Double.isNaN(threshold)) return false;
        double t = threshold;
        return switch (operator) {
            case "GT" -> value > t;
            case "GTE" -> value >= t;
            case "LT" -> value < t;
            case "LTE" -> value <= t;
            case "EQ" -> value == t;
            default -> false;
        };
    }
}
