# 0031 — 자체 로그인 + RBAC + 사용자 테이블 정리 (B7)

> [요구 0004](../requirements/0004-rbac-and-ui-adjustments.md) §1(RBAC 5역할)·§3(상단바·사용자 메뉴) +
> [설계 0005](0005-auth-identity.md) §A(자체 로그인)·§G(테이블 정리) 구현.
> 규모가 커서 **첫 슬라이스**(로그인·세션·핵심 RBAC·테이블 정리·상단바 메뉴)로 범위를 확정. 세부 권한 전면 적용·테마 토글은 후속.

- **브랜치**: `impl/0031-rbac-auth`

## A. 스키마 (V20)

- `pms_user`: `person_id BIGINT` FK(→pms_person, ON DELETE SET NULL) 추가 · `password_algo VARCHAR(20)`(해시 알고리즘 태그) 추가 · **role CHECK 3종→5종**(SYS_ADMIN/EXEC_ADMIN/PM/WORKER/VIEWER) MODIFY. 기존 값 매핑: ADMIN→SYS_ADMIN, MEMBER→WORKER, PM 유지.
- `pms_session`(신규): token(PK, 랜덤 32B hex) · user_id FK · created_at · expires_at. 로그아웃/만료 시 삭제.
- **dev 계정 시드**: 역할별 1계정(admin/exec/pm/worker/viewer, 초기 비번 `pms1234!`, PBKDF2 해시). person 매칭은 이메일 기준(없으면 person_id NULL).
- 원본 규칙(0005 §G): 표시명은 person 조인 우선, `full_name`은 폴백으로만 유지(이번엔 폐기 안 함 — 점진).

## B. 백엔드 인증

- `PasswordHasher`(신규): PBKDF2-HMAC-SHA256(솔트 16B, 100k iter). `algo$iter$salt$hash` 포맷. 신규 의존성 0(javax.crypto).
- `AuthController`: `POST /api/auth/login`(username/email+password → 세션 토큰) · `POST /api/auth/logout` · `GET /api/auth/me`(현재 사용자+역할+person) · `POST /api/auth/password`(본인 비번 변경).
- `AuthInterceptor`(신규): `Authorization: Bearer <token>` → 세션 조회 → 사용자·역할을 request attribute에 세팅. **X-User-Id 헤더 폴백 유지**(dev 선택기 하위호환 — 0005 전환 완료 전까지).
- `CurrentActor`: 세션 사용자 우선, 없으면 X-User-Id. Actor에 `role` 노출.

## C. RBAC 적용 (첫 슬라이스 — 핵심 규칙만)

`RbacInterceptor`가 경로·메서드 규칙표로 게이트(요구 0004 §1 매트릭스 중 명확한 것부터):
- **쓰기(POST/PATCH/PUT/DELETE)는 인증 필수**(로그인 안 하면 401). 단 `/api/auth/*` 예외.
- **SYS_ADMIN 전용**: `/api/catalog/nodes*`·`/api/doc-templates*`·`/api/admin/settings*`·`/api/workflows*`·`/api/signal-rules*`·사용자 관리(방법론·시스템 마스터 쓰기 — 0004 §1-1).
- 그 외 세부(참여 프로젝트 스코프 등)는 **프론트 메뉴/버튼 게이트 + 후속 배치**로. 위반은 403 {message}.
- 개방 유지: 읽기(GET)는 로그인 전 게이트 안 함(프론트 라우트 가드가 로그인 유도). RBAC 시행 스위치는 `pms_app_setting`('rbac.enforce') — dev 점진 적용.

## D. 프론트

- `lib/auth.ts`(신규): 토큰 localStorage, `me`(user/role/personName), login/logout/changePassword. dataClient가 토큰을 `Authorization` 헤더로 주입(X-User-Id 유지).
- **LoginView**(`/login`): username/email+password. 성공 시 이전 경로 복귀. 라우트 가드: 미인증 → /login(단 rbac.enforce OFF면 게스트 허용, dev).
- **상단바**(요구 0004 §3): 사용자 칩(이름·역할) + 날짜 + 알림 벨(기존) + **사용자 드롭다운**: 내정보 / 개인설정 / 알림설정 / 비밀번호 변경 / 활동이력 / 로그아웃. 미구현 항목은 안내(placeholder), 비번 변경·로그아웃·활동이력(본인 audit)은 동작.
- **메뉴 게이트**: 역할별 사이드바 항목 표시(관리자 콘솔=SYS_ADMIN, 테일러링 관리 등). 기존 dev 사용자 선택기는 로그인 시 숨김(미로그인 dev만 노출).

## E. 범위 밖(후속)
- 참여-프로젝트 스코프 데이터 필터(PM/WORKER 담당 한정)는 각 도메인 쿼리 레벨 — 별도 배치.
- 테마 토글(0004 §3-3), 개인설정·알림설정 실구현.
- `full_name` 완전 폐기·비정규화 컬럼 정리.

## F. 검증
dev: V20 적용, 역할별 로그인→me, SYS_ADMIN 외 양식 등록 403, 로그아웃 후 쓰기 401(enforce ON), 상단바 드롭다운·비번 변경 왕복. 캡처.
