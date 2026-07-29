<script setup lang="ts">
// 0038 — 조직도 부서 트리(재사용 컴포넌트): OrgPickerModal의 부서 축(데이터 소스·펼침·하위 합산
// 인원수)을 독립 트리로 분리. 인력관리 좌측 필터 등 부서 선택이 필요한 화면에서 사용.
// 선택 시 해당 부서 + 하위 전체의 (deptCode[], deptName[])을 emit한다.
import { computed, onMounted, ref } from 'vue';
import { dataClient } from '../lib/dataClient';
import type { OrgDept } from '../types';

// showAllRow: '전체 조직' 행 표시(기본 true). 상위 화면이 자체 '전체' 행을 갖는 경우 false.
// selectedCode: 넘기면 선택 상태를 상위가 소유한다(부서·회사 등 다른 축과 배타 선택을 위해).
//   미지정이면 이 컴포넌트가 자체 관리(기존 동작).
const props = withDefaults(defineProps<{
  showAllRow?: boolean;
  allLabel?: string;
  selectedCode?: string | null;
}>(), { showAllRow: true, allLabel: '전체 조직' });

const emit = defineEmits<{
  (e: 'select', v: { deptCode: string | null; deptNames: string[] }): void;
}>();

const depts = ref<OrgDept[]>([]);
const loading = ref(true);
const error = ref('');
const openSet = ref(new Set<string>());
const selectedOwn = ref<string | null>(null);
// selectedCode prop을 넘긴 화면은 상위가 소유(controlled), 아니면 자체 상태.
const selected = computed(() =>
  (props.selectedCode !== undefined ? props.selectedCode : selectedOwn.value) ?? null);

const childrenMap = computed<Map<string, OrgDept[]>>(() => {
  const m = new Map<string, OrgDept[]>();
  for (const d of depts.value) {
    const key = d.upperDeptCode ?? '__ROOT__';
    if (!m.has(key)) m.set(key, []);
    m.get(key)!.push(d);
  }
  return m;
});
const roots = computed(() => childrenMap.value.get('__ROOT__') ?? []);
function childrenOf(code: string): OrgDept[] { return childrenMap.value.get(code) ?? []; }

// 하위 부서 전체 합산 인원수(0038 — 직속만 표시하지 않는다)
const cumCounts = computed<Map<string, number>>(() => {
  const map = new Map<string, number>();
  const total = (d: OrgDept): number => {
    if (map.has(d.deptCode)) return map.get(d.deptCode)!;
    let n = d.memberCount;
    for (const c of childrenOf(d.deptCode)) n += total(c);
    map.set(d.deptCode, n);
    return n;
  };
  for (const d of depts.value) total(d);
  return map;
});

interface Row { dept: OrgDept; level: number; hasKids: boolean }
const rows = computed<Row[]>(() => {
  const out: Row[] = [];
  const walk = (d: OrgDept, level: number) => {
    const kids = childrenOf(d.deptCode);
    out.push({ dept: d, level, hasKids: kids.length > 0 });
    if (openSet.value.has(d.deptCode)) kids.forEach((c) => walk(c, level + 1));
  };
  roots.value.forEach((d) => walk(d, 0));
  return out;
});

function subtreeNames(code: string): string[] {
  const out: string[] = [];
  const walk = (d: OrgDept) => {
    out.push(d.deptNm);
    childrenOf(d.deptCode).forEach(walk);
  };
  const start = depts.value.find((d) => d.deptCode === code);
  if (start) walk(start);
  return out;
}

function toggleOpen(code: string) {
  const s = new Set(openSet.value);
  if (s.has(code)) s.delete(code);
  else s.add(code);
  openSet.value = s;
}

function select(d: OrgDept | null) {
  selectedOwn.value = d?.deptCode ?? null;
  emit('select', d ? { deptCode: d.deptCode, deptNames: subtreeNames(d.deptCode) } : { deptCode: null, deptNames: [] });
}

onMounted(async () => {
  try {
    depts.value = await dataClient.org.departments();
    // 루트는 기본 펼침
    openSet.value = new Set(roots.value.map((d) => d.deptCode));
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="dept-tree">
    <button
      v-if="showAllRow" type="button" class="row all"
      :class="{ on: selected === null }" @click="select(null)"
    >
      {{ allLabel }}
    </button>
    <p v-if="loading" class="state">조직도 불러오는 중…</p>
    <p v-else-if="error" class="state err">{{ error }}</p>
    <p v-else-if="rows.length === 0" class="state">조직도 데이터가 없습니다(동기화 필요).</p>
    <template v-else>
      <div v-for="r in rows" :key="r.dept.deptCode" class="line" :style="{ paddingLeft: `${r.level * 14}px` }">
        <button
          type="button" class="tw" :class="{ hidden: !r.hasKids }"
          @click="toggleOpen(r.dept.deptCode)"
        >{{ openSet.has(r.dept.deptCode) ? '▾' : '▸' }}</button>
        <button
          type="button" class="row" :class="{ on: selected === r.dept.deptCode }"
          @click="select(r.dept)"
        >
          <span class="nm">{{ r.dept.deptNm }}</span>
          <span v-if="(cumCounts.get(r.dept.deptCode) ?? 0) > 0" class="cnt">{{ cumCounts.get(r.dept.deptCode) }}</span>
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.dept-tree { display: flex; flex-direction: column; gap: 1px; font-size: 13px; }
.line { display: flex; align-items: center; gap: 2px; min-width: 0; }
.tw {
  width: 18px; flex-shrink: 0; background: none; border: 0; color: var(--muted);
  cursor: pointer; font-size: 11px; padding: 0; text-align: center;
}
.tw.hidden { visibility: hidden; }
.row {
  flex: 1; min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 6px;
  background: none; border: 0; border-radius: 6px; color: var(--text); cursor: pointer;
  font-size: 13px; padding: 4px 8px; text-align: left; font-family: inherit;
}
.row:hover { background: var(--panel-2); }
.row.on { background: var(--accent); color: #fff; }
.row.on .cnt { color: rgba(255, 255, 255, 0.85); }
.row.all { font-weight: 700; margin-bottom: 4px; }
.nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cnt { color: var(--muted); font-size: 11.5px; flex-shrink: 0; }
.state { color: var(--muted); font-size: 12.5px; margin: 6px 4px; }
.state.err { color: var(--red); }
</style>
