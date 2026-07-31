// 0044 — 공통코드 프론트 캐시. 그룹별로 1회 로드한 반응형 배열을 돌려준다.
//   백엔드 미연결/오류 시에는 폴백(기존 하드코딩 어휘)을 유지해 화면이 깨지지 않게 한다.
//   관리자 코드 관리 화면이 저장 후 reloadCodes(group)를 불러 즉시 갱신한다.

import { reactive } from 'vue';
import type { CommonCode } from '../types';
import { dataClient } from './dataClient';

const cache = new Map<string, CommonCode[]>();          // group → reactive 배열
const loaded = new Set<string>();

/** 그룹의 활성 코드 반응형 배열. 최초 호출 시 API 로드(실패하면 fallback 유지). */
export function useCodes(group: string, fallback: CommonCode[] = []): CommonCode[] {
  let list = cache.get(group);
  if (!list) {
    list = reactive<CommonCode[]>([...fallback]);
    cache.set(group, list);
    void reloadCodes(group);
  }
  return list;
}

/** 그룹 재조회(관리자 CRUD 직후). 실패 시 기존 값 유지. */
export async function reloadCodes(group: string): Promise<void> {
  const list = cache.get(group);
  if (!list) return;
  try {
    const fresh = await dataClient.codes.list(group);
    if (fresh.length > 0 || loaded.has(group)) {
      list.splice(0, list.length, ...fresh);
    }
    if (fresh.length > 0) loaded.add(group);
  } catch {
    // 백엔드 미연결/오류 — 폴백(또는 마지막 성공값) 유지.
  }
}

/** code → label. 미지의 코드는 원문 그대로(더미 지어내지 않음). */
export function codeLabel(list: CommonCode[], code: string | null | undefined): string {
  if (!code) return '—';
  return list.find((c) => c.code === code)?.label ?? code;
}

/** 폴백 목록 생성 도우미 — 기존 하드코딩 어휘를 CommonCode 모양으로. */
export function fallbackCodes(group: string, items: { code: string; label?: string }[]): CommonCode[] {
  return items.map((it, i) => ({
    group, code: it.code, label: it.label ?? it.code, attrs: null, sortOrder: (i + 1) * 10,
  }));
}
