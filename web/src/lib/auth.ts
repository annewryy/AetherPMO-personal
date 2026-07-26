// 0031 §D — 자체 로그인 인증 상태. 토큰 localStorage, me(user/role) 반응형.
//   dataClient가 Authorization: Bearer 헤더를 이 토큰으로 주입(getAuthToken).
//   순환 참조 회피: dataClient는 getAuthToken()만 참조(이 모듈은 dataClient를 import하지 않음).
import { ref, computed } from 'vue';

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  role: 'SYS_ADMIN' | 'EXEC_ADMIN' | 'PM' | 'WORKER' | 'VIEWER' | string;
  personId: number | null;
  name: string;
}

const TOKEN_KEY = 'aether.authToken';

function readToken(): string | null {
  try { return window.localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
function writeToken(t: string | null): void {
  try {
    if (t) window.localStorage.setItem(TOKEN_KEY, t);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch { /* noop */ }
}

const token = ref<string | null>(readToken());
export const currentUser = ref<AuthUser | null>(null);
export const isAuthenticated = computed(() => !!currentUser.value);

export function getAuthToken(): string | null {
  return token.value;
}

function apiBase(): string | null {
  const b = window.API_BASE;
  return b ? b.replace(/\/+$/, '') : null;
}

async function call(path: string, method: string, body?: unknown): Promise<any> {
  const base = apiBase();
  if (!base) throw new Error('백엔드(API_BASE) 연결이 필요합니다.');
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token.value ? { Authorization: `Bearer ${token.value}` } : {}),
      ...(body != null ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = `요청 실패: ${res.status}`;
    try { const b = await res.json(); if (b?.message) msg = b.message; } catch { /* noop */ }
    throw new Error(msg);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : undefined;
}

export async function login(loginId: string, password: string): Promise<void> {
  const r = await call('/api/auth/login', 'POST', { loginId, password });
  token.value = r.token;
  writeToken(r.token);
  currentUser.value = { id: r.id, username: r.username, email: r.email, role: r.role, personId: r.personId, name: r.name };
}

export async function logout(): Promise<void> {
  try { await call('/api/auth/logout', 'POST'); } catch { /* 서버 실패해도 로컬 정리 */ }
  token.value = null;
  writeToken(null);
  currentUser.value = null;
}

/** 앱 부팅 시 저장 토큰으로 세션 복원. 실패(만료 등)면 정리. */
export async function restoreSession(): Promise<void> {
  if (!token.value || !apiBase()) return;
  try {
    const r = await call('/api/auth/me', 'GET');
    currentUser.value = { id: r.id, username: r.username, email: r.email, role: r.role, personId: r.personId, name: r.name };
  } catch {
    token.value = null;
    writeToken(null);
    currentUser.value = null;
  }
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await call('/api/auth/password', 'POST', { currentPassword, newPassword });
}

export const ROLE_LABELS: Record<string, string> = {
  SYS_ADMIN: '시스템 관리자', EXEC_ADMIN: '사업총괄', PM: 'PM', WORKER: '수행담당', VIEWER: '조회자',
};
