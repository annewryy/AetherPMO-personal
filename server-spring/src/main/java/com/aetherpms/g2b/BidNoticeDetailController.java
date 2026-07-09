package com.aetherpms.g2b;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/**
 * 나라장터 공고 단건 상세조회 (배치14 / 설계 0017 §A — inqryDiv=2).
 *   GET /api/bid-notices/{bidNtceNo} — 풀필드 리치 상세. 없으면 404 {"message"}.
 *
 * 리스트 조회(GET /api/bid-notices, BidNoticeController)와는 별도 — 목록 회귀 방지.
 */
@RestController
public class BidNoticeDetailController {

    private final BidNoticeDetailService detailService;

    public BidNoticeDetailController(BidNoticeDetailService detailService) {
        this.detailService = detailService;
    }

    @GetMapping("/api/bid-notices/{bidNtceNo}")
    public Map<String, Object> detail(@PathVariable("bidNtceNo") String bidNtceNo) {
        return detailService.getDetail(bidNtceNo).toDto();
    }

    /** 해당 공고 없음 → 404 {"message"}. */
    @ExceptionHandler(BidNoticeNotFoundException.class)
    public ResponseEntity<Map<String, String>> handleNotFound(BidNoticeNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(Map.of("message", ex.getMessage()));
    }

    /** 외부 연동 오류(인증키 미설정·게이트웨이 등) → 502 {"message"}. 리스트 조회와 동일 정책. */
    @ExceptionHandler(G2bException.class)
    public ResponseEntity<Map<String, String>> handleG2b(G2bException ex) {
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                .body(Map.of("message", ex.getMessage()));
    }
}
