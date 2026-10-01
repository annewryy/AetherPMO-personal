#!/usr/bin/env python3
"""실제 AetherPMO AI API의 JWT·프로젝트 권한·Ollama 전체 경로 검증.

필수 환경변수:
  AI_API_URL                 예: https://preview.example/api/ai/chat
  AI_ACCESS_TOKEN            실제 Supabase 로그인 access_token
  AI_ACCESSIBLE_PROJECT_ID   로그인 사용자가 조회 가능한 프로젝트 ID
  AI_FORBIDDEN_PROJECT_ID    로그인 사용자가 조회할 수 없는 프로젝트 ID

토큰은 출력하지 않으며, 하나의 API URL마다 이 스크립트를 실행한다.
Fastify와 Vercel을 모두 검증하려면 AI_API_URL만 바꿔 두 번 실행한다.
"""

import json
import os
import sys
import urllib.error
import urllib.request


API_URL = os.environ.get("AI_API_URL", "").strip()
ACCESS_TOKEN = os.environ.get("AI_ACCESS_TOKEN", "").strip()
ACCESSIBLE_PROJECT_ID = os.environ.get("AI_ACCESSIBLE_PROJECT_ID", "").strip()
FORBIDDEN_PROJECT_ID = os.environ.get("AI_FORBIDDEN_PROJECT_ID", "").strip()


def request(token=None, project_id=None):
    payload = {
        "message": "이 사업의 현재 현황을 실제 데이터 기준으로 한 문장으로 요약해줘.",
        "history": [],
    }
    if project_id:
        payload["projectId"] = project_id

    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    req = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=75) as response:
            body = json.loads(response.read().decode("utf-8"))
            return response.status, body
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8", errors="replace")
        try:
            body = json.loads(raw)
        except json.JSONDecodeError:
            body = {"error": raw[:300]}
        return error.code, body


def check(name, condition, detail):
    if not condition:
        raise AssertionError(f"{name}: {detail}")
    print(f"[PASS] {name}")


def main():
    missing = [
        name for name, value in {
            "AI_API_URL": API_URL,
            "AI_ACCESS_TOKEN": ACCESS_TOKEN,
            "AI_ACCESSIBLE_PROJECT_ID": ACCESSIBLE_PROJECT_ID,
            "AI_FORBIDDEN_PROJECT_ID": FORBIDDEN_PROJECT_ID,
        }.items() if not value
    ]
    if missing:
        print("[BLOCKED] 필수 환경변수 누락: " + ", ".join(missing))
        return 2

    status, _ = request()
    check("무토큰 요청 401", status == 401, f"HTTP {status}")

    status, _ = request("invalid-token")
    check("위조 토큰 요청 401", status == 401, f"HTTP {status}")

    status, body = request(ACCESS_TOKEN, ACCESSIBLE_PROJECT_ID)
    check("허용 프로젝트 전체 경로 200", status == 200, f"HTTP {status}: {body.get('error', '')}")
    check("LLM 답변 존재", isinstance(body.get("answer"), str) and bool(body["answer"].strip()), "answer 누락")
    check("응답 메타데이터 존재", isinstance(body.get("metadata"), dict), "metadata 누락")

    status, _ = request(ACCESS_TOKEN, FORBIDDEN_PROJECT_ID)
    check("권한 없는 프로젝트 403", status == 403, f"HTTP {status}")

    print("[PASS] 실제 JWT → API → DB 권한조회 → Ollama 통합 경로 검증 완료")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        print(f"[FAIL] {error}")
        sys.exit(1)

$env:AI_API_URL="https://aether-pmo-personal.vercel.app/api/ai/chat"
$env:AI_ACCESS_TOKEN="실제_Supabase_access_token"
$env:AI_ACCESSIBLE_PROJECT_ID="조회가능한_프로젝트_ID"
$env:AI_FORBIDDEN_PROJECT_ID="조회권한없는_프로젝트_ID"

python .\verify_live_ai_integration.py

$env:AI_API_URL
$env:AI_ACCESSIBLE_PROJECT_ID
$env:AI_FORBIDDEN_PROJECT_ID

$env:AI_API_URL="https://aether-pmo-personal.vercel.app/api/ai/chat"
$env:AI_ACCESS_TOKEN="817bc84d-9d81-4ce8-9f4e-960b91ee7eab"
$env:AI_ACCESSIBLE_PROJECT_ID="조회가능한_프로젝트_ID"
$env:AI_FORBIDDEN_PROJECT_ID="조회권한없는_프로젝트_ID"

python .\verify_live_ai_integration.py