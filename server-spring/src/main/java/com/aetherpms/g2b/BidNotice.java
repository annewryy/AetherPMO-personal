package com.aetherpms.g2b;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 공고 조회 결과 단건 (설계 0016 §B).
 * 결과 Grid 필드: 공고번호·공고차수·공고유형·공고명·기관·공고일·마감일 + 예산/URL.
 *
 * noticeOrder: "00", "01" 등 공고차수(bidNtceOrd). 동일 공고번호의 차수를 보존한다.
 * noticeType: "main"(본공고) | "pre_spec"(사전규격) — 프론트 Badge용.
 */
public record BidNotice(
        String announcementNo,
        String noticeOrder,     // bidNtceOrd: 공고차수 (예: "00", "01")
        String noticeType,      // "main" | "pre_spec"
        String name,
        String customer,
        String publishDate,     // yyyy-MM-dd (or "-")
        String endDate,         // yyyy-MM-dd (or "-")
        long budget,
        String url,
        String customerCode) {

    /** 하위 호환을 위한 8필드 생성자 (차수 기본값 "00") */
    public BidNotice(String announcementNo, String noticeType, String name, String customer,
                     String publishDate, String endDate, long budget, String url) {
        this(announcementNo, "00", noticeType, name, customer, publishDate, endDate, budget, url, null);
    }

    /** 9필드 생성자 (차수 포함, customerCode=null) */
    public BidNotice(String announcementNo, String noticeOrder, String noticeType, String name, String customer,
                     String publishDate, String endDate, long budget, String url) {
        this(announcementNo, noticeOrder, noticeType, name, customer, publishDate, endDate, budget, url, null);
    }

    /** 응답 직렬화용 camelCase DTO. 레거시 g2b.js 계약 유지 + noticeOrder 노출. */
    public Map<String, Object> toDto() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("announcementNo", announcementNo);
        m.put("noticeOrder", noticeOrder);
        m.put("noticeType", noticeType);
        m.put("name", name);
        m.put("customer", customer);
        m.put("customerCode", customerCode);
        m.put("publishDate", publishDate);
        m.put("endDate", endDate);
        m.put("budget", budget);
        m.put("url", url);
        return m;
    }
}
