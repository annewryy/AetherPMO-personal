// 0032 — 테마 토글(요구 0004 §3-3): 라이트/다크 선택, localStorage 유지.
//   토큰은 style.css의 :root(다크 기본) + :root[data-theme='light'] 오버라이드로 정의된다.
//   이 모듈 import 시점에 저장값을 즉시 적용(첫 페인트 깜빡임 최소화 — main.ts에서 최우선 import).
import { ref } from 'vue';

const STORAGE_KEY = 'aether.theme';
export type Theme = 'dark' | 'light';

function readStored(): Theme {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export const theme = ref<Theme>(readStored());

export function applyTheme(t: Theme): void {
  theme.value = t;
  document.documentElement.dataset.theme = t;
  try {
    window.localStorage.setItem(STORAGE_KEY, t);
  } catch {
    /* localStorage 불가 — 메모리 상태만 */
  }
}

export function toggleTheme(): void {
  applyTheme(theme.value === 'dark' ? 'light' : 'dark');
}

// 모듈 로드 즉시 반영
document.documentElement.dataset.theme = theme.value;
