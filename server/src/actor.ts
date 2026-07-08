// resolveActor — 행위자 식별을 한 함수로 격리 (0003 §스택/배치).
// v1: 임시로 X-User-Id 헤더(uuid)를 신뢰한다(데모 한정).
// 정식 인증(아마란스 SSO 이원화, 0005 예정) 도입 시 이 함수만 교체한다.

import type { FastifyRequest } from 'fastify';

export interface Actor {
  /** pms_project_member.user_uid 와 매칭되는 uuid. 미식별 시 null. */
  userId: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function resolveActor(req: FastifyRequest): Actor {
  const raw = req.headers['x-user-id'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value && UUID_RE.test(value)) return { userId: value };
  return { userId: null };
}
