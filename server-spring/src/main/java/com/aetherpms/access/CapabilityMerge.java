package com.aetherpms.access;

/**
 * 0034 §3 — capability 값 결합(더 허용적인 쪽 채택). 순서: all > true > own > false/null.
 * 이진 키(project.edit 등)는 true/false만, 3단계 키(task.edit 등)는 all/own/false만 쓰므로
 * 하나의 순위 함수로 양쪽 다 처리한다.
 */
public final class CapabilityMerge {

    private CapabilityMerge() {}

    private static int rank(Object v) {
        if ("all".equals(v)) return 3;
        if (Boolean.TRUE.equals(v)) return 2;
        if ("own".equals(v)) return 1;
        return 0;
    }

    public static Object merge(Object a, Object b) {
        return rank(a) >= rank(b) ? (rank(a) == 0 ? Boolean.FALSE : a) : b;
    }

    public static boolean isAll(Object v) { return "all".equals(v) || Boolean.TRUE.equals(v); }
    public static boolean isOwn(Object v) { return "own".equals(v); }
    public static boolean isAllowed(Object v) { return rank(v) > 0; }

    /** ALL > DEPT > PARTICIPATING. */
    public static String mergeScope(String a, String b) {
        int ra = scopeRank(a), rb = scopeRank(b);
        return ra >= rb ? a : b;
    }
    private static int scopeRank(String s) {
        return switch (String.valueOf(s)) {
            case "ALL" -> 2;
            case "DEPT" -> 1;
            default -> 0;
        };
    }
}
