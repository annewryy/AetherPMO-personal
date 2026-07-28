// 테일러링 선택 공용 헬퍼 — 프로젝트 생성/전환 3경로가 같은 규칙을 쓰도록 한 곳에 모은다.
//   ExecConvertWizard(입찰→수행 전환) · BidProjectCreateWizard(나라장터→입찰) · ProjectFormModal(직접 생성).
//   원래 앞의 두 곳에 subtreeIds/expandWithAncestors가 그대로 복사돼 있었다.
import type { CatalogNode, TailoringEntry } from '../types';

/** 트리를 깊이우선으로 평탄화. */
export function flattenNodes(nodes: CatalogNode[], acc: CatalogNode[] = []): CatalogNode[] {
  for (const n of nodes) {
    acc.push(n);
    flattenNodes(n.children, acc);
  }
  return acc;
}

/** 이 노드 + 하위 전체 id(cascade down용). */
export function subtreeIds(n: CatalogNode, acc: number[] = []): number[] {
  acc.push(n.id);
  for (const c of n.children) subtreeIds(c, acc);
  return acc;
}

/**
 * 선택 집합 → 조상(cascade up) 포함 전개 id 집합.
 * 진척 롤업이 PHASE→ACTIVITY 계층을 만들려면 tailoring에 조상 노드도 있어야 한다(0017 P3a).
 * tree는 **필터 전 전체 트리**를 넘겨야 조상이 끊기지 않는다.
 */
export function expandWithAncestors(selected: Set<number>, tree: CatalogNode[]): Set<number> {
  const parentOf = new Map<number, number | null>();
  const walk = (n: CatalogNode, parentId: number | null) => {
    parentOf.set(n.id, parentId);
    for (const c of n.children) walk(c, n.id);
  };
  for (const root of tree) walk(root, null);

  const out = new Set<number>();
  for (const id of selected) {
    let cur: number | null | undefined = id;
    while (cur != null && !out.has(cur)) {
      out.add(cur);
      cur = parentOf.get(cur) ?? null;
    }
  }
  return out;
}

/** 선택 집합 → 생성/전환 API에 실을 tailoring 배열(조상 포함, 전부 isSelected:true). */
export function toTailoringEntries(selected: Set<number>, tree: CatalogNode[]): TailoringEntry[] {
  return [...expandWithAncestors(selected, tree)].map((catalogNodeId): TailoringEntry => ({
    catalogNodeId,
    isSelected: true,
  }));
}

// --- 0029 Phase B — 사업 유형 → 방법론 세트 ---
//   OPMS(사업관리 공통)는 항상 포함하고 구축/유지관리/ISP 중 하나를 더한다.
//   ⚠ BIS(ISP)는 V16 표준 시드에 DELIVERABLE 노드가 0건이라, ISP는 사실상 OPMS만 필수 판정된다.
export interface BizType {
  key: string;
  label: string;
  methodologies: string[] | null; // null = 필터 없음(전체)
}

export const BIZ_TYPES: BizType[] = [
  { key: 'SI', label: 'SI 구축', methodologies: ['OPMS', 'ODS'] },
  { key: 'SM', label: '유지보수·운영', methodologies: ['OPMS', 'OMS'] },
  { key: 'ISP', label: 'ISP·컨설팅', methodologies: ['OPMS', 'BIS'] },
  { key: 'ALL', label: '전체(커스텀 포함)', methodologies: null },
];

/** 유형 필터 적용 — 루트(PHASE)의 methodology로 판정. 하위는 시드상 루트를 따라간다. */
export function filterTreeByBizType(tree: CatalogNode[], bizTypeKey: string): CatalogNode[] {
  const t = BIZ_TYPES.find((b) => b.key === bizTypeKey);
  if (!t || !t.methodologies) return tree;
  return tree.filter((r) => r.methodology != null && t.methodologies!.includes(r.methodology));
}

// --- 0029 Phase B — 계약금액 → 규모 판정 ---
export type SizeField = 'requiredSmall' | 'requiredMedium' | 'requiredLarge';
export interface SizeInfo {
  field: SizeField;
  label: string;
}

const SMALL_MAX = 1_000_000_000; // 10억
const MEDIUM_MAX = 5_000_000_000; // 50억

/** 계약금액으로 규모(소/중/대) 판정. 금액이 없거나 0 이하면 null(판정 불가). */
export function sizeOf(contractAmount: number | null | undefined): SizeInfo | null {
  const amt = contractAmount;
  if (amt == null || Number.isNaN(amt) || amt <= 0) return null;
  if (amt < SMALL_MAX) return { field: 'requiredSmall', label: '소형 (10억 미만)' };
  if (amt < MEDIUM_MAX) return { field: 'requiredMedium', label: '중형 (10~50억)' };
  return { field: 'requiredLarge', label: '대형 (50억 이상)' };
}
