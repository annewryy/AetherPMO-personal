// P1-5 전역 횡단 목록 공용 로직 — PMO는 전체 프로젝트를 가로질러 본다.
// 4개 화면(이슈/액션아이템/공문/회의록)이 공유: 프로젝트·상태 필터 + 텍스트 검색.
// 데이터는 기존 dataClient 전체 list() 재사용(이미 전 프로젝트 조회임).
import { ref, computed, onMounted, watch, type Ref } from 'vue';
import { dataClient } from './dataClient';
import { DEFAULT_PAGE_SIZE, usePagination } from './pagination';
import type { Project } from '../types';

export interface GlobalListOptions<T> {
  load: () => Promise<T[]>;
  searchText: (item: T) => string;          // 텍스트 검색 대상(제목 등)
  status?: (item: T) => string;             // 상태 필터 값(없으면 상태 필터 비활성)
}

export function useGlobalList<T extends { projectId: number }>(opts: GlobalListOptions<T>) {
  const items = ref<T[]>([]) as Ref<T[]>;
  const projects = ref<Project[]>([]);
  const loading = ref(true);
  const loadError = ref<string | null>(null);

  const projectFilter = ref<number | 'ALL'>('ALL');
  const statusFilter = ref<string>('ALL');
  const query = ref('');

  const projectNameById = computed(() => {
    const m = new Map<number, string>();
    for (const p of projects.value) m.set(p.id, p.name);
    return m;
  });

  const projectName = (id: number) => projectNameById.value.get(id) ?? `#${id}`;

  // 0010 A-4: 전역 목록(프로젝트 밖 문맥)의 {projectCode}/{displayCode} 조합 렌더용
  const projectCodeById = computed(() => {
    const m = new Map<number, string>();
    for (const p of projects.value) if (p.projectCode) m.set(p.id, p.projectCode);
    return m;
  });
  const projectCode = (id: number) => projectCodeById.value.get(id) ?? null;

  // 필터 셀렉트용: 항목이 실제 존재하는 프로젝트만
  const projectOptions = computed(() => {
    const used = new Set(items.value.map((i) => i.projectId));
    return projects.value.filter((p) => used.has(p.id));
  });

  const statusOptions = computed(() => {
    if (!opts.status) return [];
    return [...new Set(items.value.map(opts.status).filter(Boolean))].sort();
  });

  const filtered = computed(() => {
    const q = query.value.trim().toLowerCase();
    return items.value.filter((i) => {
      if (projectFilter.value !== 'ALL' && i.projectId !== projectFilter.value) return false;
      if (statusFilter.value !== 'ALL' && opts.status && opts.status(i) !== statusFilter.value) return false;
      if (!q) return true;
      return opts.searchText(i).toLowerCase().includes(q) ||
        projectName(i.projectId).toLowerCase().includes(q);
    });
  });

  // 배치8 — 공통 클라이언트 페이징. 전 전역 목록(이슈/액션/공문/회의록)이 동일 방식으로 페이징한다.
  const pageSize = ref<number>(DEFAULT_PAGE_SIZE);
  const { page, total, totalPages, paged, goPage, resetPage, setPageSize, rowNo } =
    usePagination(filtered, pageSize);

  // 필터/검색 변경 시 1페이지로 리셋(회귀 금지).
  watch([projectFilter, statusFilter, query], () => resetPage());

  async function reloadItems() {
    // 0011 B-7: 신규 등록 후 목록 갱신(프로젝트 목록은 유지)
    try {
      items.value = await opts.load();
    } catch (e) {
      loadError.value = e instanceof Error ? e.message : String(e);
    }
  }

  onMounted(async () => {
    try {
      [items.value, projects.value] = await Promise.all([opts.load(), dataClient.projects.list()]);
    } catch (e) {
      loadError.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  });

  return {
    items, projects, loading, loadError,
    projectFilter, statusFilter, query,
    projectName, projectCode, projectOptions, statusOptions, filtered,
    reloadItems,
    // 배치8 페이징
    pageSize, page, total, totalPages, paged, goPage, setPageSize, rowNo,
  };
}
