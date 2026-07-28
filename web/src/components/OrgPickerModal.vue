<script setup lang="ts">
// 조직도 선택 모달(0020) — 재사용 컴포넌트.
//   최상위 가지: 내부인력(아마란스 부서 트리 → 부서 펼치면 인원) · 외부인력(회사별 그룹 + 신규 직접입력).
//   상단 검색으로 내부/외부 인원 통합 검색. 선택 시 통일된 OrgPick을 emit하고 닫는다.
//   참여인력 등록·PM 선택·담당자 지정 등 어디서든 <OrgPickerModal @select @close/>로 사용.
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { dataClient } from '../lib/dataClient';
import type { OrgDept, OrgMember, OrgExternalMember, OrgPick } from '../types';

const props = withDefaults(defineProps<{
  roots?: 'both' | 'internal' | 'external';
  allowNewExternal?: boolean;
  title?: string;
}>(), { roots: 'both', allowNewExternal: true, title: '조직도에서 선택' });

const emit = defineEmits<{ (e: 'select', pick: OrgPick): void; (e: 'close'): void }>();

const showInternal = computed(() => props.roots !== 'external');
const showExternal = computed(() => props.roots !== 'internal');

// ---- 데이터 ----
const depts = ref<OrgDept[]>([]);
const deptChildren = new Map<string, OrgDept[]>();   // parentCode('__ROOT__') → 자식 부서
const deptMembers = ref<Record<string, OrgMember[] | 'loading'>>({});
const externalMembers = ref<OrgExternalMember[] | 'loading' | null>(null);
const expanded = ref<Set<string>>(new Set());
const loading = ref(true);
const error = ref<string | null>(null);

// ---- 검색 ----
const query = ref('');
type SearchRow = { kind: 'int'; m: OrgMember } | { kind: 'ext'; e: OrgExternalMember };
const searchResults = ref<SearchRow[]>([]);
const searching = ref(false);
let timer: ReturnType<typeof setTimeout> | null = null;

onMounted(async () => {
  try {
    if (showInternal.value) {
      const list = await dataClient.org.departments();
      depts.value = list;
      deptChildren.clear();
      for (const d of list) {
        const key = d.upperDeptCode ?? '__ROOT__';
        (deptChildren.get(key) ?? deptChildren.set(key, []).get(key)!).push(d);
      }
      expanded.value.add('root:internal'); // 내부 루트 기본 펼침
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
  window.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => { window.removeEventListener('keydown', onKey); if (timer) clearTimeout(timer); });
function onKey(ev: KeyboardEvent) { if (ev.key === 'Escape') emit('close'); }

const rootDepts = computed(() => deptChildren.get('__ROOT__') ?? []);
function childrenOf(code: string): OrgDept[] { return deptChildren.get(code) ?? []; }

// 0038 — 부서 인원 표시는 하위 부서 전체 합산(직속만이 아니라)
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

// ---- 외부 그룹(회사별) ----
const externalGroups = computed(() => {
  const list = Array.isArray(externalMembers.value) ? externalMembers.value : [];
  const map = new Map<string, { key: string; name: string; members: OrgExternalMember[] }>();
  for (const e of list) {
    const key = e.companyId != null ? String(e.companyId) : 'none';
    const name = e.companyName ?? '(소속 미지정)';
    if (!map.has(key)) map.set(key, { key, name, members: [] });
    map.get(key)!.members.push(e);
  }
  return [...map.values()];
});

// ---- 펼침/접기(+ 지연 로드) ----
async function toggle(id: string, opts?: { deptCode?: string; isExternalRoot?: boolean }) {
  const set = expanded.value;
  if (set.has(id)) { set.delete(id); expanded.value = new Set(set); return; }
  set.add(id); expanded.value = new Set(set);
  if (opts?.deptCode && deptMembers.value[opts.deptCode] === undefined) {
    void loadDeptMembers(opts.deptCode);
  }
  if (opts?.isExternalRoot && externalMembers.value === null) {
    void loadExternal();
  }
}
async function loadDeptMembers(code: string) {
  deptMembers.value = { ...deptMembers.value, [code]: 'loading' };
  try {
    const list = await dataClient.org.members({ deptCode: code });
    deptMembers.value = { ...deptMembers.value, [code]: list };
  } catch {
    deptMembers.value = { ...deptMembers.value, [code]: [] };
  }
}
async function loadExternal() {
  externalMembers.value = 'loading';
  try { externalMembers.value = await dataClient.org.externalMembers(); }
  catch { externalMembers.value = []; }
}

// ---- 평탄화(렌더 행) ----
interface Row {
  id: string; level: number;
  type: 'group' | 'dept' | 'member' | 'ext-member' | 'new-external' | 'loading' | 'empty';
  label: string; sub?: string;
  expandable?: boolean; deptCode?: string; isExternalRoot?: boolean;
  member?: OrgMember; ext?: OrgExternalMember;
}
const rows = computed<Row[]>(() => {
  const out: Row[] = [];
  const isOpen = (id: string) => expanded.value.has(id);

  if (showInternal.value) {
    out.push({ id: 'root:internal', level: 0, type: 'group', label: '내부인력', expandable: true });
    if (isOpen('root:internal')) rootDepts.value.forEach((d) => walkDept(d, 1, out, isOpen));
  }
  if (showExternal.value) {
    out.push({ id: 'root:external', level: 0, type: 'group', label: '외부인력', expandable: true, isExternalRoot: true });
    if (isOpen('root:external')) {
      if (externalMembers.value === 'loading' || externalMembers.value === null) {
        out.push({ id: 'ext-loading', level: 1, type: 'loading', label: '불러오는 중…' });
      } else {
        for (const g of externalGroups.value) {
          const gid = 'company:' + g.key;
          out.push({ id: gid, level: 1, type: 'group', label: g.name, sub: `${g.members.length}명`, expandable: true });
          if (isOpen(gid)) g.members.forEach((e) => out.push({
            id: 'ext:' + e.personId, level: 2, type: 'ext-member', label: e.name,
            sub: [e.position, e.department].filter(Boolean).join(' · ') || undefined, ext: e,
          }));
        }
        if (props.allowNewExternal) {
          out.push({ id: 'new-ext', level: 1, type: 'new-external', label: '＋ 새 외부 인력 직접 입력' });
        }
        if (externalGroups.value.length === 0 && !props.allowNewExternal) {
          out.push({ id: 'ext-empty', level: 1, type: 'empty', label: '등록된 외부 인력이 없습니다.' });
        }
      }
    }
  }
  return out;
});

function walkDept(d: OrgDept, level: number, out: Row[], isOpen: (id: string) => boolean) {
  const kids = childrenOf(d.deptCode);
  const expandable = d.memberCount > 0 || kids.length > 0;
  const id = 'dept:' + d.deptCode;
  const cum = cumCounts.value.get(d.deptCode) ?? d.memberCount;
  out.push({
    id, level, type: 'dept', label: d.deptNm,
    sub: cum > 0 ? `${cum}명` : undefined,
    expandable, deptCode: d.deptCode,
  });
  if (isOpen(id)) {
    kids.forEach((c) => walkDept(c, level + 1, out, isOpen));
    const mem = deptMembers.value[d.deptCode];
    if (mem === 'loading') out.push({ id: id + ':loading', level: level + 1, type: 'loading', label: '불러오는 중…' });
    else if (Array.isArray(mem)) {
      if (mem.length === 0 && kids.length === 0) out.push({ id: id + ':empty', level: level + 1, type: 'empty', label: '(인원 없음)' });
      mem.forEach((m) => out.push({
        id: 'm:' + m.mberId + ':' + m.deptCode, level: level + 1, type: 'member', label: m.mberNm,
        sub: m.dutyNm ?? undefined, member: m,
      }));
    }
  }
}

// ---- 검색 ----
watch(query, (q) => {
  if (timer) clearTimeout(timer);
  const term = q.trim();
  if (!term) { searchResults.value = []; searching.value = false; return; }
  timer = setTimeout(() => runSearch(term), 250);
});
async function runSearch(term: string) {
  searching.value = true;
  try {
    const [ints, exts] = await Promise.all([
      showInternal.value ? dataClient.org.members({ q: term }) : Promise.resolve([]),
      showExternal.value ? dataClient.org.externalMembers(term) : Promise.resolve([]),
    ]);
    const rows: SearchRow[] = [];
    ints.forEach((m) => rows.push({ kind: 'int', m }));
    exts.forEach((e) => rows.push({ kind: 'ext', e }));
    searchResults.value = rows;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    searching.value = false;
  }
}
const isSearching = computed(() => query.value.trim().length > 0);

// ---- 선택 ----
function pickInternal(m: OrgMember) {
  emit('select', {
    source: 'INTERNAL', name: m.mberNm, amaranthEmpNo: m.mberId, personId: null,
    companyId: null, companyName: null, department: m.deptNm, position: m.dutyNm,
    dutyCode: m.dutyCode, employmentType: null,
  });
}
function pickExternal(e: OrgExternalMember) {
  emit('select', {
    source: 'EXTERNAL', name: e.name, amaranthEmpNo: null, personId: e.personId,
    companyId: e.companyId, companyName: e.companyName, department: e.department, position: e.position,
    dutyCode: null, employmentType: e.employmentType,
  });
}
function pickNewExternal() {
  emit('select', {
    source: 'NEW_EXTERNAL', name: null, amaranthEmpNo: null, personId: null,
    companyId: null, companyName: null, department: null, position: null, dutyCode: null, employmentType: null,
  });
}
function onRowClick(r: Row) {
  if (r.type === 'group' || r.type === 'dept') toggle(r.id, { deptCode: r.deptCode, isExternalRoot: r.isExternalRoot });
  else if (r.type === 'member' && r.member) pickInternal(r.member);
  else if (r.type === 'ext-member' && r.ext) pickExternal(r.ext);
  else if (r.type === 'new-external') pickNewExternal();
}
function subOf(m: OrgMember): string {
  return [m.deptNm, m.dutyNm].filter(Boolean).join(' · ');
}
function extSub(e: OrgExternalMember): string {
  return [e.companyName, e.position].filter(Boolean).join(' · ');
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="card" role="dialog" aria-modal="true">
      <div class="head">
        <h3 class="title">{{ title }}</h3>
        <button class="x" type="button" aria-label="닫기" @click="emit('close')">✕</button>
      </div>

      <div class="search">
        <input v-model="query" class="input" type="search" placeholder="이름·ID로 검색(내부·외부 통합)" autocomplete="off" />
      </div>

      <div class="body">
        <div v-if="error" class="notice err">{{ error }}</div>
        <div v-else-if="loading" class="notice">불러오는 중…</div>

        <!-- 검색 결과(플랫) -->
        <template v-else-if="isSearching">
          <div v-if="searching" class="notice">검색 중…</div>
          <div v-else-if="searchResults.length === 0" class="notice">일치하는 인원이 없습니다.</div>
          <ul v-else class="list">
            <li v-for="(r, i) in searchResults" :key="i" class="item leaf"
                @click="r.kind === 'int' ? pickInternal(r.m) : pickExternal(r.e)">
              <span class="dot" :class="r.kind === 'int' ? 'int' : 'ext'" />
              <span class="nm">{{ r.kind === 'int' ? r.m.mberNm : r.e.name }}</span>
              <span class="sub">{{ r.kind === 'int' ? subOf(r.m) : extSub(r.e) }}</span>
              <span class="tag">{{ r.kind === 'int' ? '내부' : '외부' }}</span>
            </li>
          </ul>
        </template>

        <!-- 트리 -->
        <ul v-else class="list">
          <li v-for="r in rows" :key="r.id"
              class="item"
              :class="{ leaf: r.type === 'member' || r.type === 'ext-member' || r.type === 'new-external', muted: r.type === 'loading' || r.type === 'empty' }"
              :style="{ paddingLeft: 8 + r.level * 18 + 'px' }"
              @click="onRowClick(r)">
            <span v-if="r.expandable" class="caret">{{ expanded.has(r.id) ? '▾' : '▸' }}</span>
            <span v-else-if="r.type === 'member' || r.type === 'ext-member'" class="dot" :class="r.type === 'member' ? 'int' : 'ext'" />
            <span v-else class="caret-sp" />
            <span class="nm" :class="{ group: r.type === 'group' }">{{ r.label }}</span>
            <span v-if="r.sub" class="sub">{{ r.sub }}</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed; inset: 0; z-index: 120;
  background: rgba(0, 0, 0, 0.55);
  display: flex; align-items: flex-start; justify-content: center;
  padding: 7vh 16px 16px; overflow-y: auto;
}
.card {
  width: 100%; max-width: 560px;
  background: var(--panel); border: 1px solid var(--border); border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5); display: flex; flex-direction: column;
  max-height: 82vh;
}
.head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px; border-bottom: 1px solid var(--border);
}
.title { font-size: 16px; margin: 0; }
.x { border: 0; background: transparent; color: var(--muted); font-size: 16px; cursor: pointer; padding: 4px; }
.x:hover { color: var(--text); }
.search { padding: 12px 16px 8px; }
.input {
  background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); font-size: 14px; padding: 8px 10px; outline: none; width: 100%; box-sizing: border-box;
}
.input:focus { border-color: var(--accent); }
.body { overflow-y: auto; padding: 0 8px 12px; }
.notice { padding: 14px 12px; font-size: 14px; color: var(--muted); }
.notice.err { color: var(--red); }
.list { list-style: none; margin: 0; padding: 0; }
.item {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 8px; border-radius: 7px; cursor: pointer; user-select: none;
}
.item:hover { background: var(--panel-2, var(--bg)); }
.item.muted { color: var(--muted); cursor: default; }
.item.muted:hover { background: transparent; }
.caret { width: 14px; text-align: center; font-size: 11px; color: var(--muted); flex-shrink: 0; }
.caret-sp { width: 14px; flex-shrink: 0; }
.dot { width: 7px; height: 7px; border-radius: 999px; flex-shrink: 0; margin: 0 3px; }
.dot.int { background: var(--blue, var(--accent)); }
.dot.ext { background: var(--yellow, #f59e0b); }
.nm { font-size: 14px; color: var(--text); }
.nm.group { font-weight: 700; }
.leaf .nm { font-weight: 500; }
.sub { font-size: 13px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tag {
  margin-left: auto; font-size: 11px; font-weight: 600; color: var(--muted);
  border: 1px solid var(--border); border-radius: 999px; padding: 0 7px;
}
</style>
