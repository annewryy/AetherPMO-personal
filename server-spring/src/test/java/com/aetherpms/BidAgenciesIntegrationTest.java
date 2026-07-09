package com.aetherpms;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.MariaDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * 배치6 — 기관 마스터(V8) 조회 + 공고조회 인증키 가드 통합 테스트.
 * 외부 나라장터 API는 호출하지 않는다(키 미주입 → 명확한 502, 실제 호출 없음).
 * Docker 없으면 클래스 스킵.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
@EnabledIf("dockerAvailable")
class BidAgenciesIntegrationTest {

    static boolean dockerAvailable() {
        return org.testcontainers.DockerClientFactory.instance().isDockerAvailable();
    }

    @Container
    @SuppressWarnings("resource")
    static final MariaDBContainer<?> MARIADB = new MariaDBContainer<>("mariadb:11")
            .withDatabaseName("aetherpms")
            .withUsername("aetherpms")
            .withPassword("aetherpms");

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", MARIADB::getJdbcUrl);
        registry.add("spring.datasource.username", MARIADB::getUsername);
        registry.add("spring.datasource.password", MARIADB::getPassword);
        // 키 미주입 상태(빈값) — 공고조회는 명확한 에러로 처리되어야 한다.
        registry.add("g2b.service-key", () -> "");
    }

    @Autowired
    TestRestTemplate rest;

    private static final ParameterizedTypeReference<Map<String, Object>> MAP = new ParameterizedTypeReference<>() {};
    private static final ParameterizedTypeReference<List<Map<String, Object>>> LIST = new ParameterizedTypeReference<>() {};

    @Test
    void listAgencies_returnsSeeds_sortedCamelCase() {
        ResponseEntity<List<Map<String, Object>>> res =
                rest.exchange("/api/bid-agencies", HttpMethod.GET, null, LIST);
        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        List<Map<String, Object>> agencies = res.getBody();
        assertThat(agencies).hasSize(3);
        assertThat(agencies.get(0)).containsKeys("id", "agencyName", "sortOrder", "isDefault");
        // sort_order 순.
        assertThat(agencies.get(0).get("agencyName")).isEqualTo("국가정보자원관리원");
        assertThat(agencies.get(0).get("isDefault")).isEqualTo(true);
        assertThat(agencies.stream().map(a -> a.get("agencyName")))
                .containsExactly("국가정보자원관리원", "한국지역정보개발원", "한국지능정보사회진흥원");
    }

    @Test
    void bidNotices_withoutServiceKey_returnsClearError_not500() {
        ResponseEntity<Map<String, Object>> res =
                rest.exchange("/api/bid-notices", HttpMethod.GET, null, MAP);
        // 키 미설정 → 502 + {message}(500 아님).
        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_GATEWAY);
        assertThat(res.getBody().get("message").toString()).contains("인증키");
    }
}
