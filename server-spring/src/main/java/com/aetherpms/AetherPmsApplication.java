package com.aetherpms;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

/**
 * AetherPMS Spring 백엔드 진입점 (0013 재플랫폼 첫 마일스톤).
 * Node/Fastify → Spring Boot + MariaDB 이식의 수직 슬라이스.
 */
@SpringBootApplication
@ConfigurationPropertiesScan
public class AetherPmsApplication {
    public static void main(String[] args) {
        SpringApplication.run(AetherPmsApplication.class, args);
    }
}
