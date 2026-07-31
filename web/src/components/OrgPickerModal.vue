<script setup lang="ts">
// 조직도 선택 모달(0020) — 재사용 컴포넌트.
//   최상위 가지: 내부인력(부서 트리 → 부서 펼치면 인원) · 외부인력(회사별 그룹 + 신규 직접입력).
//   상단 검색으로 내부/외부 인원 통합 검색. 선택 시 통일된 OrgPick을 emit하고 닫는다.
//   참여인력 등록·PM 선택·담당자 지정 등 어디서든 <OrgPickerModal @select @close/>로 사용.
//
// 0042 — 부서 축은 OrgDeptTree에 위임한다. 예전엔 이 파일이 트리 조립·하위 합산 인원수·재귀
//   walk를 자체 구현해 OrgDeptTree와 거의 같은 코드가 두 벌이었다(인력관리 좌측 트리가 2단에서
//   잘린 버그가 정확히 그 중복에서 나왔다). 부서 인원 행은 #after-dept 슬롯으로 끼워 넣는다.
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { dataClient } from '../lib/dataClient';
import type { OrgDept, OrgMember, OrgExternalMember, OrgPick } from '../types';
import OrgDeptTree from './OrgDeptTree.vue';

const props = withDefaults(defineProps<{
  roots?: 'both' | 'internal' | 'external';
  allowNewExternal?: boolean;
  title?: string;
}>(), { roots: 'both', allowNewExternal: true, title: '조직도에서 선택' });

const emit = defineEmits<{ (e: 'select', pick: OrgPick): void; (e: 'close'): void }>();

const showInternal = computed(() => props.roots !== 'external');
const showExternal = computed(() => props.roots !== 'internal');

// ---- 데이터 ----
const deptMembers = ref<Record<string, OrgMember[] | 'loading'>>({});
const externalMembers = ref<OrgExternalMember[] | 'loading' | null>(null);
// 최상위 가지(내부인력/외부인력)의 펼침만 여기서 관리 — 부서 트리 내부 펼침은 OrgDeptTree가 소유.
const openInternal = ref(true);
const openExternal = ref(false);
const error = ref<string | null>(null);

// ---- 검색 ----
const query = ref('');
type SearchRow = { kind: 'int'; m: OrgMember } | { kind: 'ext'; e: OrgExternalMember };
const searchResults = ref<SearchRow[]>([]);
const searching = ref(false);
let timer: ReturnType<typeof setTimeout> | null = null;

onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => { window.removeEventListener('keydown', onKey); if (timer) clearTimeout(timer); });
function onKey(ev: KeyboardEvent) { if (ev.key === 'Escape') emit('close'); }

// ---- 부서 인원(지연 로드) ----
// 부서를 펼칠 때 OrgDeptTree가 'open'을 쏜다. 이미 받은 부서는 다시 부르지 않는다.
async function onDeptOpen(code: string) {
  if (deptMembers.value[code] !== undefined) return;
  deptMembers.value = { ...deptMembers.value, [code]: 'loading' };
  try {
    const list = await dataClient.org.members({ deptCode: code });
    deptMembers.value = { ...deptMembers.value, [code]: list };
  } catch {
    deptMembers.value = { ...deptMembers.value, [code]: [] };
  }
}
// 인원이 있는 부서는 하위 부서가 없어도 펼칠 수 있어야 한다(잎 부서의 인원 목록).
function deptExpandable(d: OrgDept, hasKids: boolean): boolean {
  return hasKids || d.memberCount > 0;
}

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
const openCompanies = ref<Set<string>>(new Set());
function toggleCompany(key: string) {
  const s = new Set(openCompanies.value);
  if (s.has(key)) s.delete(key); else s.add(key);
  openCompanies.value = s;
}
function toggleExternalRoot() {
  openExternal.value = !openExternal.value;
  if (openExternal.value && externalMembers.value === null) void loadExternal();
}
async function loadExternal() {
  externalMembers.value = 'loading';
  try { externalMembers.value = await dataClient.org.externalMembers(); }
  catch { externalMembers.value = []; }
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
    companyId: null, companyName: null, department: m.deptNm, deptCode: m.deptCode,
    position: m.dutyNm, dutyCode: m.dutyCode, employmentType: null,
  });
}
function pickExternal(e: OrgExternalMember) {
  emit('select', {
    source: 'EXTERNAL', name: e.name, amaranthEmpNo: null, personId: e.personId,
    companyId: e.companyId, companyName: e.companyName, department: e.department, deptCode: null,
    position: e.position, dutyCode: null, employmentType: e.employmentType,
  });
}
function pickNewExternal() {
  emit('select', {
    source: 'NEW_EXTERNAL', name: null, amaranthEmpNo: null, personId: null,
    companyId: null, companyName: null, department: null, deptCode: null,
    position: null, dutyCode: null, employmentType: null,
  });
}
function subOf(m: OrgMember): string {
  return [m.deptNm, m.dutyNm].filter(Boolean).join(' · ');
}
function extSub(e: OrgExternalMember): string {
  return [e.companyName, e.position].filter(Boolean).join(' · ');
}
/** 부서 인원 행 들여쓰기 — OrgDeptTree의 부서명(캐럿 18px + level*14px)에 맞춘다. */
function memberIndent(level: number): string {
  return `${level * 14 + 26}px`;
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
        <template v-else>
          <!-- 내부인력: 부서 트리(OrgDeptTree) + 부서별 인원 행(슬롯) -->
          <template v-if="showInternal">
            <div class="item" @click="openInternal = !openInternal">
              <span class="caret">{{ openInternal ? '▾' : '▸' }}</span>
              <span class="nm group">내부인력</span>
            </div>
            <div v-show="openInternal" class="dept-wrap">
              <OrgDeptTree
                :show-all-row="false"
                mode="expand"
                count-suffix="명"
                :expandable="deptExpandable"
                @open="onDeptOpen"
              >
                <template #after-dept="{ dept, level, hasKids }">
                  <div v-if="deptMembers[dept.deptCode] === 'loading'"
                       class="item muted" :style="{ paddingLeft: memberIndent(level) }">
                    <span class="caret-sp" /><span class="nm">불러오는 중…</span>
                  </div>
                  <template v-else-if="Array.isArray(deptMembers[dept.deptCode])">
                    <div v-if="(deptMembers[dept.deptCode] as OrgMember[]).length === 0 && !hasKids"
                         class="item muted" :style="{ paddingLeft: memberIndent(level) }">
                      <span class="caret-sp" /><span class="nm">(인원 없음)</span>
                    </div>
                    <div v-for="m in (deptMembers[dept.deptCode] as OrgMember[])"
                         :key="m.mberId + ':' + m.deptCode"
                         class="item leaf" :style="{ paddingLeft: memberIndent(level) }"
                         @click="pickInternal(m)">
                      <span class="dot int" />
                      <span class="nm">{{ m.mberNm }}</span>
                      <span v-if="m.dutyNm" class="sub">{{ m.dutyNm }}</span>
                    </div>
                  </template>
                </template>
              </OrgDeptTree>
            </div>
          </template>

          <!-- 외부인력: 회사별 그룹 -->
          <template v-if="showExternal">
            <div class="item" @click="toggleExternalRoot">
              <span class="caret">{{ openExternal ? '▾' : '▸' }}</span>
              <span class="nm group">외부인력</span>
            </div>
            <template v-if="openExternal">
              <div v-if="externalMembers === 'loading' || externalMembers === null" class="item muted lv1">
                <span class="caret-sp" /><span class="nm">불러오는 중…</span>
              </div>
              <template v-else>
                <template v-for="g in externalGroups" :key="g.key">
                  <div class="item lv1" @click="toggleCompany(g.key)">
                    <span class="caret">{{ openCompanies.has(g.key) ? '▾' : '▸' }}</span>
                    <span class="nm group">{{ g.name }}</span>
                    <span class="sub">{{ g.members.length }}명</span>
                  </div>
                  <div v-for="e in (openCompanies.has(g.key) ? g.members : [])" :key="'ext:' + e.personId"
                       class="item leaf lv2" @click="pickExternal(e)">
                    <span class="dot ext" />
                    <span class="nm">{{ e.name }}</span>
                    <span v-if="[e.position, e.department].filter(Boolean).length" class="sub">
                      {{ [e.position, e.department].filter(Boolean).join(' · ') }}
                    </span>
                  </div>
                </template>
                <div v-if="allowNewExternal" class="item leaf lv1" @click="pickNewExternal">
                  <span class="caret-sp" /><span class="nm">＋ 새 외부 인력 직접 입력</span>
                </div>
                <div v-else-if="externalGroups.length === 0" class="item muted lv1">
                  <span class="caret-sp" /><span class="nm">등록된 외부 인력이 없습니다.</span>
                </div>
              </template>
            </template>
          </template>
        </template>
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
/* 부서 트리는 OrgDeptTree가 자체 스타일을 갖는다. 들여쓰기 기준만 맞춘다. */
.dept-wrap { padding-left: 8px; }
.item {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 8px; border-radius: 7px; cursor: pointer; user-select: none;
}
.item:hover { background: var(--panel-2, var(--bg)); }
.item.muted { color: var(--muted); cursor: default; }
.item.muted:hover { background: transparent; }
.lv1 { padding-left: 26px; }
.lv2 { padding-left: 44px; }
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
