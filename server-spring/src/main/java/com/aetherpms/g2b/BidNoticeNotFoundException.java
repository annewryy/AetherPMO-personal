package com.aetherpms.g2b;

/**
 * 공고 단건 상세조회(inqryDiv=2)에서 해당 bidNtceNo 결과가 없을 때 (배치14).
 * 컨트롤러가 404 {"message"}로 매핑 — 외부 오류(502)와 구분한다.
 */
public class BidNoticeNotFoundException extends RuntimeException {
    public BidNoticeNotFoundException(String message) {
        super(message);
    }
}
