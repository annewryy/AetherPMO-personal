package com.aetherpms.g2b;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 공고 조회 결과 단건 (설계 0016 §B).
 * 결과 Grid 필드: 공고번호·공고유형·공고명·기관·공고일·마감일 + 예산/URL(레거시 계약 유지).
 *
 * noticeType: "main"(본공고) | "pre_spec"(사전규격) — 프론트 Badge용.
 */
public record BidNotice(
        String announcementNo,
        String noticeType,      // "main" | "pre_spec"
        String name,
        String customer,
        String publishDate,     // yyyy-MM-dd (or "-")
        String endDate,         // yyyy-MM-dd (or "-")
        long budget,
        String url) {

    /** 응답 직렬화용 camelCase DTO. 레거시 g2b.js 계약(announcementNo/name/customer 등) 유지. */
    public Map<String, Object> toDto() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("announcementNo", announcementNo);
        m.put("noticeType", noticeType);
        m.put("name", name);
        m.put("customer", customer);
        m.put("publishDate", publishDate);
        m.put("endDate", endDate);
        m.put("budget", budget);
        m.put("url", url);
        return m;
    }
}
