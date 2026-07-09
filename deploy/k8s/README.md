# AetherPMS dev 배포 (우리 K8s) — 얕은 파이프라인

0013 §C-3 "우리 인프라(개발)는 K8s, 양쪽 동일 컨테이너 이미지". 로컬 Compose와 **같은 Dockerfile**을
빌드해 dev 클러스터에 올린다. Compose와 이름을 맞춰(`app`·`db` Service) nginx.conf/DATABASE_URL을 무변경 재사용.

## 구성
```
Ingress(HOST) → web(nginx) ──/app 정적──┐
                     └──/api 프록시──▶ app(Spring) ──▶ db(MariaDB, StatefulSet+PVC)
```
- `deploy/k8s/dev/namespace.yaml` · `db.yaml` · `app.yaml` · `web.yaml` · `secret.example.yaml`
- `Jenkinsfile`(리포 루트): 빌드→푸시→배포.

## 인프라팀이 채울 값 (플레이스홀더)
| 위치 | 값 |
|---|---|
| `Jenkinsfile` `REGISTRY` / app·web.yaml `REGISTRY_PLACEHOLDER` | Harbor/Nexus 주소 (예: `harbor.도메인/aetherpms`) |
| `web.yaml` Ingress `HOST_PLACEHOLDER` | dev 접속 도메인 |
| `web.yaml` `ingressClassName`/annotations | 클러스터 인그레스 컨트롤러 |
| `db.yaml` `storageClassName` | 클러스터 스토리지클래스(기본이면 생략) |
| Jenkins credential `registry-cred` | 레지스트리 로그인 |
| Jenkins credential `kubeconfig-dev` | dev 클러스터 kubeconfig |

## 부트스트랩 (최초 1회)
```bash
# 1) DB 시크릿 생성(커밋 금지 — secret.example.yaml 참고)
kubectl -n aetherpms-dev create secret generic aetherpms-db-secret \
  --from-literal=username=aetherpms \
  --from-literal=password='<실제값>' \
  --from-literal=root-password='<실제값>'
# 2) 이후 Jenkins 잡이 namespace/db/app/web apply + 이미지 롤아웃을 자동 수행
```

## Jenkins 잡
- 파이프라인 잡(멀티브랜치 or 단일), SCM=이 리포, 스크립트 경로=`Jenkinsfile`.
- 트리거: `impl/0013-spring-backend` push(웹훅 or 폴링).

## 지금 범위 / 이후
- **지금(얕음)**: dev 단일 타깃, push→빌드→배포.
- **이후(안정화 후)**: 멀티환경 승격(stg/prod), 품질 게이트 강화, Helm 차트화, DB 분리(0013 M/L 티어),
  시크릿 Vault/SealedSecret, 나라장터 serviceKey 등 앱 시크릿 주입.
