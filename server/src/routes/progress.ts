// 0006 진척률 API — GET /api/projects/:id/progress
// recursive CTE 한 방 롤업(engine/progress.ts). 응답 형태는 0006 문서 그대로.

import type { FastifyInstance } from 'fastify';
import { getPool, HttpError } from '../db.js';
import { getProjectProgress } from '../engine/progress.js';

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, '유효하지 않은 id 입니다.');
  return id;
}

export async function progressRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>('/api/projects/:id/progress', async (req) => {
    const id = parseId(req.params.id);
    const result = await getProjectProgress(getPool(), id);
    if (!result) throw new HttpError(404, '프로젝트를 찾을 수 없습니다.');
    const { projectId, overall, fallback, phases } = result;
    return { projectId, overall, fallback, phases };
  });
}
