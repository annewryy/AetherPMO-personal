package com.aetherpms.g2b;

import java.util.List;

/**
 * 공고 소스 어댑터 (설계 0016 §B) — 본공고/사전규격을 동일 인터페이스로 흡수.
 *
 * 본공고(MainNoticeSource)는 레거시 api/g2b.js 오라클을 이식한 실동작 구현.
 * 사전규격(PreSpecNoticeSource)은 나라장터 사전규격정보서비스 어댑터 —
 *   오퍼레이션/필드 매핑 최종검증 전이라 g2b.pre-spec-enabled 플래그로 게이트.
 */
public interface G2bNoticeSource {

    /** 이 소스의 noticeType("main" | "pre_spec"). */
    String noticeType();

    /** 이 소스가 현재 활성인지(사전규격은 플래그로 off 가능). */
    boolean isEnabled();

    /**
     * 외부 OpenAPI를 호출해 원시 공고 목록을 가져온다(캐시/페이징/로컬필터 전 단계).
     * 기간·기관·검색어 기준으로 수집만 담당. 실패/키없음 시 예외(G2bException).
     */
    List<BidNotice> fetch(BidNoticeQuery query);
}
