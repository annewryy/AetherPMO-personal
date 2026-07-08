// 0012 C-3 현재 사용자(dev 선택기) — X-User-Id 헤더 소스.
//  - 실 로그인(0005 아마란스 SSO) 도입 전 임시 신원. dev 상단바 선택기가 uuid를 고른다.
//  - dataClient.apiGet/apiSend가 이 uuid를 X-User-Id 헤더로 주입한다(순환 참조 회피 위해
//    dataClient는 함수 getCurrentUserId()만 참조 — 이 모듈은 dataClient를 import하지 않는다).
//  - localStorage에 유지(새로고침·탭 재진입 시 복원).
import { ref } from 'vue';

const STORAGE_KEY = 'aether.currentUserId';

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

// 반응형 상태(상단바 선택기·알림 벨이 구독). 초기값은 localStorage.
export const currentUserId = ref<string | null>(readStored());

export function setCurrentUserId(uid: string | null): void {
  currentUserId.value = uid;
  try {
    if (uid) window.localStorage.setItem(STORAGE_KEY, uid);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* localStorage 불가 환경 — 메모리 상태만 유지 */
  }
}

// dataClient가 헤더 주입에 쓰는 비반응형 게터(순환 import 방지).
export function getCurrentUserId(): string | null {
  return currentUserId.value;
}
