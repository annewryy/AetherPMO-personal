---
id: 0018
title: 파일 저장/업로드 — FilePort + NAS(S3 호환) 아키텍처 계획
status: DRAFT (계획 — 개발서버/스토리지 확정 시 착수)
scope: [backend, web-ui, schema, infra]
depends: [0013, 0005]
---

# 파일 저장/업로드 (FilePort/NAS)

산출물·첨부·템플릿 등 파일을 **개발서버 NAS에 보관**한다(아마란스 원챔버 참조 방식 폐기, 2026-07-09 전환
[[amaranth-integration-boundary]]). 지금은 로컬에 NAS가 없어 **구현 전 계획만** 세운다. 단, **로컬에서도
MinIO(S3 호환)로 개발 가능**하게 설계해 개발서버를 기다리지 않는다.

## 결정/방향
- **FilePort 포트 + 어댑터**(0013 §B-2). 코어는 `FilePort`만 의존, 저장 방식은 어댑터가 흡수.
- **S3 호환 API 우선**(추천): 로컬=MinIO 컨테이너, 프로덕션=NAS S3 게이트웨이(or NAS 위 MinIO). 동일
  `S3Adapter`, **엔드포인트/버킷만 config 교체**. NAS가 S3 미지원이면 `NfsAdapter`(마운트) 폴백.
- **왜 S3 호환**: presigned URL로 클라↔NAS 직접 업/다운(앱이 바이트 경유 안 함) → K8s 친화·대용량 유리.
  NFS 마운트는 K8s에서 볼륨 의존이 큼.

## A. FilePort 인터페이스 (포트)
```
FilePort:
  put(key, stream, contentType, size)      # 앱 경유 저장
  get(key) -> stream                       # 앱 경유 조회
  presignPut(key, ttl) -> url              # 클라 직접 업로드 URL
  presignGet(key, ttl) -> url              # 클라 직접 다운로드 URL
  delete(key) / exists(key)
어댑터: S3Adapter(MinIO/NAS-S3) | NfsAdapter(NFS/SMB 마운트) | AmaranthOnechamberAdapter(후속·옵션)
설정으로 선택: file.adapter=s3|nfs, s3.endpoint/bucket/keys 주입.
```

## B. 데이터 모델 (기존 컬럼 그대로 활용 — 스키마 변경 최소)
- `pms_attachment.file_ref` = **NAS 스토리지 키**(오브젝트 키/경로). `file_name·file_size·content_type·
  uploaded_by·uploaded_at` 이미 존재. `entity_type/entity_id`로 대상(프로젝트·이슈·공문·회의록·산출물 등).
- `pms_deliverable_version.file_ref` = 산출물 제출 파일 키(버전별). `file_name` 있음.
- `pms_catalog_node.template_file_ref` = 표준 산출물 **템플릿** 키.
- **키 규약(안)**: `{entityType}/{entityId}/{uuid}__{원본파일명}` (충돌·추측 방지). 버전은 `.../{versionId}/...`.
- (선택 V11) `checksum`(무결성)·`storage_backend` 컬럼 추가 검토 — 지금은 file_ref만으로 충분.

## C. 업로드 플로우
- **직접형(권장·대용량)**: 클라 → `POST /api/files/presign`(파일명·타입·크기) → 앱이 키 생성 + **presigned PUT URL**
  반환 → 클라가 NAS로 직접 PUT → 클라 → `POST /api/attachments`(키·메타) → 앱 `exists` 검증 후 `pms_attachment` insert.
- **경유형(소용량·간단)**: 클라 → `POST /api/attachments`(multipart) → 앱 검증 → `FilePort.put` → insert.
- **산출물 제출**: 동일 업로드 → `pms_deliverable_version`(file_ref) 생성 + status 전이.

## D. 다운로드 플로우
- `GET /api/attachments/{id}/download` → 접근권한 검증 → **presigned GET URL 302 리다이렉트**(직접 다운로드)
  or 앱 스트리밍. 카탈로그 "템플릿 다운로드"도 template_file_ref → presigned GET.

## E. 보안·검증
- 타입 화이트리스트(hwp·hwpx·pdf·docx·xlsx·pptx·이미지 등), **크기 상한**, 파일명 새니타이즈(경로탐색 차단),
  키에 UUID.
- **접근제어**: entity 접근 권한(프로젝트 멤버/역할, 0005 인증 도입 후 연동). presigned URL **짧은 TTL**.
- (선택) 바이러스 스캔 훅, 다운로드 감사로그.

## F. 환경 구성
- **로컬 dev**: `docker-compose.dev.yml`에 **MinIO 컨테이너 추가**(S3 API + 콘솔) → `S3Adapter`가 MinIO 지정.
  → 지금 로컬에서 업/다운로드 개발·테스트 가능(개발서버 불필요).
- **개발서버/프로덕션**: NAS S3 게이트웨이(or NAS 위 MinIO). 같은 `S3Adapter`, endpoint/bucket/keys만 주입
  (env/K8s Secret). NFS만이면 `NfsAdapter` + 마운트.

## G. stub 대체 매핑 (현재 `stub('amaranth')` → 실구현)
| 현재 stub | 대체 |
|---|---|
| DetailPanel "첨부파일 열기" | 첨부 다운로드(presigned) |
| CatalogDetailPanel "템플릿 다운로드/일괄 다운로드" | 템플릿 키 다운로드 |
| "아마란스 연동 예정"(파일/버전 표시) | 실제 파일명/버전 |
| (신규) 산출물 제출 UI | 업로드 → deliverable_version |
- 라벨 "아마란스" → "NAS"로 정리.

## H. 구현 단계 (MinIO/개발서버 준비되면)
- **P1**: FilePort + S3Adapter + 로컬 MinIO(compose) + 설정 주입.
- **P2**: 첨부 업로드/다운로드 API(경유형→직접형/presigned) + `pms_attachment` 배선.
- **P3**: 산출물 제출(버전) + 카탈로그 템플릿 다운로드 → `stub('amaranth')` 대체.
- **P4**: 접근제어(0005 연동), 대용량 presigned, (선택) 스캔·감사.

## I. MinIO → 실 NAS 전환 리스크 (중요 — "설정만 바꾸면 끝"이 아님)
MinIO로 만든 **앱 로직·API·데이터모델은 그대로 재사용**되지만, 실 NAS 연결은 NAS 종류에 좌우된다.
- **경우 A — NAS가 S3 게이트웨이 지원**: 대체로 config 교체(endpoint/bucket/keys)로 되나 **호환성 튜닝 1~2일**:
  path-style(`pathStyleAccess=true`) 필수, presigned URL은 **브라우저가 NAS 엔드포인트에 직접 접근 가능해야**
  동작(내부망 전용이면 앱 경유 폴백), **CORS** 설정, TLS/자체서명 인증서, multipart·버킷생성 지원 여부.
- **경우 B — NAS가 NFS/SMB만**: `S3Adapter` 불가 → **`NfsAdapter`(마운트)로 교체**. **FilePort 뒤라 앱·API·
  데이터모델은 불변**, 어댑터만 교체(재작성 아님).
- **리스크 완화 설계**: ① FilePort 추상화(코어 불변) ② **presigned + proxied(앱 스트리밍) 둘 다 지원**(NAS에서
  presigned/CORS 막히면 폴백) ③ **NAS 확보 즉시 호환성 스모크 테스트 먼저**(연결·path-style·presigned·CORS
  30분 확인) → 어댑터·모드 확정 후 본구현.

## 미결 / 인프라 확인 필요
- **개발서버 NAS 정체 3개 확인(결정적)**: ① S3 게이트웨이 지원 여부 ② 벤더/모델 ③ 내부망 전용 여부.
  → 이걸로 경우 A/B와 튜닝 범위 확정.
- 파일 크기 상한·허용 타입 확정, 보존/삭제(soft delete) 정책, checksum 도입 여부.
- 로컬 MinIO를 compose에 상시 둘지(개발 편의) vs 프로파일 분리.
