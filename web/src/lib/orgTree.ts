// 0042 — 부서 트리 가공의 단일 지점(프론트).
//
// /api/org/departments는 **평탄 배열**을 준다. 예전엔 그걸 받은 컴포넌트가 각자
// 트리 조립(childrenMap/roots) · 하위 합산 인원수(cumCounts) · 재귀 walk를 복붙해서
// OrgDeptTree.vue와 OrgPickerModal.vue에 거의 문자 그대로 같은 코드가 두 벌 있었다.
// 여기로 모아서 트리 관련 수정이 한 파일로 끝나게 한다.
//
// 캐시: 부서 마스터는 동기화 배치 사이에 변하지 않는다. 모듈 스코프에서 promise를 공유해
// 화면을 오갈 때마다 나가던 재요청을 없앤다(관리자 동기화 후엔 invalidateOrgTree()).
import { ref, shallowRef, onMounted, type Ref } from 'vue';
import { dataClient } from './dataClient';
import type { OrgDept } from '../types';

/** 평탄화된 렌더 행. kind='after'는 부서 행 **뒤**(하위 부서까지 전부 그린 뒤) 삽입 지점 —
 *  조직도 선택창처럼 부서 아래에 인원 행을 끼워 넣는 화면이 슬롯을 걸 자리다. */
export interface OrgTreeRow {
  kind: 'dept' | 'after';
  dept: OrgDept;
  level: number;
  hasKids: boolean;
}

export interface OrgTreeIndex {
  /** 부서 전량(서버가 준 순서 그대로). */
  all: OrgDept[];
  /** 최상위 부서(upperDeptCode가 없는 것). */
  roots: OrgDept[];
  childrenOf(code: string): OrgDept[];
  /** 자신 + 하위 부서 전체의 합산 인원수(직속만이 아니라). */
  cumCount(code: string): number;
  /** 자신 + 하위 부서의 이름 목록(중복 제거). */
  subtreeNames(code: string): string[];
  /** 코드 → 표시명. 없는 코드면 null. */
  nameOf(code: string): string | null;
  /** 펼침 집합 기준 렌더 행 목록. */
  flatten(open: Set<string>): OrgTreeRow[];
}

const ROOT = '__ROOT__';

/** 평탄 배열 → 조회 색인. 순수 함수(테스트·재사용 가능). */
export function buildOrgTree(depts: OrgDept[]): OrgTreeIndex {
  const children = new Map<string, OrgDept[]>();
  const byCode = new Map<string, OrgDept>();
  for (const d of depts) {
    byCode.set(d.deptCode, d);
    const key = d.upperDeptCode ?? ROOT;
    let bucket = children.get(key);
    if (!bucket) children.set(key, (bucket = []));
    bucket.push(d);
  }
  const childrenOf = (code: string): OrgDept[] => children.get(code) ?? [];

  // 하위 합산 인원수 — 메모이즈. 순환 참조가 섞여도 무한 재귀에 빠지지 않게 방문 중 표시를 둔다.
  const cum = new Map<string, number>();
  const visiting = new Set<string>();
  const cumCount = (code: string): number => {
    const cached = cum.get(code);
    if (cached !== undefined) return cached;
    if (visiting.has(code)) return 0;      // 순환 — 이 가지는 0으로 끊는다
    visiting.add(code);
    const self = byCode.get(code);
    let n = self?.memberCount ?? 0;
    for (const c of childrenOf(code)) n += cumCount(c.deptCode);
    visiting.delete(code);
    cum.set(code, n);
    return n;
  };

  const subtreeNames = (code: string): string[] => {
    const out: string[] = [];
    const seen = new Set<string>();
    const stack = [code];
    while (stack.length) {
      const cur = stack.pop()!;
      if (seen.has(cur)) continue;         // 순환 방어
      seen.add(cur);
      const d = byCode.get(cur);
      if (!d) continue;
      if (d.deptNm && !out.includes(d.deptNm)) out.push(d.deptNm);
      for (const c of childrenOf(cur)) stack.push(c.deptCode);
    }
    return out;
  };

  const flatten = (open: Set<string>): OrgTreeRow[] => {
    const out: OrgTreeRow[] = [];
    const seen = new Set<string>();
    const walk = (d: OrgDept, level: number) => {
      if (seen.has(d.deptCode)) return;    // 순환 방어
      seen.add(d.deptCode);
      const kids = childrenOf(d.deptCode);
      out.push({ kind: 'dept', dept: d, level, hasKids: kids.length > 0 });
      if (open.has(d.deptCode)) {
        kids.forEach((c) => walk(c, level + 1));
        // 하위 부서를 다 그린 뒤가 인원 행 자리(조직도 선택창의 기존 순서와 동일).
        out.push({ kind: 'after', dept: d, level, hasKids: kids.length > 0 });
      }
    };
    (children.get(ROOT) ?? []).forEach((d) => walk(d, 0));
    return out;
  };

  return {
    all: depts,
    roots: children.get(ROOT) ?? [],
    childrenOf,
    cumCount,
    subtreeNames,
    nameOf: (code) => byCode.get(code)?.deptNm ?? null,
    flatten,
  };
}

// ---- 로드 캐시 -------------------------------------------------------------

let cached: Promise<OrgTreeIndex> | null = null;

/** 부서 트리 색인(모듈 스코프 1회 로드). 동시 호출은 같은 promise를 공유한다. */
export function loadOrgTree(): Promise<OrgTreeIndex> {
  if (!cached) {
    cached = dataClient.org.departments()
      .then(buildOrgTree)
      .catch((e) => { cached = null; throw e; });   // 실패는 캐시하지 않는다(다음 진입에서 재시도)
  }
  return cached;
}

/** 관리자 조직 동기화 직후 호출 — 다음 조회에서 다시 받아온다. */
export function invalidateOrgTree(): void {
  cached = null;
}

/** 컴포넌트용 컴포저블. onMounted에서 로드하고 index/loading/error를 준다. */
export function useOrgTree(): {
  index: Ref<OrgTreeIndex | null>;
  loading: Ref<boolean>;
  error: Ref<string>;
} {
  const index = shallowRef<OrgTreeIndex | null>(null);
  const loading = ref(true);
  const error = ref('');
  onMounted(async () => {
    try {
      index.value = await loadOrgTree();
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  });
  return { index, loading, error };
}
