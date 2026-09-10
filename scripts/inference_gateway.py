#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AetherPMO PC 측 추론 게이트웨이 (scripts/inference_gateway.py)
역할:
1. Cloudflare Access Service Token 필수 인증 (헤더 검증)
2. 전역 동시 추론 1건 강제 (Mutex Lock)
3. 대기열(Queue) 최대 3건 초과 시 429, 10초 타임아웃 시 503
4. 로컬 Ollama(127.0.0.1:11434)로만 내부 프록시
5. /health 헬스체크 엔드포인트 제공
"""

import http.server
import socketserver
import urllib.request
import urllib.error
import json
import os
import sys
import threading
import time

GATEWAY_PORT = int(os.environ.get('GATEWAY_PORT', 11435))
OLLAMA_LOCAL_URL = os.environ.get('OLLAMA_LOCAL_URL', 'http://127.0.0.1:11434')
CF_CLIENT_ID = os.environ.get('CF_ACCESS_CLIENT_ID', 'test-client-id-demo')
CF_CLIENT_SECRET = os.environ.get('CF_ACCESS_CLIENT_SECRET', 'test-client-secret-demo')
MAX_QUEUE = 3
QUEUE_TIMEOUT = 10.0

is_inferring = False
waiting_queue = []
lock = threading.Lock()

def acquire_inference_lock():
    global is_inferring
    with lock:
        if not is_inferring:
            is_inferring = True
            return True, None
        if len(waiting_queue) >= MAX_QUEUE:
            return False, 429

    ev = threading.Event()
    with lock:
        waiting_queue.append(ev)

    resumed = ev.wait(timeout=QUEUE_TIMEOUT)
    with lock:
        if not resumed:
            if ev in waiting_queue:
                waiting_queue.remove(ev)
            return False, 503
        is_inferring = True
        return True, None

def release_inference_lock():
    global is_inferring
    with lock:
        if waiting_queue:
            next_ev = waiting_queue.pop(0)
            next_ev.set()
        else:
            is_inferring = False

class GatewayHandler(http.server.BaseHTTPRequestHandler):
    def _send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, CF-Access-Client-Id, CF-Access-Client-Secret')

    def do_OPTIONS(self):
        self.send_response(204)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        if self.path == '/health':
            # Ollama 연결 확인
            ollama_ok = False
            model_info = 'qwen2.5:1.5b'
            try:
                req = urllib.request.Request(f"{OLLAMA_LOCAL_URL}/api/tags")
                with urllib.request.urlopen(req, timeout=3) as resp:
                    if resp.status == 200:
                        ollama_ok = True
            except Exception:
                ollama_ok = False

            status_code = 200 if ollama_ok else 503
            self.send_response(status_code)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self._send_cors_headers()
            self.end_headers()

            body = {
                'status': 'ok' if ollama_ok else 'error',
                'gateway': True,
                'port': GATEWAY_PORT,
                'ollama': 'connected' if ollama_ok else 'unreachable',
                'model': model_info,
                'isInferring': is_inferring,
                'inQueue': len(waiting_queue)
            }
            self.wfile.write(json.dumps(body, ensure_ascii=False).encode('utf-8'))
            return

        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        # 1. Cloudflare Access Service Token 필수 인증
        req_client_id = self.headers.get('CF-Access-Client-Id')
        req_client_secret = self.headers.get('CF-Access-Client-Secret')

        if not req_client_id or not req_client_secret:
            self.send_response(401)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({
                'error': 'Cloudflare Access Service Token 헤더(CF-Access-Client-Id, CF-Access-Client-Secret)가 누락되었습니다.'
            }, ensure_ascii=False).encode('utf-8'))
            return

        if req_client_id != CF_CLIENT_ID or req_client_secret != CF_CLIENT_SECRET:
            self.send_response(403)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({
                'error': '유효하지 않은 Cloudflare Access Service Token입니다 (인증 실패).'
            }, ensure_ascii=False).encode('utf-8'))
            return

        # 2. Mutex 동시 추론 Lock 획득
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length)

        acquired, err_code = acquire_inference_lock()
        if not acquired:
            self.send_response(err_code)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self._send_cors_headers()
            self.end_headers()
            msg = '추론 대기열이 가득 찼습니다 (최대 3건).' if err_code == 429 else '추론 대기 시간이 초과되었습니다 (10초).'
            self.wfile.write(json.dumps({'error': msg}, ensure_ascii=False).encode('utf-8'))
            return

        try:
            # 3. Ollama 11434로 내부 전달
            target_url = f"{OLLAMA_LOCAL_URL}{self.path}"
            proxy_req = urllib.request.Request(
                target_url,
                data=post_data,
                headers={'Content-Type': 'application/json'}
            )
            with urllib.request.urlopen(proxy_req, timeout=60) as resp:
                resp_data = resp.read()
                self.send_response(resp.status)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self._send_cors_headers()
                self.end_headers()
                self.wfile.write(resp_data)
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(e.read())
        except Exception as e:
            self.send_response(503)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({'error': f'Ollama 프록시 연결 실패: {str(e)}'}, ensure_ascii=False).encode('utf-8'))
        finally:
            release_inference_lock()

    def log_message(self, format, *args):
        # 게이트웨이 로그 출력
        sys.stderr.write(f"[PC Gateway] {self.address_string()} - {format % args}\n")

def run_server():
    server = socketserver.TCPServer(('127.0.0.1', GATEWAY_PORT), GatewayHandler)
    print(f"[PC Gateway] Started on http://127.0.0.1:{GATEWAY_PORT} -> Ollama: {OLLAMA_LOCAL_URL}")
    print(f"[PC Gateway] Enforcing Service Token Auth (Client ID: {CF_CLIENT_ID})")
    server.serve_forever()

if __name__ == '__main__':
    run_server()
