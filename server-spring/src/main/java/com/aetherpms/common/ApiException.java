package com.aetherpms.common;

import org.springframework.http.HttpStatus;

/**
 * 라우트에서 상태코드를 지정해 던지는 도메인 예외.
 * Node의 HttpError(statusCode, message)와 동일 역할.
 * GlobalExceptionHandler가 {"message": ...} 로 매핑한다.
 */
public class ApiException extends RuntimeException {
    private final HttpStatus status;

    public ApiException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public static ApiException badRequest(String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, message);
    }

    public static ApiException notFound(String message) {
        return new ApiException(HttpStatus.NOT_FOUND, message);
    }

    /** 참조 가드(카탈로그·회사·워크플로 삭제 등) — Node HttpError(409). */
    public static ApiException conflict(String message) {
        return new ApiException(HttpStatus.CONFLICT, message);
    }

    /** 전이 조건 미충족 — Node HttpError(422). */
    public static ApiException unprocessable(String message) {
        return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, message);
    }

    /** 행위자 미식별(알림 읽음 등) — Node HttpError(401). */
    public static ApiException unauthorized(String message) {
        return new ApiException(HttpStatus.UNAUTHORIZED, message);
    }

    /** 권한 부족(RBAC 0031) — 403. */
    public static ApiException forbidden(String message) {
        return new ApiException(HttpStatus.FORBIDDEN, message);
    }
}
