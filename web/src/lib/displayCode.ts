// 0010 A-4 표시 코드 렌더 규칙 — 저장은 짧은 코드만, 문맥 따라 조합 렌더.
//  - 프로젝트 문맥 안(상세 탭 등):        I-3, D-CT-2-30 그대로
//  - 프로젝트 밖(전역 목록·Today 등):     {projectCode}/I-3 조합
// 주의: display_code 문자열로 정렬 금지(I-10<I-9 문제) — 정렬 키는 항상 원천 컬럼.

/** 프로젝트 밖 문맥: {projectCode}/{displayCode}. 코드가 없으면 null(표시 생략). */
export function fullDisplayCode(
  projectCode: string | null | undefined,
  displayCode: string | null | undefined,
): string | null {
  if (!displayCode) return null;
  return projectCode ? `${projectCode}/${displayCode}` : displayCode;
}
