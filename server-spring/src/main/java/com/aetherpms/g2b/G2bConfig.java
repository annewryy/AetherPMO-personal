package com.aetherpms.g2b;

import java.time.Duration;

import org.springframework.boot.web.client.ClientHttpRequestFactorySettings;
import org.springframework.boot.web.client.ClientHttpRequestFactories;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/**
 * 나라장터 OpenAPI 호출용 RestClient 빈 (설계 0016 — RestClient 사용).
 * 타임아웃은 레거시(api/g2b.js) 15s 기본. 테스트는 이 빈을 목/스텁으로 교체.
 */
@Configuration
public class G2bConfig {

    @Bean
    RestClient g2bRestClient(G2bProperties props) {
        Duration t = Duration.ofMillis(props.getTimeoutMs());
        ClientHttpRequestFactorySettings settings = ClientHttpRequestFactorySettings.DEFAULTS
                .withConnectTimeout(t)
                .withReadTimeout(t);
        ClientHttpRequestFactory factory = ClientHttpRequestFactories.get(settings);
        return RestClient.builder()
                .baseUrl(props.getBaseUrl())
                .requestFactory(factory)
                .build();
    }
}
