# AetherPMS Spring 백엔드 이미지 (0013 §C — app 컴포넌트, stateless)
# 멀티스테이지: gradle 빌드(호스트 Java 무관) → JRE 런타임.
# 개발 compose와 우리 K8s가 동일 이미지를 재사용한다.

# ---- build ----
FROM eclipse-temurin:21-jdk AS build
WORKDIR /src
# 의존성 레이어 캐시: 빌드 스크립트/래퍼 먼저 복사 후 웜업
COPY gradlew settings.gradle build.gradle ./
COPY gradle ./gradle
RUN chmod +x gradlew && ./gradlew --no-daemon dependencies >/dev/null 2>&1 || true
# 소스 복사 후 실행 가능 jar 빌드(테스트는 Testcontainers 의존이라 이미지 빌드에선 제외)
COPY src ./src
RUN ./gradlew --no-daemon clean bootJar -x test

# ---- runtime ----
FROM eclipse-temurin:21-jre AS runtime
WORKDIR /app
# 비루트 실행
RUN groupadd -r app && useradd -r -g app app
COPY --from=build /src/build/libs/aetherpms-server-0.0.1-SNAPSHOT.jar app.jar
USER app
EXPOSE 8080
# 컨테이너 메모리 인지 + UTC(스키마 UTC 저장 규약, 0013 A-2)
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-Duser.timezone=UTC", "-jar", "/app/app.jar"]
