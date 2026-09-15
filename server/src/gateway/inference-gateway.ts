// PC 측 추론 게이트웨이 (server/src/gateway/inference-gateway.ts)
// Cloudflare Access Service Token 필수 인증, 전역 동시 추론 1건 제한(Mutex), 대기열 관리, Ollama 프록시

import http from 'http';
import https from 'https';

export interface GatewayConfig {
  port: number;
  ollamaBaseUrl: string;
  cfClientId: string;
  cfClientSecret: string;
  maxQueueSize: number;
  queueTimeoutMs: number;
}

export class InferenceGateway {
  private config: GatewayConfig;
  private isInferring = false;
  private queue: Array<() => void> = [];
  private server: http.Server | null = null;

  constructor(config: Partial<GatewayConfig> = {}) {
    this.config = {
      port: config.port || Number(process.env.GATEWAY_PORT || 11435),
      ollamaBaseUrl: config.ollamaBaseUrl || process.env.OLLAMA_LOCAL_URL || 'http://127.0.0.1:11434',
      cfClientId: config.cfClientId || process.env.CF_ACCESS_CLIENT_ID || '',
      cfClientSecret: config.cfClientSecret || process.env.CF_ACCESS_CLIENT_SECRET || '',
      maxQueueSize: config.maxQueueSize || 3,
      queueTimeoutMs: config.queueTimeoutMs || 10000,
    };
  }

  private acquireLock(): Promise<() => void> {
    if (!this.isInferring) {
      this.isInferring = true;
      return Promise.resolve(() => this.releaseLock());
    }

    if (this.queue.length >= this.config.maxQueueSize) {
      const err = new Error('Gateway: 동시 추론 대기열이 가득 찼습니다 (최대 3건 초과).');
      (err as any).statusCode = 429;
      return Promise.reject(err);
    }

    return new Promise((resolve, reject) => {
      let timer: NodeJS.Timeout | null = null;
      const resume = () => {
        if (timer) clearTimeout(timer);
        this.isInferring = true;
        resolve(() => this.releaseLock());
      };

      timer = setTimeout(() => {
        const idx = this.queue.indexOf(resume);
        if (idx !== -1) this.queue.splice(idx, 1);
        const err = new Error('Gateway: AI 추론 대기열 대기 시간이 초과되었습니다 (10초).');
        (err as any).statusCode = 503;
        reject(err);
      }, this.config.queueTimeoutMs);

      this.queue.push(resume);
    });
  }

  private releaseLock() {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) next();
    } else {
      this.isInferring = false;
    }
  }

  /** Cloudflare Access Service Token 필수 인증 검증 */
  private verifyServiceAuth(req: http.IncomingMessage): boolean {
    // 환경변수에 Service Token이 설정되어 있는 경우 필수 검증
    if (!this.config.cfClientId || !this.config.cfClientSecret) {
      // 보안 경고: 토큰이 설정되지 않은 상태에서는 외부 노출 불가
      return false;
    }

    const clientId = req.headers['cf-access-client-id'];
    const clientSecret = req.headers['cf-access-client-secret'];

    return (
      clientId === this.config.cfClientId &&
      clientSecret === this.config.cfClientSecret
    );
  }

  public start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = http.createServer(async (req, res) => {
        // CORS 헤더
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, CF-Access-Client-Id, CF-Access-Client-Secret');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        // 1. 헬스체크 엔드포인트
        if (req.url === '/health' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            status: 'ok',
            gateway: true,
            isInferring: this.isInferring,
            inQueue: this.queue.length,
            ollamaBaseUrl: this.config.ollamaBaseUrl,
          }));
          return;
        }

        // 2. Cloudflare Access Service Token 필수 인증 검사
        if (!this.verifyServiceAuth(req)) {
          const hasTokens = Boolean(req.headers['cf-access-client-id']);
          res.writeHead(hasTokens ? 403 : 401, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            error: hasTokens 
              ? '유효하지 않은 Cloudflare Access Service Token입니다 (인증 실패).' 
              : 'Cloudflare Access Service Token 헤더(CF-Access-Client-Id, CF-Access-Client-Secret)가 누락되었습니다.'
          }));
          return;
        }

        // 3. /api/chat 요청 처리
        if (req.url === '/api/chat' && req.method === 'POST') {
          let release: (() => void) | null = null;
          try {
            release = await this.acquireLock();

            // 바디 읽기
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', () => {
              // Ollama 11434로 프록시 전달
              const ollamaUrl = new URL('/api/chat', this.config.ollamaBaseUrl);
              const proxyReq = http.request(
                ollamaUrl,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body),
                  },
                  timeout: 60000,
                },
                (proxyRes) => {
                  res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
                  proxyRes.pipe(res);
                  proxyRes.on('end', () => {
                    if (release) release();
                  });
                }
              );

              proxyReq.on('error', (err) => {
                if (release) release();
                res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: `Ollama 로컬 서버 프록시 오류: ${err.message}` }));
              });

              proxyReq.write(body);
              proxyReq.end();
            });

          } catch (err: any) {
            if (release) release();
            const status = err.statusCode || 500;
            res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Endpoint not found' }));
      });

      this.server.listen(this.config.port, '127.0.0.1', () => {
        console.log(`[PC 추론 게이트웨이] 127.0.0.1:${this.config.port} 에서 기동됨 (Ollama: ${this.config.ollamaBaseUrl})`);
        resolve();
      });
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}
