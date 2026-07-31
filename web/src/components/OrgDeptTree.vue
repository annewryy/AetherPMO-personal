<script setup lang="ts">
// 0038/0042 — 조직도 부서 트리(**유일한** 부서 렌더 컴포넌트).
//   부서 축이 필요한 화면은 전부 여기를 쓴다: 인력관리 좌측 네비(PersonNavigator),
//   접근규칙 관리(AdminAccessRulesView), 조직도 선택창(OrgPickerModal).
//   트리 조립·하위 합산 인원수 계산은 lib/orgTree.ts가 소유한다(0042 — 예전엔 이 파일과
//   OrgPickerModal이 같은 코드를 두 벌 들고 있어서 한쪽만 고치면 다른 쪽에 버그가 남았다).
import { computed, ref, watch } from 'vue';
import { useOrgTree } from '../lib/orgTree';
import type { OrgDept } from '../types';

// showAllRow: '전체 조직' 행 표시(기본 true). 상위 화면이 자체 '전체' 행을 갖는 경우 false.
// selectedCode: 넘기면 선택 상태를 상위가 소유한다(부서·회사 등 다른 축과 배타 선택을 위해).
//   미지정이면 이 컴포넌트가 자체 관리(기존 동작).
// mode: 'select'=행 클릭이 부서 선택(필터 화면). 'expand'=행 클릭이 펼침 토글(선택창 — 잎은 인원).
// countSuffix: 인원수 뒤에 붙일 단위('명' 등). 기본은 숫자만.
// expandable: 캐럿을 보일지 판단(기본은 하위 부서가 있을 때). 선택창은 인원이 있어도 펼쳐야 한다.
const props = withDefaults(defineProps<{
  showAllRow?: boolean;
  allLabel?: string;
  selectedCode?: string | null;
  mode?: 'select' | 'expand';
  countSuffix?: string;
  expandable?: (d: OrgDept, hasKids: boolean) => boolean;
}>(), {
  showAllRow: true,
  allLabel: '전체 조직',
  mode: 'select',
  countSuffix: '',
});

const emit = defineEmits<{
  (e: 'select', v: { deptCode: string | null; deptNames: string[] }): void;
  // 펼침이 열릴 때 알린다 — 선택창이 부서 인원을 지연 로드하는 신호.
  (e: 'open', deptCode: string): void;
}>();

const { index, loading, error } = useOrgTree();

const openSet = ref(new Set<string>());
const selectedOwn = ref<string | null>(null);
// selectedCode prop을 넘긴 화면은 상위가 소유(controlled), 아니면 자체 상태.
const selected = computed(() =>
  (props.selectedCode !== undefined ? props.selectedCode : selectedOwn.value) ?? null);

// 루트는 기본 펼침. 로드 완료 시 1회(computed 안에서 상태를 건드리면 재계산 루프가 된다).
watch(index, (idx) => {
  if (idx) openSet.value = new Set([...openSet.value, ...idx.roots.map((d) => d.deptCode)]);
}, { immediate: true });

const rows = computed(() => index.value?.flatten(openSet.value) ?? []);

function isExpandable(d: OrgDept, hasKids: boolean): boolean {
  return props.expandable ? props.expandable(d, hasKids) : hasKids;
}

function cumCount(code: string): number {
  return index.value?.cumCount(code) ?? 0;
}

function toggleOpen(code: string) {
  const s = new Set(openSet.value);
  if (s.has(code)) s.delete(code);
  else { s.add(code); emit('open', code); }
  openSet.value = s;
}

function select(d: OrgDept | null) {
  selectedOwn.value = d?.deptCode ?? null;
  emit('select', d
    ? { deptCode: d.deptCode, deptNames: index.value?.subtreeNames(d.deptCode) ?? [] }
    : { deptCode: null, deptNames: [] });
}

function onRowClick(d: OrgDept) {
  if (props.mode === 'expand') toggleOpen(d.deptCode);
  else select(d);
}
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
      <template v-for="r in rows" :key="r.kind + ':' + r.dept.deptCode">
        <!-- 부서 행 -->
        <div v-if="r.kind === 'dept'" class="line" :style="{ paddingLeft: `${r.level * 14}px` }">
          <button
            type="button" class="tw" :class="{ hidden: !isExpandable(r.dept, r.hasKids) }"
            @click="toggleOpen(r.dept.deptCode)"
          >{{ openSet.has(r.dept.deptCode) ? '▾' : '▸' }}</button>
          <button
            type="button" class="row" :class="{ on: selected === r.dept.deptCode }"
            @click="onRowClick(r.dept)"
          >
            <span class="nm">{{ r.dept.deptNm }}</span>
            <span v-if="cumCount(r.dept.deptCode) > 0" class="cnt">
              {{ cumCount(r.dept.deptCode) }}{{ countSuffix }}
            </span>
          </button>
        </div>
        <!-- 펼쳐진 부서 뒤 삽입 지점(선택창의 인원 행 등) -->
        <slot v-else name="after-dept" :dept="r.dept" :level="r.level" :has-kids="r.hasKids" />
      </template>
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
