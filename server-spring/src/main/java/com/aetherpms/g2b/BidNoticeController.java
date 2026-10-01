package com.aetherpms.g2b;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 나라장터 공고 조회 (설계 0016 §B).
 *   GET /api/bid-notices — agency/agencies·noticeType·기간·검색어. 응답: {notices[], totalCount}.
 *
 * 다중 기관(OR 조건) 지원:
 *   - ?agency=A&agency=B 또는 ?agencies=A,B 또는 단일 ?agency=A 모두 지원.
 *   - 기관 파라미터가 없거나 비어있으면 전체 기관 조회.
 */
@RestController
public class BidNoticeController {

    private final G2bNoticeService noticeService;
    private final BidAgencyService agencyService;

    public BidNoticeController(G2bNoticeService noticeService, BidAgencyService agencyService) {
        this.noticeService = noticeService;
        this.agencyService = agencyService;
    }

    @GetMapping("/api/bid-notices")
    public Map<String, Object> notices(
            @RequestParam(name = "agency", required = false) List<String> agencyList,
            @RequestParam(name = "agencies", required = false) List<String> agenciesParam,
            @RequestParam(name = "noticeType", required = false, defaultValue = "all") String noticeType,
            @RequestParam(name = "keyword", required = false) String keyword,
            @RequestParam(name = "bgngDt", required = false) String bgngDt,
            @RequestParam(name = "endDt", required = false) String endDt,
            @RequestParam(name = "page", required = false, defaultValue = "1") int page,
            @RequestParam(name = "numOfRows", required = false, defaultValue = "10") int limit) {

        List<String> resolvedAgencies = new ArrayList<>();
        if (agencyList != null) {
            for (String a : agencyList) {
                if (a != null && !a.isBlank()) {
                    for (String sub : a.split(",")) {
                        String name = agencyService.resolveAgencyName(sub.trim());
                        if (name != null && !name.isBlank()) resolvedAgencies.add(name);
                    }
                }
            }
        }
        if (agenciesParam != null) {
            for (String a : agenciesParam) {
                if (a != null && !a.isBlank()) {
                    for (String sub : a.split(",")) {
                        String name = agencyService.resolveAgencyName(sub.trim());
                        if (name != null && !name.isBlank()) resolvedAgencies.add(name);
                    }
                }
            }
        }

        BidNoticeQuery q = new BidNoticeQuery(resolvedAgencies, noticeType, keyword, bgngDt, endDt, page, limit);
        return noticeService.search(q).toDto();
    }

    /**
     * 외부 API 연동 오류 → {"message"} 계약 유지, 상태는 502(BAD_GATEWAY).
     */
    @ExceptionHandler(G2bException.class)
    public ResponseEntity<Map<String, String>> handleG2b(G2bException ex) {
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                .body(Map.of("message", ex.getMessage()));
    }
}
