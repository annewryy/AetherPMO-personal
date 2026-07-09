# AetherPMS web 컴포넌트 이미지 (0013 §C) — Vue(/app) 빌드 후 nginx로 서빙.
# 빌드 컨텍스트 = 저장소 루트(vite outDir '../app'가 루트 /app 에 산출되므로).

# ---- build ----
FROM node:20-alpine AS build
WORKDIR /src
# 의존성 레이어 캐시
COPY web/package.json web/package-lock.json ./web/
RUN cd web && npm ci
# 소스 복사 후 빌드 → outDir ../app → /src/app (base '/app/')
COPY web ./web
RUN cd web && npm run build
# Supabase 읽기 폴백(미구현 슬라이스 대비) 설정을 산출물에 주입.
# dev 기본값은 테스트 프로젝트 값(클라이언트 공개 anon key). 배포 시 build-arg로 교체 가능.
ARG SUPABASE_URL=https://zfhmbshxokoygmdaavqz.supabase.co
ARG SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpmaG1ic2h4b2tveWdtZGFhdnF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3MTI5MjcsImV4cCI6MjA5ODI4ODkyN30.jBo6P6TsQnY4TBfLKK46i6v7qi9WDAWkpNxHXB5ra6Q
RUN printf 'window.SUPABASE_CONFIG={url:"%s",anonKey:"%s"};\n' "$SUPABASE_URL" "$SUPABASE_ANON_KEY" > /src/app/supabase-config.js

# ---- runtime ----
FROM nginx:1.27-alpine AS runtime
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/app /usr/share/nginx/html/app
EXPOSE 80
