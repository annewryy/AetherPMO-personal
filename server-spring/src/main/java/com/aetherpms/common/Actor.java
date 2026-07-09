package com.aetherpms.common;

/**
 * 행위자 식별 결과 — Node actor.ts Actor 이식.
 * userId = pms_project_member.user_uid 와 매칭되는 uuid(미식별 시 null).
 */
public record Actor(String userId) {

    public static final Actor ANONYMOUS = new Actor(null);
}
