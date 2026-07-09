// 배치8 — 공통 페이징(단일 출처). 전 목록/검색 화면이 동일 방식으로 페이징한다.
//  - 페이지당 건수는 여기의 DEFAULT_PAGE_SIZE(공통 변수 하나)로 시작하고,
//    셀렉트(PAGE_SIZE_OPTIONS)로 재선택 → 재페이징.
//  - Row No.는 절대 순번((현재페이지-1)*페이지크기 + 행index + 1) — rowNo(index) 헬퍼 제공.
import { ref, computed, watch, unref, type Ref, type ComputedRef } from 'vue';

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

// "공통 변수 하나" — 전 뷰의 기본 페이지 크기. 각 뷰는 이 값으로 시작한다.
export const DEFAULT_PAGE_SIZE = 20;

export type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];

// 절대 순번(1-base) — 그리드 첫 컬럼 Row No.용.
export function absoluteRowNo(page: number, pageSize: number, index: number): number {
  return (page - 1) * pageSize + index + 1;
}

/**
 * 클라이언트 슬라이싱용 페이징 컴포저블.
 * 배열(ref/computed)과 pageSize(ref)를 받아 현재 페이지 슬라이스·총페이지·이동·rowNo를 제공한다.
 * 항목 총개수가 바뀌거나 pageSize가 바뀌면 현재 페이지를 유효 범위로 보정한다(필터 변경 시 1페이지 리셋은 호출측에서 resetPage()).
 */
export function usePagination<T>(
  items: Ref<T[]> | ComputedRef<T[]>,
  pageSize: Ref<number>,
) {
  const page = ref(1);

  const total = computed(() => unref(items).length);
  const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));

  // 총개수/페이지크기 변화로 현재 페이지가 범위를 벗어나면 마지막 페이지로 당긴다.
  watch([totalPages], () => {
    if (page.value > totalPages.value) page.value = totalPages.value;
    if (page.value < 1) page.value = 1;
  });

  const paged = computed(() => {
    const start = (page.value - 1) * pageSize.value;
    return unref(items).slice(start, start + pageSize.value);
  });

  function goPage(p: number) {
    const clamped = Math.min(Math.max(1, p), totalPages.value);
    if (clamped !== page.value) page.value = clamped;
  }

  // 필터/검색 변경 시 1페이지로 되돌린다.
  function resetPage() {
    page.value = 1;
  }

  // 페이지 크기 변경 → 항상 1페이지부터 재페이징.
  function setPageSize(size: number) {
    pageSize.value = size;
    page.value = 1;
  }

  // Row No. — 현재 페이지 내 index(0-base) → 절대 순번.
  const rowNo = (index: number) => absoluteRowNo(page.value, pageSize.value, index);

  return { page, total, totalPages, paged, goPage, resetPage, setPageSize, rowNo };
}
