import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// 공용 설정: 루트 supabase-config.js 가 window.SUPABASE_CONFIG 를 주입한다(동료 버전과 동일 소스).
// window.API_BASE 는 백엔드(0003) 배포 시 주입 — dataClient가 이중 모드 분기에 사용.
declare global {
  interface Window {
    SUPABASE_CONFIG?: { url: string; anonKey: string };
    API_BASE?: string;
  }
}

let client: SupabaseClient | null = null;
let warned = false;

// Bug #1: placeholder URL 목록 — 배포 전 기본값이 그대로 들어 있는 경우 감지.
const PLACEHOLDER_URLS = new Set([
  'YOUR_SUPABASE_PROJECT_URL',
  'https://your-project.supabase.co',
  '',
]);

function isPlaceholder(url: string | undefined): boolean {
  if (!url) return true;
  return PLACEHOLDER_URLS.has(url.trim()) || url.includes('YOUR_SUPABASE');
}

// Bug #1: 데모 모드 여부 — API_BASE 없음 + Supabase 미설정/placeholder 모두 해당.
//   App.vue에서 import하여 경고 배너 표시에 사용.
export function checkDemoMode(): boolean {
  const hasApiBase = !!window.API_BASE;
  const cfg = window.SUPABASE_CONFIG;
  const hasSupabase = !!(cfg?.url && !isPlaceholder(cfg.url) && cfg?.anonKey && cfg.anonKey !== 'YOUR_SUPABASE_ANON_KEY');
  return !hasApiBase && !hasSupabase;
}

// 지연 생성: supabase-config.js 가 없어도 앱이 죽지 않는다(빈 상태 안내 표시가 목표).
// createClient는 url이 비면 throw 하므로, 설정이 있을 때만 만든다.
export function getSupabase(): SupabaseClient | null {
  if (client) return client;
  const cfg = window.SUPABASE_CONFIG;
  if (!cfg?.url || isPlaceholder(cfg.url) || !cfg?.anonKey) {
    if (!warned) {
      warned = true;
      console.warn(
        '[supabase] window.SUPABASE_CONFIG 없음 또는 placeholder — Supabase 폴백 비활성(빈 데이터로 동작). ' +
          'dev에서는 web/public/supabase-config.js 로 복사, 배포에서는 build-config.js가 생성.',
      );
    }
    return null;
  }
  client = createClient(cfg.url, cfg.anonKey);
  return client;
}
