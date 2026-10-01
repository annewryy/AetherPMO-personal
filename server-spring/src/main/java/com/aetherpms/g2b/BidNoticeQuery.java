package com.aetherpms.g2b;

import java.util.List;

/**
 * GET /api/bid-notices 파라미터 (설계 0016 §B).
 *
 *   agencies   : 대상기관 목록(dminsttNm 조회 키 목록). null/empty면 전체 기관.
 *   noticeType : all(기본) | pre_spec | main.
 *   keyword    : 공고명 검색어(bidNtceNm). 로컬 부분매칭에도 사용.
 *   bgngDt/endDt : yyyyMMdd(대시 제거됨).
 *   page/limit : 페이징(캐시 기반 슬라이싱).
 */
public record BidNoticeQuery(
        List<String> agencies,
        String noticeType,
        String keyword,
        String bgngDt,
        String endDt,
        int page,
        int limit) {

    public static final String TYPE_ALL = "all";
    public static final String TYPE_MAIN = "main";
    public static final String TYPE_PRE_SPEC = "pre_spec";

    /** 하위 호환을 위한 단일 agencyName 생성자 */
    public BidNoticeQuery(String agencyName, String noticeType, String keyword,
                          String bgngDt, String endDt, int page, int limit) {
        this(agencyName != null && !agencyName.isBlank() ? List.of(agencyName.trim()) : List.of(),
                noticeType, keyword, bgngDt, endDt, page, limit);
    }

    /** 하위 호환을 위한 단일 agencyName getter */
    public String agencyName() {
        return (agencies != null && !agencies.isEmpty()) ? agencies.get(0) : null;
    }

    public boolean wantsMain() {
        return TYPE_ALL.equals(noticeType) || TYPE_MAIN.equals(noticeType);
    }

    public boolean wantsPreSpec() {
        return TYPE_ALL.equals(noticeType) || TYPE_PRE_SPEC.equals(noticeType);
    }
}
