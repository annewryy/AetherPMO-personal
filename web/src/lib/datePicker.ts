// 0033 — 날짜 입력 전역 달력화(너울님 2026-07-26): 모든 input[type=date]는
//   필드 어디를 클릭해도 브라우저 달력 팝업(showPicker)이 바로 열린다.
//   위임 리스너 1개 — 화면별 코드 수정 없이 기존·신규 날짜 입력 전부에 적용.
//   (showPicker: Chrome 99+/Edge/FF 101+. 미지원·비활성 필드는 기본 동작 유지)
document.addEventListener('click', (e) => {
  const t = e.target;
  if (!(t instanceof HTMLInputElement) || t.type !== 'date' || t.disabled || t.readOnly) return;
  try {
    t.showPicker();
  } catch {
    /* 미지원 브라우저/제스처 제약 — 네이티브 기본 동작으로 폴백 */
  }
});

export {};
