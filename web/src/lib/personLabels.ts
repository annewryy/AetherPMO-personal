// 인력관리 표시 라벨 (0014 / 0005 B → 0044 마스터화).
// 0044부터 인력구분은 pms_employment_type 마스터가 원천 — 모듈 로드 시 1회 API에서 받아
// 반응형 배열을 채운다(실패/백엔드 미연결 시 기본 5종 폴백). 필터 체크박스·select·라벨이
// 전부 이 배열을 보므로 관리자에서 추가한 구분이 즉시 반영된다.

import { reactive } from 'vue';
import type { EmploymentTypeInfo } from '../types';

// 기본 시드 5종 — 백엔드 미연결(Vercel 폴백) 환경에서도 라벨은 나오게 한다.
const DEFAULT_TYPES: EmploymentTypeInfo[] = [
  { code: 'regular', label: '정규직', isOutsourced: false, sortOrder: 10 },
  { code: 'insourced', label: '자사화', isOutsourced: false, sortOrder: 20 },
  { code: 'project_contract', label: '프로젝트 계약직', isOutsourced: true, sortOrder: 30 },
  { code: 'turnkey', label: '외주(턴키)', isOutsourced: true, sortOrder: 40 },
  { code: 'freelancer', label: '프리랜서', isOutsourced: true, sortOrder: 50 },
];

/** 활성 인력구분(정렬순) — 반응형. 템플릿 v-for가 직접 참조해도 된다. */
export const EMPLOYMENT_TYPES = reactive<EmploymentTypeInfo[]>([...DEFAULT_TYPES]);

let loaded = false;
/** 마스터 재조회(관리자 CRUD 직후 force=true로 갱신). 실패 시 기존 값 유지.
 *  0044 개정 — 원천은 공통코드 그룹 EMPLOYMENT_TYPE(attrs.outsourced → isOutsourced). */
export async function loadEmploymentTypes(force = false): Promise<void> {
  if (loaded && !force) return;
  try {
    // 순환 import 방지(느긋한 로드) — dataClient는 personLabels를 참조하지 않지만 방어적으로.
    const { dataClient } = await import('./dataClient');
    const list = await dataClient.codes.list('EMPLOYMENT_TYPE');
    if (list.length > 0) {
      EMPLOYMENT_TYPES.splice(0, EMPLOYMENT_TYPES.length, ...list.map((c) => ({
        code: c.code,
        label: c.label,
        isOutsourced: c.attrs?.outsourced === true,
        sortOrder: c.sortOrder,
      })));
      loaded = true;
    }
  } catch {
    // 백엔드 미연결/오류 — 기본 5종(또는 마지막 성공값) 유지.
  }
}
void loadEmploymentTypes();

/** employmentType 코드 → 한글 라벨. 미지의 코드는 원문 그대로(더미 지어내지 않음). */
export function employmentTypeLabel(code: string | null | undefined): string {
  if (!code) return '—';
  return EMPLOYMENT_TYPES.find((t) => t.code === code)?.label ?? code;
}

/** 외주 계열(소속회사 필수) 인가 — 마스터의 isOutsourced 기준. */
export function isOutsourcedType(code: string | null | undefined): boolean {
  return !!code && !!EMPLOYMENT_TYPES.find((t) => t.code === code)?.isOutsourced;
}

/** source(INTERNAL/EXTERNAL) → 한글 라벨. 내부=아마란스 위임, 외부=PMS 소유. */
export function sourceLabel(source: string | null | undefined): string {
  if (source === 'INTERNAL') return '내부';
  if (source === 'EXTERNAL') return '외부';
  return source ?? '—';
}
