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

// 지연 생성: supabase-config.js 가 없어도 앱이 죽지 않는다(빈 상태 안내 표시가 목표).
// createClient는 url이 비면 throw 하므로, 설정이 있을 때만 만든다.
export function getSupabase(): SupabaseClient | null {
  if (client) return client;
  const cfg = window.SUPABASE_CONFIG;
  if (!cfg?.url || !cfg?.anonKey) {
    if (!warned) {
      warned = true;
      console.warn(
        '[supabase] window.SUPABASE_CONFIG 없음 — Supabase 폴백 비활성(빈 데이터로 동작). ' +
          'dev에서는 web/public/supabase-config.js 로 복사, 배포에서는 build-config.js가 생성.',
      );
    }
    return null;
  }
  client = createClient(cfg.url, cfg.anonKey);
  return client;
}
