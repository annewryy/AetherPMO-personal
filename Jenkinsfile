// AetherPMS 얕은 CD 파이프라인 (0013 §C-3 — 우리 K8s dev 배포)
//   트리거: impl/0013-spring-backend push
//   흐름:  빌드/테스트 → 이미지 2종 빌드 → 레지스트리 push(SHA 태그) → dev K8s 배포
// 안정화 후 확장 예정(멀티환경 승격·품질 게이트·Helm). 지금은 dev 단일 타깃.
//
// 필요한 Jenkins 사전설정(인프라팀):
//   - REGISTRY            : Harbor/Nexus 주소 (예: harbor.우리도메인/aetherpms)
//   - credential 'registry-cred'  : 레지스트리 로그인(usernamePassword)
//   - credential 'kubeconfig-dev' : dev 클러스터 kubeconfig(Secret file 또는 K8s plugin)
//   - 에이전트: docker + kubectl 사용 가능(Testcontainers 쓰려면 docker-in-docker)

pipeline {
  agent any

  environment {
    REGISTRY   = 'REGISTRY_PLACEHOLDER'          // 예: harbor.우리도메인/aetherpms
    NAMESPACE  = 'aetherpms-dev'
    IMAGE_APP  = "${REGISTRY}/aetherpms-app"
    IMAGE_WEB  = "${REGISTRY}/aetherpms-web"
    TAG        = "${env.GIT_COMMIT?.take(7) ?: env.BUILD_NUMBER}"
  }

  options {
    timestamps()
    disableConcurrentBuilds()
  }

  stages {
    stage('Test (gate)') {
      // 얕은 단계: 컴파일/유닛 위주. Testcontainers 통합테스트는 docker 가능한 에이전트에서만.
      steps {
        dir('server-spring') {
          sh './gradlew --no-daemon test'   // docker 불가 에이전트면 '-x test' 또는 별도 stage로 분리
        }
        sh 'npm --prefix web ci && npm --prefix web run build'
      }
    }

    stage('Build images') {
      steps {
        sh "docker build -t ${IMAGE_APP}:${TAG} -f server-spring/Dockerfile server-spring"
        sh "docker build -t ${IMAGE_WEB}:${TAG} -f deploy/web.Dockerfile ."
      }
    }

    stage('Push') {
      steps {
        withCredentials([usernamePassword(credentialsId: 'registry-cred',
                          usernameVariable: 'REG_USER', passwordVariable: 'REG_PASS')]) {
          sh "echo \"\$REG_PASS\" | docker login ${REGISTRY} -u \"\$REG_USER\" --password-stdin"
          sh "docker push ${IMAGE_APP}:${TAG}"
          sh "docker push ${IMAGE_WEB}:${TAG}"
        }
      }
    }

    stage('Deploy dev') {
      steps {
        withKubeConfig([credentialsId: 'kubeconfig-dev']) {
          // 최초 1회는 매니페스트 apply(멱등). 이후엔 이미지 태그만 롤아웃.
          sh "kubectl apply -f deploy/k8s/dev/namespace.yaml"
          sh "kubectl -n ${NAMESPACE} apply -f deploy/k8s/dev/db.yaml -f deploy/k8s/dev/app.yaml -f deploy/k8s/dev/web.yaml"
          sh "kubectl -n ${NAMESPACE} set image deployment/aetherpms-app app=${IMAGE_APP}:${TAG}"
          sh "kubectl -n ${NAMESPACE} set image deployment/aetherpms-web web=${IMAGE_WEB}:${TAG}"
          sh "kubectl -n ${NAMESPACE} rollout status deployment/aetherpms-app --timeout=180s"
          sh "kubectl -n ${NAMESPACE} rollout status deployment/aetherpms-web --timeout=120s"
        }
      }
    }
  }

  post {
    failure { echo 'AetherPMS dev 배포 실패 — 로그 확인' }
    success { echo "AetherPMS dev 배포 완료: ${TAG}" }
  }
}
