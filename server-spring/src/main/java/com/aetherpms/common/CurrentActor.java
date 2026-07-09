package com.aetherpms.common;

import jakarta.servlet.http.HttpServletRequest;

/**
 * resolveActor 이식 — X-User-Id 헤더(uuid)를 신뢰(데모 한정, 0005에서 실 신원으로 교체).
 * 컨트롤러가 HttpServletRequest에서 직접 호출한다(HandlerMethodArgumentResolver 대신
 * 단순 static 헬퍼 — Node resolveActor(req)와 1:1).
 */
public final class CurrentActor {

    private CurrentActor() {}

    private static final java.util.regex.Pattern UUID_RE = java.util.regex.Pattern.compile(
            "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
            java.util.regex.Pattern.CASE_INSENSITIVE);

    public static Actor resolve(HttpServletRequest req) {
        String value = req == null ? null : req.getHeader("X-User-Id");
        if (value != null && UUID_RE.matcher(value).matches()) {
            return new Actor(value);
        }
        return Actor.ANONYMOUS;
    }
}
