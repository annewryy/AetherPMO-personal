// resolveActor — 행위자 식별 및 보안 인증.
// 보안 강화: 단순 X-User-Id 헤더 신뢰를 배제하고 Supabase JWT를 직접 검증한다.

import type { FastifyRequest } from 'fastify';
import { HttpError } from './db.js';

export interface AuthenticatedUser {
  userId: string;
  email?: string;
  role?: string;
}

export interface Actor {
  /** pms_project_member.user_uid 와 매칭되는 uuid. 미식별 시 null. */
  userId: string | null;
  role?: string;
  email?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Supabase Auth JWT 토큰을 검증하여 실제 인증된 사용자 정보를 반환한다.
 * Authorization: Bearer <jwt> 헤더 필수.
 * 유효하지 않거나 위조된 토큰일 경우 HttpError(401)를 던진다.
 */
export async function resolveAuthenticatedActor(req: FastifyRequest): Promise<AuthenticatedUser> {
  const authHeader = req.headers['authorization'];
  const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : null;

  if (!token) {
    throw new HttpError(401, '인증이 필요합니다. Bearer JWT 토큰을 헤더에 포함해주세요.');
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (supabaseUrl && anonKey && !supabaseUrl.includes('YOUR_SUPABASE')) {
    try {
      const resp = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/user`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'apikey': anonKey,
        },
      });

      if (!resp.ok) {
        throw new HttpError(401, '유효하지 않거나 만료된 인증 토큰입니다.');
      }

      const user = await resp.json() as { id?: string; email?: string; user_metadata?: { role?: string } };
      if (!user?.id || !UUID_RE.test(user.id)) {
        throw new HttpError(401, '유효하지 않은 사용자 정보입니다.');
      }

      return {
        userId: user.id,
        email: user.email,
        role: user.user_metadata?.role || 'VIEWER',
      };
    } catch (err: any) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(401, `인증 서버 검증 실패: ${err.message || String(err)}`);
    }
  }

  throw new HttpError(401, '인증 설정이 올바르지 않거나 유효하지 않은 토큰입니다.');
}

/**
 * 레거시 조회 호환용: X-User-Id가 유효한 uuid 형태인 경우에만 추출.
 * 보안이 필요한 신규 API(AI 챗봇 등)에서는 절대 사용하지 말고 resolveAuthenticatedActor를 사용한다.
 */
export function resolveActor(req: FastifyRequest): Actor {
  const raw = req.headers['x-user-id'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value && UUID_RE.test(value)) return { userId: value };
  return { userId: null };
}

