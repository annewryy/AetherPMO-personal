# AetherPMS — 프론트엔드 (`web/`) 구조 & 보안

> `/app`(우리 제품)의 Vue3 프론트엔드. 파일 구조·라우팅·데이터 계층·**인증/보안 현황**을 정리.
> 기준: `impl/0013-spring-backend` (2026-07-13). 상위 개요는 [ARCHITECTURE.md](ARCHITECTURE.md), API는 [API.md](API.md).

---

## 1. 스택 & 빌드

- **Vue 3 + Vite + TypeScript**, vue-router. 상태관리 라이브러리(Pinia/Vuex) **없음** — 컴포넌트 로컬 상태 + 소수 모듈 `ref`.
- **빌드**([web/vite.config.ts](../web/vite.config.ts)): `base: '/app/'`(자산 경로), `outDir: '../app'`(저장소 루트 `/app`로 빌드 → Vercel `outputDirectory: '.'`이 통째로 서빙).
- 진입: [web/index.html](../web/index.html) → `/supabase-config.js`(빌드 시 생성) 로드 → `src/main.ts` → `createApp(App).use(router)`.

---

## 2. 디렉토리 구조 (`web/src/`)

```
src/
├─ main.ts            앱 부트스트랩
├─ App.vue            셸(사이드바 네비 + 상단바 + <router-view>)
├─ router.ts          라우트 정의(단일 파일)
├─ types.ts           모든 도메인 타입(프론트-백엔드 계약)
├─ style.css          전역 스타일(CSS 변수 테마)
├─ views/    (14)     라우트 화면(1 route ≈ 1 view)
│   └─ admin/  (5)    관리자 서브모듈
├─ components/ (34)   재사용 컴포넌트(모달·필드·패널·뱃지 등)
└─ lib/       (9)     비-UI 로직: 데이터·유틸
```

### `lib/` (핵심)
| 파일 | 역할 |
|---|---|
| **`dataClient.ts`** | **단일 데이터 경계.** 모든 읽기/쓰기. 백엔드/Supabase 이중 모드 분기 |
| `currentUser.ts` | 현재 사용자 uuid(데모 신원) — X-User-Id 소스, localStorage 유지 |
| `supabase.ts` | Supabase 클라 지연 생성(폴백 모드) |
| `pagination.ts` / `useGlobalList.ts` | 공통 페이징·전역 목록 훅 |
| `mentions.ts` | @멘션 파싱/후보 |
| `displayCode.ts` · `personLabels.ts` | 표시 코드·인력구분 라벨 |
| `stub.ts` | 미구현/아마란스 위임 기능 안내 stub |

### `views/`
Dashboard · ProjectList · **ProjectDetail**(탭: 개요/WBS/산출물/회의록/이슈/액션/공문/참여인력/활동로그) · ItemDetail(태스크·이슈·액션·산출물 단건) · Issues · ActionItems · MeetingMinutes · OfficialDocs · Catalog · DeliverableSearch · ResourceManagement(인력관리) · BidNoticeSearch · BidNoticeDetail · admin/(Catalog·Companies·SignalRules·Workflows)

### `components/` (재사용 핵심)
- **ModalShell** — 공통 모달 셸(오버레이·헤더·푸터 슬롯). 대부분 모달이 이걸 씀
- **OrgPickerModal / OrgPersonField** — 조직도 선택(내부/외부 트리·검색). 담당자/PM 지정에 재사용
- **StatusMenu / WorkflowViewModal** — 상태 변경 드롭다운 + 워크플로 보기
- **ItemDetailBody** — 드로어·상세페이지 공용 본문(중복 구현 금지)
- **WbsSchedule** — WBS 간트+진척. **ProjectMembers/ProjectMemberFormModal** — 참여인력
- **CommentThread/Composer** — 코멘트·멘션. **Pager/PageSizeSelect** — 페이징. **StatusBadge/StageBadge**

---

## 3. 라우팅 ([router.ts](../web/router.ts))

- **`createWebHistory(import.meta.env.BASE_URL)`** — 빌드에선 base `/app/`, dev에선 `/`.
- **딥링크**(`/app/...` 새로고침): SPA fallback을 **인프라가 처리** — dev nginx `try_files`, Vercel `vercel.json` rewrite `/app/(.*) → /app/index.html`.
- 주요 라우트: `/`→`/projects` 리다이렉트, `/projects`, `/projects/:id(\d+)`, `/tasks|issues|action-items|deliverables/:id(\d+)`(아이템 상세), `/persons`, `/bid-notices[/:no]`, `/admin/*`(중첩), `catch-all → /projects`.
- **네비게이션 가드 없음** — 라우트는 전부 공개(인증 게이트 없음). → [§5 보안](#5-인증--보안-현황).

---

## 4. 데이터 계층 — `dataClient` 이중 모드

**모든 데이터 접근은 `dataClient`를 통한다**(0004 불변 계약). 컴포넌트가 fetch/Supabase를 직접 호출하지 않는다.

```
window.API_BASE 있음 → 백엔드 모드: apiGet/apiSend → `${API_BASE}/api/...`  (camelCase 도메인 모델)
window.API_BASE 없음 → 폴백 모드: Supabase 직결(읽기 위주). 쓰기·백엔드 전용 기능은 비활성 + 안내
```

- `API_BASE` 주입: **dev = nginx `sub_filter`**(`window.API_BASE=location.origin`), **Vercel = 미주입**(→ 폴백).
- `apiGet<T>(path)` — GET + `X-User-Id` 헤더. 실패 시 서버 `{message}`를 그대로 throw.
- `apiSend<T>(method, path, body)` — POST/PATCH/DELETE. `API_BASE` 없으면 **즉시 throw**(쓰기 게이트). 204 처리.
- 폴백에서 백엔드 전용(WBS·persons·org·transitions 등)은 `[]`/`null` 반환 + 화면 안내. 미구현은 `stub()`.

---

## 5. 인증 · 보안 현황

> ⚠️ **정직한 현재 상태**: 실 인증은 아직 없다. 데모/온프렘 전제이며, 아래는 "지금 어떻게 처리하는지"와 "빠진 것"을 함께 적는다.

### 인증 / 신원
- **실 로그인 없음.** 현재 신원 = **상단바 사용자 선택기**가 고른 uuid(`currentUser.ts`, localStorage 유지).
- 이 uuid를 `dataClient`가 **`X-User-Id` 헤더**로 주입 → 백엔드 `CurrentActor`가 신뢰(데모 한정).
- **실 로그인/인증은 설계 0005(미구현)**. 아마란스는 비밀번호를 주지 않아 SSO 위임 불가 → 자체 로그인 별도 설계 필요.
- **라우트 가드·권한(RBAC) 없음** — 모든 화면·기능이 누구에게나 열림. 인증 도입 시 네비 가드·역할 검사 추가 필요.

### XSS / 인젝션
- **`v-html` 미사용** — Vue 기본 이스케이프로 사용자 입력이 HTML로 실행되지 않음(XSS 표면 작음).
- 개인정보·민감정보를 URL 쿼리에 싣지 않음. @멘션은 텍스트 파싱만.

### 시크릿 / 키
- **프론트 번들에 서버 시크릿 없음** — 나라장터 `G2B_SERVICE_KEY`·DB 자격증명은 **백엔드 전용**(env). 프론트는 `/api`만 호출.
- **Supabase anon key**는 공개 전제 키(빌드 시 `build-config.js`가 env→`supabase-config.js` 생성). 보안은 Supabase **RLS**에 의존. **백엔드 모드에선 Supabase 미사용**.

### 전송 / 헤더
- **쓰기 게이트**: 쓰기는 `API_BASE`(백엔드) 연결 시에만. 폴백에선 컨트롤 비활성.
- 백엔드는 same-origin(`/api`) — dev nginx 프록시라 CORS 불필요.
- **nginx에 보안 헤더 없음**(CSP·X-Frame-Options·X-Content-Type-Options·HSTS 미설정) — **개선 대상**.

### 요약 (갭)
| 항목 | 현재 | 갭/후속 |
|---|---|---|
| 인증 | X-User-Id 데모 신원(선택기) | **실 로그인(0005)** 필요 |
| 인가(RBAC) | 없음 | 역할·라우트 가드 필요 |
| XSS | v-html 미사용(양호) | — |
| 시크릿 | 백엔드 전용(양호) | Supabase는 RLS 의존 |
| 보안 헤더 | 없음 | CSP/HSTS 등 추가 |

---

## 6. 규약 (컨벤션)

- **단일 데이터 경계**: 컴포넌트는 `dataClient`만 사용(직접 fetch/Supabase 금지).
- **목록/검색**: 페이징(공통 페이지크기 10/20/50/100 셀렉트) + Row No. 컬럼([pagination.ts](../web/src/lib/pagination.ts)).
- **더미 데이터 금지**: 미구현/무데이터는 지어내지 말고 "—"·빈 상태·`stub()` 안내.
- **API_BASE 게이트**: 쓰기·백엔드 전용 기능은 폴백에서 비활성 + 안내 노출.
- **재사용 우선**: 드로어·상세 공용 본문(ItemDetailBody), 조직도 선택(OrgPickerModal), 모달 셸(ModalShell) 등 중복 구현 금지.
- **오류 표면화**: 서버 `{message}`를 사용자에게 그대로 노출(임의 문구로 덮지 않음).

---

## 7. 알려진 갭 / 다음

- **실 로그인/인가(0005)** — 최우선. 현재 데모 신원 → 실 인증 + RBAC + 라우트 가드.
- **보안 헤더**(CSP·HSTS 등) nginx 추가.
- **UI 완성도** — 상세·모달 밀도/폭 일관성 폴리시(개요 레이아웃 개선은 완료).
- 파일 업로드(0018 NAS/MinIO) 프론트 연결.
