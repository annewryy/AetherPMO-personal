// 인력관리 표시 라벨 (0014 / 0005 B — employment_type 코드 5종 → 한글).
// 목록 필터 체크박스와 목록·상세 표시에 공통으로 쓴다.

import type { EmploymentType } from '../types';

// 0005 B에서 확정된 코드값 → 한글 라벨. 순서는 필터 체크박스 노출 순서로 사용.
export const EMPLOYMENT_TYPES: { code: EmploymentType; label: string }[] = [
  { code: 'regular', label: '정규직' },
  { code: 'insourced', label: '자사화' },
  { code: 'project_contract', label: '프로젝트 계약직' },
  { code: 'turnkey', label: '외주(턴키)' },
  { code: 'freelancer', label: '프리랜서' },
];

const LABEL_BY_CODE: Record<string, string> = Object.fromEntries(
  EMPLOYMENT_TYPES.map((t) => [t.code, t.label]),
);

/** employmentType 코드 → 한글 라벨. 미지의 코드는 원문 그대로(더미 지어내지 않음). */
export function employmentTypeLabel(code: string | null | undefined): string {
  if (!code) return '—';
  return LABEL_BY_CODE[code] ?? code;
}

/** source(INTERNAL/EXTERNAL) → 한글 라벨. 내부=아마란스 위임, 외부=PMS 소유. */
export function sourceLabel(source: string | null | undefined): string {
  if (source === 'INTERNAL') return '내부';
  if (source === 'EXTERNAL') return '외부';
  return source ?? '—';
}

// 자사 인력(전환 불필요) vs 전환 대상(비자사).
const INSOURCED_TYPES = new Set(['regular', 'insourced']);
/** 자사화 전환 대상 인력구분인가(계약직/외주/프리랜서). */
export function isInsourcingEligible(code: string | null | undefined): boolean {
  return !!code && !INSOURCED_TYPES.has(code);
}

// 자사화 전환 상태(0019) → 한글 라벨.
const INSOURCING_STATUS_LABELS: Record<string, string> = {
  REQUESTED: '전환 요청됨',
  DOC_SENT: '공문 발신됨',
  APPROVED: '승인·자사화 반영됨',
  REJECTED: '반려됨',
  CANCELED: '취소됨',
};
export function insourcingStatusLabel(status: string | null | undefined): string {
  if (!status) return '—';
  return INSOURCING_STATUS_LABELS[status] ?? status;
}
