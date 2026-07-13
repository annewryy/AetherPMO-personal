# AetherPMS — API 인벤토리

> 백엔드(Spring, `/api`) 엔드포인트 전체 목록. 기준: `impl/0013-spring-backend` (2026-07-13).
> 전체 구조는 [ARCHITECTURE.md](ARCHITECTURE.md). 프론트는 **`web/src/lib/dataClient.ts`**를 통해서만 호출.

## 공통 규약
- **응답**: camelCase 도메인 DTO(프론트 `types.ts` 계약과 일치). 날짜는 `yyyy-MM-dd` 문자열.
- **행위자**: `X-User-Id` 헤더(uuid, 데모용). 미식별 시 ANONYMOUS. (0005에서 실 인증으로 교체 예정)
- **쓰기 본문**: 작업화면 PATCH·이슈/액션 생성은 **snake_case 필드**(예: `project_id`, `owner_name`). 그 외(멤버·조직·자사화 등)는 camelCase. 각 항목에 표기.
- **오류**: `{ "message": "..." }` + 상태코드(400 검증, 404 없음, 409 충돌, 422 규칙위반).
- **쓰기 게이트**: 쓰기는 `API_BASE`(백엔드) 연결 시에만. 폴백(Supabase) 모드에선 비활성.

---

## 프로젝트 · 읽기 (`project`, `reads`)
| Method | Path | 설명 |
|---|---|---|
| GET | `/api/projects` | 프로젝트 목록(필터·페이징) |
| GET | `/api/projects/{id}` | 단건(컨소시엄 포함) |
| POST | `/api/projects` | 생성(camelCase: name 필수, pmName 등). 발번 자동 |
| PATCH | `/api/projects/{id}` | 부분수정(camelCase, 변경분만) |
| GET | `/api/projects/{id}/tasks` | 제안 태스크 트리 |
| GET | `/api/projects/{id}/issues` | 이슈/리스크 |
| GET | `/api/projects/{id}/action-items` | 액션아이템 |
| GET | `/api/projects/{id}/deliverables` | 산출물 |
| GET | `/api/projects/{id}/members` | 참여인력(상세 필드 포함) |
| GET | `/api/projects/{id}/meeting-minutes` | 회의록 |
| GET | `/api/projects/{id}/official-docs` | 공문 |
| GET | `/api/projects/{id}/activities` | 활동로그 |
| GET | `/api/projects/{id}/progress` | 진척 롤업(0006, 프로세스별·전체) |
| GET | `/api/projects/{id}/wbs` | WBS/일정 트리(간트·목표/실제) |
| GET | `/api/projects/{id}/vrb` | VRB 정보 |
| GET | `/api/tasks/{id}` · `/api/issues/{id}` · `/api/action-items/{id}` · `/api/deliverables/{id}` | 아이템 단건(상세 페이지 진입) |

## 작업 화면 쓰기 (`write`, `issue`)
| Method | Path | 설명 |
|---|---|---|
| PATCH | `/api/tasks/{id}` | snake_case: status·progress_rate·actual_*_date·**assignee_name**(+comment) |
| PATCH | `/api/issues/{id}` | snake_case: status·priority·due_date·resolved_date·**owner_name**·title |
| PATCH | `/api/action-items/{id}` | snake_case: status·**assignee_name**·due_date·title |
| PATCH | `/api/deliverables/{id}` | camelCase: **authorName**(담당자)·dueDate (상태는 전이로만) |
| POST | `/api/issues` | 이슈/리스크 생성(snake_case: project_id 등) |
| POST | `/api/action-items` | 액션아이템 생성(snake_case) |
| POST | `/api/meeting-minutes` | 회의록 생성 |
| POST | `/api/issues/{id}/convert-to-issue` | 리스크→이슈 수동 전환(0008) |

## 워크플로 전이 · 관리 (`engine`, `write`)
| Method | Path | 설명 |
|---|---|---|
| GET | `/api/{entity}/{id}/transitions` | 가용 전이(조건 평가, 비활성 사유). entity=deliverables 등 |
| POST | `/api/{entity}/{id}/transition` | 전이 실행 `{ transition_id, comment? }` |
| GET | `/api/workflows` | 워크플로 정의 전체(상태·전이·조건) |
| POST/PATCH/DELETE | `/api/workflows[/{id}]` | 워크플로 CRUD(관리자) |
| POST/PATCH/DELETE | `/api/workflows/{id}/statuses[/{statusId}]` | 상태 CRUD |
| POST/DELETE | `/api/workflows/{id}/transitions[/{transitionId}]` | 전이 CRUD |
| POST/PATCH/DELETE | `/api/transitions/{id}/conditions[/{conditionId}]` | 전이 조건 CRUD |

## 코멘트 · 알림 (`write`)
| Method | Path | 설명 |
|---|---|---|
| GET/POST | `/api/{entity}/{id}/comments` | 코멘트 조회/작성(@멘션). entity=ISSUE·ACTION_ITEM·DELIVERABLE·TASK 경로 세그먼트 |
| GET | `/api/notifications` | 현재 사용자 알림 |
| PATCH | `/api/notifications/{id}/read` | 읽음 |
| POST | `/api/notifications/read-all` | 전체 읽음 |

## 인력 · 참여인력 · 조직 (`person`, `org`)
| Method | Path | 설명 |
|---|---|---|
| GET | `/api/persons` | 인력 마스터 목록(구분·검색 필터) |
| GET | `/api/persons/{id}` · `/api/persons/{id}/projects` | 상세 · 참여 이력 |
| POST | `/api/projects/{id}/members` | 참여인력 등록(camelCase: name·amaranthEmpNo·department 등). person find-or-insert |
| PATCH | `/api/projects/{id}/members/{memberId}` | 참여인력 수정 |
| DELETE | `/api/projects/{id}/members/{memberId}` | 참여인력 삭제(하드) |
| GET | `/api/org/departments` | 부서 트리(평탄, memberCount) |
| GET | `/api/org/members?deptCode=&q=&includeResigned=` | 조직 회원 검색(내부) |
| GET | `/api/org/external-members?q=` | 외부 인력(pms_person source=EXTERNAL) |
| POST | `/api/admin/org-sync` | 아마란스 view→미러 동기화(수동 배치) |

## 자사화 전환 (`insourcing`)
| Method | Path | 설명 |
|---|---|---|
| POST | `/api/insourcing-transitions` | 전환 요청 `{personId, reason?}` |
| GET | `/api/insourcing-transitions?status=&personId=` | 전환 현황 목록 |
| GET | `/api/persons/{id}/insourcing-transition` | 인력의 진행중 전환(없으면 204) |
| PATCH | `/api/insourcing-transitions/{id}` | 상태전이 `{action: doc_sent|approve|reject|cancel}` (승인 시 employment_type=insourced) |

## 나라장터 (`g2b`)
| Method | Path | 설명 |
|---|---|---|
| GET | `/api/bid-agencies` | 발주기관 목록 |
| GET | `/api/bid-notices` | 공고 조회(본공고, 필터·기간) |
| GET | `/api/bid-notices/{bidNtceNo}` | 공고 상세(inqryDiv=2 전체) |

## 진척 · 신호 · 관리자 (`progress`, `write`)
| Method | Path | 설명 |
|---|---|---|
| GET | `/api/dashboard/signals` | 대시보드 신호(지연·리스크 등, 0007) |
| POST | `/api/signals/evaluate` | 신호 재평가 |
| GET/POST | `/api/signal-rules` · PATCH/DELETE `/api/signal-rules/{id}` | 신호 규칙 CRUD |
| POST | `/api/official-docs` · PATCH/DELETE `/api/official-docs/{id}` | 공문 CRUD(아마란스 결재 경계) |
| GET/POST | `/api/companies` · PATCH/DELETE `/api/companies/{id}` | 회사 마스터 CRUD |
| GET | `/api/catalog/tree` | 카탈로그 트리 |
| POST | `/api/catalog/nodes` · PATCH/DELETE `/api/catalog/nodes/{id}` | 카탈로그 노드 CRUD |
