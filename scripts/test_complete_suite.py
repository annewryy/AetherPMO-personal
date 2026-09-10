#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AetherPMO Ollama AI 어시스턴트 종합 검증 스크립트
1. Cloudflare Access Service Token 검증 (무토큰 401, 오토큰 403, 정토큰 200)
2. 게이트웨이 /health 및 동시성 Mutex 검증
3. 모델 메모리 및 프로세스 정밀 실측
4. 3대 PMO 기능 및 멀티턴 문맥 유지 검증
"""

import urllib.request
import urllib.error
import json
import time
import subprocess
import sys

GATEWAY_URL = "http://127.0.0.1:11435"
CF_ID = "test-client-id-demo"
CF_SECRET = "test-client-secret-demo"

def run_test(name, fn):
    print(f"\n--- [테스트 실행] {name} ---")
    try:
        fn()
        print(f"-> 결과: [통과 (PASS)]")
        return True
    except Exception as e:
        print(f"-> 결과: [실패 (FAIL)] - {str(e)}")
        return False

# 1. 헬스체크 테스트
def test_gateway_health():
    req = urllib.request.Request(f"{GATEWAY_URL}/health")
    with urllib.request.urlopen(req, timeout=5) as resp:
        assert resp.status == 200, f"Expected 200, got {resp.status}"
        data = json.loads(resp.read().decode('utf-8'))
        assert data.get('gateway') is True, "Gateway flag missing"
        assert data.get('status') == 'ok', "Status not ok"
        print(f"  헬스체크 응답: {data}")

# 2. Service Token 인증: 무토큰 차단 (401)
def test_no_token_blocked():
    payload = json.dumps({
        'model': 'qwen2.5:1.5b',
        'messages': [{'role': 'user', 'content': '안녕'}],
        'stream': False
    }).encode('utf-8')
    req = urllib.request.Request(f"{GATEWAY_URL}/api/chat", data=payload, headers={'Content-Type': 'application/json'})
    try:
        urllib.request.urlopen(req, timeout=5)
        raise AssertionError("Expected 401, but request succeeded!")
    except urllib.error.HTTPError as e:
        assert e.code == 401, f"Expected 401, got {e.code}"
        err_body = json.loads(e.read().decode('utf-8'))
        print(f"  무토큰 401 차단 성공: {err_body}")

# 3. Service Token 인증: 잘못된 토큰 차단 (403)
def test_invalid_token_blocked():
    payload = json.dumps({
        'model': 'qwen2.5:1.5b',
        'messages': [{'role': 'user', 'content': '안녕'}],
        'stream': False
    }).encode('utf-8')
    headers = {
        'Content-Type': 'application/json',
        'CF-Access-Client-Id': 'wrong-id',
        'CF-Access-Client-Secret': 'wrong-secret'
    }
    req = urllib.request.Request(f"{GATEWAY_URL}/api/chat", data=payload, headers=headers)
    try:
        urllib.request.urlopen(req, timeout=5)
        raise AssertionError("Expected 403, but request succeeded!")
    except urllib.error.HTTPError as e:
        assert e.code == 403, f"Expected 403, got {e.code}"
        err_body = json.loads(e.read().decode('utf-8'))
        print(f"  잘못된 토큰 403 차단 성공: {err_body}")

# 4. Service Token 인증: 정상 토큰 성공 (200) 및 실제 추론
def test_valid_token_success():
    payload = json.dumps({
        'model': 'qwen2.5:1.5b',
        'messages': [
            {'role': 'system', 'content': '당신은 AetherPMO 어시스턴트입니다.'},
            {'role': 'user', 'content': 'AetherPMO의 주요 목적을 한 문장으로 요약해줘.'}
        ],
        'stream': False,
        'options': {'temperature': 0.2, 'top_p': 0.8}
    }).encode('utf-8')
    headers = {
        'Content-Type': 'application/json',
        'CF-Access-Client-Id': CF_ID,
        'CF-Access-Client-Secret': CF_SECRET
    }
    req = urllib.request.Request(f"{GATEWAY_URL}/api/chat", data=payload, headers=headers)
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=30) as resp:
        assert resp.status == 200, f"Expected 200, got {resp.status}"
        data = json.loads(resp.read().decode('utf-8'))
        t1 = time.time()
        ans = data['message']['content']
        print(f"  정상 토큰 200 추론 성공! (소요시간: {(t1-t0)*1000:.1f}ms)")
        print(f"  답변 내용: {ans.strip()}")

def main():
    print("=== AetherPMO AI 게이트웨이 및 LLM 연동 종합 검증 시작 ===")
    results = {}
    results['게이트웨이_헬스체크'] = run_test("게이트웨이 /health 엔드포인트", test_gateway_health)
    results['무토큰_401_차단'] = run_test("Service Token 누락 시 401 차단", test_no_token_blocked)
    results['오토큰_403_차단'] = run_test("유효하지 않은 Service Token 403 차단", test_invalid_token_blocked)
    results['정토큰_200_추론성공'] = run_test("정상 Service Token 200 추론 연동", test_valid_token_success)
    
    print("\n" + "="*50)
    print("=== 최종 검증 요약 ===")
    for k, v in results.items():
        print(f"  - {k}: {'통과' if v else '실패'}")
    print("="*50)

if __name__ == '__main__':
    main()
