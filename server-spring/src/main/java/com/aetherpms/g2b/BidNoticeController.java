package com.aetherpms.g2b;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 나라장터 공고 조회 (설계 0016 §B).
 *   GET /api/bid-notices — agency·noticeType·기간·검색어. 응답: {notices[], totalCount}.
 *
 * agency는 기관명 또는 agencyId(숫자) 모두 허용 → 기관명으로 해석 후 dminsttNm 조회 키로 사용.
 * G2bException(키없음/외부오류)은 500이 아니라 명확한 4xx/503으로 매핑(0016 §serviceKey).
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
            @RequestParam(name = "agency", required = false) String agency,
            @RequestParam(name = "noticeType", required = false, defaultValue = "all") String noticeType,
            @RequestParam(name = "keyword", required = false) String keyword,
            @RequestParam(name = "bgngDt", required = false) String bgngDt,
            @RequestParam(name = "endDt", required = false) String endDt,
            @RequestParam(name = "page", required = false, defaultValue = "1") int page,
            @RequestParam(name = "numOfRows", required = false, defaultValue = "10") int limit) {

        String agencyName = agencyService.resolveAgencyName(agency);
        BidNoticeQuery q = new BidNoticeQuery(agencyName, noticeType, keyword, bgngDt, endDt, page, limit);
        return noticeService.search(q).toDto();
    }

    /**
     * 외부 API 연동 오류 → {"message"} 계약 유지, 상태는 502(BAD_GATEWAY).
     * (인증키 미설정·기간 가드 위반 등도 여기로 — 명확한 메시지로 프론트에 전달. 500 아님.)
     */
    @ExceptionHandler(G2bException.class)
    public ResponseEntity<Map<String, String>> handleG2b(G2bException ex) {
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                .body(Map.of("message", ex.getMessage()));
    }
}
