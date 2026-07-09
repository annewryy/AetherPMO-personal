package com.aetherpms.g2b;

/**
 * 나라장터 외부 API 연동 실패 (인증키 미설정/게이트웨이 오류/파싱 실패 등).
 * G2bNoticeController에서 명확한 4xx로 매핑(500 아님, 설계 0016 §serviceKey).
 */
public class G2bException extends RuntimeException {
    public G2bException(String message) {
        super(message);
    }

    public G2bException(String message, Throwable cause) {
        super(message, cause);
    }
}
