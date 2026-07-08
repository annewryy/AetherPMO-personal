// 조작면 완결성(placeholder) 정책 공통 헬퍼 (0004 §조작면 완결성, 2026-07-07 확정)
// 동료 UI에 존재하는 조작은 신규 버전에도 버튼으로 노출하되, 동작은 분류별 안내로 대체:
//  (a) phase2   — Phase 2 백엔드 연동 예정 (생성/수정/삭제/전이 등 쓰기 전반)
//  (b) amaranth — 아마란스(원챔버) 위임 (템플릿/산출물 파일 등록·다운로드)
//  (c) 의도적 제외(AI 포털, JSON 백업/복원)는 버튼 자체를 만들지 않는다 — 이 헬퍼 대상 아님.
// 문구는 여기 한 곳에만 존재한다(하드코딩 산발 금지).

export type StubCategory = 'phase2' | 'amaranth';

const MESSAGES: Record<StubCategory, string> = {
  phase2: '🔧 준비 중 — 백엔드 연동 후 활성화됩니다 (Phase 2)',
  amaranth: '📁 파일 기능은 아마란스(원챔버) 연계로 제공 예정입니다',
};

export function stub(category: StubCategory, action?: string): void {
  window.alert(action ? `[${action}]\n${MESSAGES[category]}` : MESSAGES[category]);
}

// 파일명/버전 등 아마란스 위임 컬럼의 표시값 (b) — 값도 한 곳에서 관리
export const AMARANTH_PENDING = '아마란스 연동 예정';
