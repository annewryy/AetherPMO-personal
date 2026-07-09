package com.aetherpms.g2b;

/**
 * GET /api/bid-notices 파라미터 (설계 0016 §B).
 *
 *   agencyName : 해석된 기관명(dminsttNm 조회 키). null이면 기관필터 없음.
 *   noticeType : all(기본) | pre_spec | main.
 *   keyword    : 공고명 검색어(bidNtceNm). 로컬 부분매칭에도 사용.
 *   bgngDt/endDt : yyyyMMdd(대시 제거됨). 비면 최근 30일(레거시 기본).
 *   page/limit : 페이징(캐시 기반 슬라이싱).
 */
public record BidNoticeQuery(
        String agencyName,
        String noticeType,
        String keyword,
        String bgngDt,
        String endDt,
        int page,
        int limit) {

    public static final String TYPE_ALL = "all";
    public static final String TYPE_MAIN = "main";
    public static final String TYPE_PRE_SPEC = "pre_spec";

    public boolean wantsMain() {
        return TYPE_ALL.equals(noticeType) || TYPE_MAIN.equals(noticeType);
    }

    public boolean wantsPreSpec() {
        return TYPE_ALL.equals(noticeType) || TYPE_PRE_SPEC.equals(noticeType);
    }
}
