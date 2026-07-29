<script setup lang="ts">
// 0039 — 인력관리 좌측 네비게이터. 조직도 선택창(OrgPickerModal)과 같은 구조로
//   내부인력(부서 트리) · 외부인력(회사별)을 한 트리에 보여준다.
//   다만 표시 대상은 전부 **인력 마스터(pms_person)** 기준이다(사용자 결정 2026-07-28):
//   · 내부 = 부서 트리는 조직도 부서 마스터를 구조로만 쓰고, 선택 시 person.department로 필터
//   · 외부 = /api/org/external-members(= pms_person source=EXTERNAL)를 회사별로 묶는다
//   목록·상세와 같은 원본을 보므로 네비 수치와 목록 결과가 어긋나지 않는다.
//   부서 트리는 OrgDeptTree(재귀·하위 합산 인원수)를 그대로 재사용한다 — 예전엔 이 파일이
//   템플릿에 2단계(루트→자식)만 하드코딩해 3단 이하 부서가 아예 보이지 않았다.
import { ref, computed } from 'vue';
import { dataClient } from '../lib/dataClient';
import type { OrgExternalMember } from '../types';
import OrgDeptTree from './OrgDeptTree.vue';

export type PersonScope =
  | { kind: 'all' }
  | { kind: 'dept'; deptCode: string }
  | { kind: 'company'; companyName: string };

const emit = defineEmits<{ (e: 'select', v: PersonScope): void }>();

const externals = ref<OrgExternalMember[] | null>(null);
const loadError = ref<string | null>(null);
const expanded = ref<Set<string>>(new Set(['root:internal']));
const selectedKey = ref<string>('all');

// 부서 선택 상태는 여기가 소유한다 — 회사(외부인력)를 고르면 부서 하이라이트가 풀려야 하므로.
const selectedDeptCode = computed(() =>
  selectedKey.value.startsWith('dept:') ? selectedKey.value.slice(5) : null);

/** 외부 인력을 회사별로 묶는다(소속 미지정 포함). */
const companyGroups = computed(() => {
  const list = externals.value ?? [];
  const m = new Map<string, number>();
  for (const e of list) {
    const name = e.companyName ?? '(소속 미지정)';
    m.set(name, (m.get(name) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
});

async function loadExternals() {
  if (externals.value !== null) return;
  try {
    externals.value = await dataClient.org.externalMembers();
  } catch (e) {
    externals.value = [];
    loadError.value = e instanceof Error ? e.message : String(e);
  }
}

function toggle(key: string) {
  const s = new Set(expanded.value);
  if (s.has(key)) s.delete(key); else s.add(key);
  expanded.value = s;
  if (key === 'root:external') void loadExternals();
}

function pickAll() { selectedKey.value = 'all'; emit('select', { kind: 'all' }); }
function onDeptSelect(v: { deptCode: string | null }) {
  if (!v.deptCode) { pickAll(); return; }
  selectedKey.value = 'dept:' + v.deptCode;
  emit('select', { kind: 'dept', deptCode: v.deptCode });
}
function pickCompany(name: string) {
  selectedKey.value = 'company:' + name;
  emit('select', { kind: 'company', companyName: name === '(소속 미지정)' ? '' : name });
}
</script>

<template>
  <div class="nav">
    <p v-if="loadError" class="err">{{ loadError }}</p>

    <button type="button" class="row all" :class="{ on: selectedKey === 'all' }" @click="pickAll">전체</button>

    <!-- 내부인력: 부서 트리(구조는 조직도 부서 마스터, 대상은 인력 마스터) -->
    <button type="button" class="row group" @click="toggle('root:internal')">
      <span class="caret">{{ expanded.has('root:internal') ? '▾' : '▸' }}</span> 내부인력
    </button>
    <div v-if="expanded.has('root:internal')" class="subtree">
      <OrgDeptTree
        :show-all-row="false"
        :selected-code="selectedDeptCode"
        @select="onDeptSelect"
      />
    </div>

    <!-- 외부인력: 회사별(인력 마스터 source=EXTERNAL) -->
    <button type="button" class="row group" @click="toggle('root:external')">
      <span class="caret">{{ expanded.has('root:external') ? '▾' : '▸' }}</span> 외부인력
    </button>
    <template v-if="expanded.has('root:external')">
      <p v-if="externals === null" class="dim sub">불러오는 중…</p>
      <p v-else-if="companyGroups.length === 0" class="dim sub">등록된 외부 인력이 없습니다.</p>
      <button
        v-for="g in companyGroups" :key="g.name"
        type="button" class="row dept lv1"
        :class="{ on: selectedKey === 'company:' + g.name }"
        @click="pickCompany(g.name)"
      >
        <span class="caret sp" /><span class="nm">{{ g.name }}</span>
        <span class="cnt">{{ g.count }}</span>
      </button>
    </template>
  </div>
</template>

<style scoped>
.nav { display: flex; flex-direction: column; gap: 2px; font-size: 13px; }
.dim { color: var(--muted); font-size: 12.5px; margin: 4px 0; }
.dim.sub { padding-left: 18px; }
.err { color: var(--red); font-size: 12.5px; margin: 4px 0; }
.subtree { padding-left: 12px; }
.row {
  display: flex; align-items: center; gap: 5px; width: 100%; text-align: left;
  border: 0; background: transparent; color: var(--text); font-family: inherit;
  padding: 5px 6px; border-radius: 6px; cursor: pointer;
}
.row:hover { background: var(--panel); }
.row.on { background: rgba(139, 92, 246, 0.14); color: var(--accent); font-weight: 600; }
.row.group { font-weight: 700; color: var(--muted); margin-top: 4px; }
.row.all { font-weight: 600; }
.lv1 { padding-left: 14px; }
.caret { width: 12px; flex-shrink: 0; color: var(--muted); font-size: 10px; }
.caret.sp { visibility: hidden; }
.nm { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cnt { font-size: 11px; color: var(--muted); flex-shrink: 0; }
</style>
