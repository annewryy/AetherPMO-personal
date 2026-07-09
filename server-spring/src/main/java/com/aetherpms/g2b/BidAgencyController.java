package com.aetherpms.g2b;

import java.util.List;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 나라장터 공고조회 대상기관 마스터 조회 (설계 0016 §A).
 *   GET /api/bid-agencies — 드롭다운용 목록(sort_order 순). camelCase DTO.
 */
@RestController
public class BidAgencyController {

    private final BidAgencyService service;

    public BidAgencyController(BidAgencyService service) {
        this.service = service;
    }

    @GetMapping("/api/bid-agencies")
    public List<Map<String, Object>> list() {
        return service.list();
    }
}
