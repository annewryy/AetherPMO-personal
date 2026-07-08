// AetherPMS 백엔드 서비스 v1 — Fastify 부트스트랩 (docs/design/0003)
// CORS(ALLOWED_ORIGINS), 에러 매핑(HttpError→상태코드), /health, 라우트 등록.

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { HttpError } from './db.js';
import { readRoutes } from './routes/reads.js';
import { projectRoutes } from './routes/projects.js';
import { transitionRoutes } from './routes/transitions.js';
import { progressRoutes } from './routes/progress.js';
import { signalRoutes } from './routes/signals.js';
import { signalRuleRoutes } from './routes/signal-rules.js';
import { adminRoutes } from './routes/admin.js';
import { workflowAdminRoutes } from './routes/workflows-admin.js';
import { workSurfaceRoutes } from './routes/work-surface.js';
import { registerCommentRoutes } from './routes/comments-routes.js';
import { mentionRoutes } from './routes/mentions-routes.js';

// ---------------------------------------------------------------------------
// CORS — env ALLOWED_ORIGINS(콤마 구분). `https://*.vercel.app` 와일드카드 지원.
// ---------------------------------------------------------------------------
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const escapeRegex = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
const originMatchers = allowedOrigins.map((pattern) => {
  if (!pattern.includes('*')) return (origin: string) => origin === pattern;
  // 와일드카드 1개 세그먼트: https://*.vercel.app → https://<프리뷰>.vercel.app
  const re = new RegExp(`^${pattern.split('*').map(escapeRegex).join('[a-z0-9-]+')}$`, 'i');
  return (origin: string) => re.test(origin);
});

export function isOriginAllowed(origin: string): boolean {
  return originMatchers.some((m) => m(origin));
}

// ---------------------------------------------------------------------------
// 앱 조립
// ---------------------------------------------------------------------------
export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: (origin, cb) => {
      // 브라우저 외 호출(Origin 헤더 없음)은 허용 — CORS는 브라우저 보호 장치다
      if (!origin) return cb(null, true);
      cb(null, isOriginAllowed(origin));
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-User-Id'],
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) {
      reply.code(err.statusCode).send({ message: err.message, ...(err.payload ?? {}) });
      return;
    }
    // pg 고유 제약 위반(project_code 중복 등) → 409
    if ((err as { code?: string }).code === '23505') {
      reply.code(409).send({ message: '고유 제약 위반: 이미 존재하는 값입니다.' });
      return;
    }
    // Fastify 자체 4xx(잘못된 JSON 등)는 유지, 그 외는 500으로 감춘다
    const e = err as { statusCode?: number; message?: string };
    const status = typeof e.statusCode === 'number' && e.statusCode < 500 ? e.statusCode : 500;
    if (status >= 500) req.log.error(err);
    reply.code(status).send({
      message: status >= 500 ? '서버 내부 오류가 발생했습니다.' : e.message ?? '요청 오류',
    });
  });

  app.get('/health', async () => ({ status: 'ok' }));

  await app.register(readRoutes);
  await app.register(projectRoutes);
  await app.register(transitionRoutes);
  await app.register(progressRoutes);
  await app.register(signalRoutes);
  await app.register(signalRuleRoutes);
  await app.register(adminRoutes);
  await app.register(workflowAdminRoutes);
  await app.register(workSurfaceRoutes);
  await app.register(registerCommentRoutes);
  await app.register(mentionRoutes);

  return app;
}

// ---------------------------------------------------------------------------
// 기동 (Render: PORT 주입, 0.0.0.0 바인딩 필수)
// ---------------------------------------------------------------------------
const port = Number(process.env.PORT ?? 3000);

buildApp()
  .then((app) => app.listen({ port, host: '0.0.0.0' }))
  .catch((err) => {
    console.error('서버 기동 실패:', err);
    process.exit(1);
  });
