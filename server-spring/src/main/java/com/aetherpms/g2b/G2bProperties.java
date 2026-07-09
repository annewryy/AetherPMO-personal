package com.aetherpms.g2b;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 나라장터(조달청) OpenAPI 연동 설정 (설계 0016 §B/§serviceKey).
 *
 * serviceKey는 코드에 하드코딩하지 않고 env로 주입한다(application.yml g2b.service-key).
 * 키가 비면 조회는 500이 아니라 명확한 4xx/빈결과로 처리(G2bNoticeService 참조).
 */
@ConfigurationProperties(prefix = "g2b")
public class G2bProperties {

    /** 조달청 인증키. env G2B_SERVICE_KEY 주입. 미설정 시 조회 비활성. */
    private String serviceKey = "";

    /** OpenAPI 베이스 URL. 레거시(api/g2b.js)와 동일 호스트. */
    private String baseUrl = "https://apis.data.go.kr/1230000";

    /** 본공고 오퍼레이션 경로 — 레거시 오라클. */
    private String noticePath = "/ad/BidPublicInfoService/getBidPblancListInfoServc";

    /** 사전규격 오퍼레이션 경로 — 나라장터 사전규격정보서비스(용역). */
    private String preSpecPath = "/ao/HrcspSsstndrdInfoService/getPublicPrcureThngInfoServcPPSSrch";

    /** 사전규격 실연동 플래그. 오퍼레이션/필드 최종검증 전까지 기본 off. */
    private boolean preSpecEnabled = false;

    /** 외부 호출 타임아웃(ms). 레거시와 동일 15s. */
    private int timeoutMs = 15000;

    /** 조회 결과 캐시 TTL(초). */
    private int cacheTtlSeconds = 300;

    public String getServiceKey() { return serviceKey; }
    public void setServiceKey(String serviceKey) { this.serviceKey = serviceKey; }

    public String getBaseUrl() { return baseUrl; }
    public void setBaseUrl(String baseUrl) { this.baseUrl = baseUrl; }

    public String getNoticePath() { return noticePath; }
    public void setNoticePath(String noticePath) { this.noticePath = noticePath; }

    public String getPreSpecPath() { return preSpecPath; }
    public void setPreSpecPath(String preSpecPath) { this.preSpecPath = preSpecPath; }

    public boolean isPreSpecEnabled() { return preSpecEnabled; }
    public void setPreSpecEnabled(boolean preSpecEnabled) { this.preSpecEnabled = preSpecEnabled; }

    public int getTimeoutMs() { return timeoutMs; }
    public void setTimeoutMs(int timeoutMs) { this.timeoutMs = timeoutMs; }

    public int getCacheTtlSeconds() { return cacheTtlSeconds; }
    public void setCacheTtlSeconds(int cacheTtlSeconds) { this.cacheTtlSeconds = cacheTtlSeconds; }

    /** 키가 실제 주입되었는지(공백 무시). */
    public boolean hasServiceKey() {
        return serviceKey != null && !serviceKey.trim().isEmpty();
    }
}
