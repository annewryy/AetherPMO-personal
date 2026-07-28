<script setup lang="ts">
// 0009 모듈 3 → 0039 편집 격상 — 워크플로 관리 (/app/admin/workflows).
//   목록(추가/이름·설명·기본 여부 수정/삭제) + 상태(추가·수정·삭제) + 전이(추가·삭제) +
//   전이 조건(추가·삭제) + 상태머신 다이어그램.
//   쓰기는 전부 백엔드(workflowsAdmin) — 409(참조 가드)·400(불변식) 메시지를 그대로 노출한다.
import { ref, computed, watch, onMounted } from 'vue';
import { dataClient } from '../../lib/dataClient';
import type {
  Workflow, WorkflowStatus, CatalogNode, WorkflowStatusInput, TransitionConditionInput,
} from '../../types';
import WorkflowDiagram from '../../components/WorkflowDiagram.vue';
import StateNotice from '../../components/StateNotice.vue';
import ModalShell from '../../components/ModalShell.vue';
import CollapsibleSection from '../../components/CollapsibleSection.vue';

const workflows = ref<Workflow[]>([]);
const catalogRoots = ref<CatalogNode[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
const selectedId = ref<number | null>(null);
const actionError = ref<string | null>(null);
const busy = ref(false);

const selected = computed(() => workflows.value.find((w) => w.id === selectedId.value) ?? null);

const STATUS_CATEGORIES = ['TODO', 'IN_PROGRESS', 'DONE'] as const;
const STATUS_CATEGORY_LABELS: Record<string, string> = {
  TODO: '대기', IN_PROGRESS: '진행중', DONE: '완료',
};
// 조건 어휘 — 저장값은 백엔드 코드 그대로, 화면 표기만 한글(ConditionEngine.SCOPES/OPERATORS).
const CONDITION_SCOPES = [
  { code: 'SELF', label: '이 산출물 자신' },
  { code: 'TASK', label: '소속 태스크' },
  { code: 'PROJECT', label: '소속 프로젝트' },
];
const CONDITION_OPERATORS = [
  { code: 'EXISTS', label: '값이 있음' },
  { code: 'GTE', label: '지정값 이상(≥)' },
  { code: 'CHANGED_SINCE', label: '지정 시점 이후 변경됨' },
  { code: 'ROLE_IN', label: '역할이 지정 목록에 포함' },
  { code: 'ALL_CHILDREN_IN', label: '모든 하위 항목이 지정 상태' },
  { code: 'COMMENT_REQUIRED', label: '코멘트 필수' },
];
const scopeLabel = (code: string) => CONDITION_SCOPES.find((s) => s.code === code)?.label ?? code;
const operatorLabel = (code: string) => CONDITION_OPERATORS.find((o) => o.code === code)?.label ?? code;

// 0039 — 조건 빌더 선택지. 엔진(ConditionEngine)이 실제로 해석하는 것만 노출한다.
//   · 범위 해석: SELF=이 산출물 행 / TASK=소속 태스크 / PROJECT=소속 프로젝트.
//     ACTION_ITEM·ISSUE는 엔진에 해석기가 없어(항상 실패) 목록에서 제외.
//   · version_count는 가상 필드 — 행의 deliverable_id로 버전 수를 센다(프로젝트엔 없음).
const SCOPE_FIELDS: Record<string, { code: string; label: string }[]> = {
  SELF: [
    { code: 'status', label: '상태' },
    { code: 'file_name', label: '첨부 파일명' },
    { code: 'version_no', label: '버전 번호' },
    { code: 'version_count', label: '업로드된 버전 수' },
    { code: 'due_date', label: '마감일' },
    { code: 'submitted_at', label: '제출일시' },
    { code: 'author_name', label: '담당자명' },
  ],
  TASK: [
    { code: 'status', label: '태스크 상태' },
    { code: 'progress_rate', label: '태스크 진척률(%)' },
    { code: 'assignee_name', label: '태스크 담당자' },
    { code: 'planned_end_date', label: '계획 종료일' },
    { code: 'actual_end_date', label: '실제 종료일' },
    { code: 'version_count', label: '사용 산출물의 버전 수' },
  ],
  PROJECT: [
    { code: 'status', label: '프로젝트 상태' },
    { code: 'project_stage', label: '프로젝트 단계' },
    { code: 'bid_status', label: '입찰 상태' },
    { code: 'pm_name', label: 'PM' },
    { code: 'contract_amount', label: '계약금액' },
    { code: 'planned_end_date', label: '계획 종료일' },
  ],
};
/** 연산자별로 필요한 입력만 보여준다. */
const OPERATOR_FORM: Record<string, { scope: boolean; field: boolean; param: 'value' | 'sinceStatus' | 'roles' | 'statuses' | null }> = {
  EXISTS: { scope: true, field: true, param: null },
  GTE: { scope: true, field: true, param: 'value' },
  CHANGED_SINCE: { scope: true, field: false, param: 'sinceStatus' },
  ROLE_IN: { scope: false, field: false, param: 'roles' },
  ALL_CHILDREN_IN: { scope: true, field: false, param: 'statuses' },
  COMMENT_REQUIRED: { scope: false, field: false, param: null },
};
const DELIVERABLE_STATUSES = [
  { code: 'DRAFT', label: '작성중' }, { code: 'SUBMITTED', label: '제출' },
  { code: 'UNDER_REVIEW', label: '검토중' }, { code: 'APPROVED', label: '승인' },
  { code: 'REJECTED', label: '반려' },
];
const opForm = computed(() => OPERATOR_FORM[cOperator.value] ?? { scope: true, field: true, param: null });
const scopeFields = computed(() => SCOPE_FIELDS[cScope.value] ?? []);

// 이 워크플로를 참조하는 카탈로그 노드 수(비활성 포함 — 마스터 기준)
const usageById = computed(() => {
  const m = new Map<number, number>();
  const walk = (nodes: CatalogNode[]) => {
    for (const n of nodes) {
      if (n.workflowId != null) m.set(n.workflowId, (m.get(n.workflowId) ?? 0) + 1);
      walk(n.children);
    }
  };
  walk(catalogRoots.value);
  return m;
});

async function reload(keepId?: number | null) {
  workflows.value = await dataClient.workflows.list();
  const want = keepId ?? selectedId.value;
  selectedId.value = workflows.value.some((w) => w.id === want) ? want! : (workflows.value[0]?.id ?? null);
}

onMounted(async () => {
  try {
    [workflows.value, catalogRoots.value] = await Promise.all([
      dataClient.workflows.list(),
      dataClient.catalog.tree({ includeInactive: true }),
    ]);
    if (workflows.value.length) selectedId.value = workflows.value[0].id;
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
});

/** 쓰기 공통 래퍼 — 오류는 서버 message 그대로 표시하고 목록을 다시 읽는다. */
async function run(fn: () => Promise<unknown>, keepId?: number | null) {
  busy.value = true;
  actionError.value = null;
  try {
    await fn();
    await reload(keepId);
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}

// ---- 워크플로 추가/수정 모달 -------------------------------------------------
const wfModal = ref<{ mode: 'create' | 'edit'; id?: number } | null>(null);
const wfName = ref('');
const wfDesc = ref('');
const wfDefault = ref(false);

function openCreateWorkflow() {
  wfName.value = ''; wfDesc.value = ''; wfDefault.value = false;
  wfModal.value = { mode: 'create' };
}
function openEditWorkflow(w: Workflow) {
  wfName.value = w.name; wfDesc.value = w.description ?? ''; wfDefault.value = w.isDefault;
  wfModal.value = { mode: 'edit', id: w.id };
}
async function submitWorkflow() {
  const m = wfModal.value;
  if (!m || !wfName.value.trim()) return;
  const input = { name: wfName.value.trim(), description: wfDesc.value.trim() || null, isDefault: wfDefault.value };
  await run(async () => {
    if (m.mode === 'create') {
      const created = await dataClient.workflowsAdmin.create(input);
      selectedId.value = created.id;
    } else {
      await dataClient.workflowsAdmin.update(m.id!, input);
    }
    wfModal.value = null;
  }, m.mode === 'edit' ? m.id : undefined);
}
async function removeWorkflow(w: Workflow) {
  if (!window.confirm(`워크플로 "${w.name}"을(를) 삭제할까요? 사용 중이면 삭제되지 않습니다.`)) return;
  await run(() => dataClient.workflowsAdmin.remove(w.id), null);
}

// ---- 상태 추가/수정 모달 ------------------------------------------------------
const stModal = ref<{ mode: 'create' | 'edit'; status?: WorkflowStatus } | null>(null);
const stName = ref('');
const stCode = ref('');
const stCategory = ref<'TODO' | 'IN_PROGRESS' | 'DONE'>('TODO');
const stInitial = ref(false);
const stFinal = ref(false);
const stSort = ref(0);
const stWeight = ref<number | null>(null);   // 0039 — 상태별 진척률(%)

function openCreateStatus() {
  stName.value = ''; stCode.value = ''; stCategory.value = 'TODO';
  stInitial.value = false; stFinal.value = false; stWeight.value = null;
  stSort.value = (selected.value?.statuses.length ?? 0) * 10 + 10;
  stModal.value = { mode: 'create' };
}
function openEditStatus(s: WorkflowStatus) {
  stName.value = s.name; stCode.value = s.code ?? '';
  stCategory.value = (s.category as 'TODO' | 'IN_PROGRESS' | 'DONE') ?? 'TODO';
  stInitial.value = s.isInitial; stFinal.value = s.isFinal; stSort.value = s.sortOrder;
  stWeight.value = s.progressWeight ?? null;
  stModal.value = { mode: 'edit', status: s };
}
async function submitStatus() {
  const m = stModal.value;
  const wf = selected.value;
  if (!m || !wf || !stName.value.trim()) return;
  const input: WorkflowStatusInput = {
    name: stName.value.trim(),
    code: stCode.value.trim() || null,
    category: stCategory.value,
    isInitial: stInitial.value,
    isFinal: stFinal.value,
    sortOrder: stSort.value,
    progressWeight: stWeight.value,
  };
  await run(async () => {
    if (m.mode === 'create') await dataClient.workflowsAdmin.createStatus(wf.id, input);
    else await dataClient.workflowsAdmin.updateStatus(wf.id, m.status!.id, input);
    stModal.value = null;
  }, wf.id);
}
async function removeStatus(s: WorkflowStatus) {
  const wf = selected.value;
  if (!wf) return;
  if (!window.confirm(`상태 "${s.name}"을(를) 삭제할까요? 전이에서 사용 중이면 삭제되지 않습니다.`)) return;
  await run(() => dataClient.workflowsAdmin.removeStatus(wf.id, s.id), wf.id);
}

// ---- 전이 추가 ----------------------------------------------------------------
const trModal = ref(false);
const trFrom = ref<number | null>(null);
const trTo = ref<number | null>(null);
const trName = ref('');

function openCreateTransition() {
  trFrom.value = selected.value?.statuses[0]?.id ?? null;
  trTo.value = selected.value?.statuses[1]?.id ?? selected.value?.statuses[0]?.id ?? null;
  trName.value = '';
  trModal.value = true;
}
async function submitTransition() {
  const wf = selected.value;
  if (!wf || trFrom.value == null || trTo.value == null) return;
  await run(async () => {
    await dataClient.workflowsAdmin.createTransition(wf.id, {
      fromStatusId: trFrom.value!, toStatusId: trTo.value!, name: trName.value.trim() || null,
    });
    trModal.value = false;
  }, wf.id);
}
async function removeTransition(transitionId: number, label: string) {
  const wf = selected.value;
  if (!wf) return;
  if (!window.confirm(`전이 "${label}"을(를) 삭제할까요?`)) return;
  await run(() => dataClient.workflowsAdmin.removeTransition(wf.id, transitionId), wf.id);
}

// ---- 전이 조건 추가 -----------------------------------------------------------
const condModal = ref<{ transitionId: number; label: string } | null>(null);
const cScope = ref('SELF');
const cOperator = ref('EXISTS');
const cLeftField = ref('status');
const cMessage = ref('');
// 연산자별 파라미터 입력값
const cValue = ref<number | null>(null);          // GTE
const cSinceStatus = ref('SUBMITTED');            // CHANGED_SINCE
const cRoles = ref('');                           // ROLE_IN (쉼표 구분)
const cStatuses = ref<string[]>([]);              // ALL_CHILDREN_IN

function openCreateCondition(transitionId: number, label: string) {
  cScope.value = 'SELF'; cOperator.value = 'EXISTS'; cLeftField.value = 'status';
  cValue.value = null; cSinceStatus.value = 'SUBMITTED'; cRoles.value = ''; cStatuses.value = [];
  cMessage.value = '';
  condModal.value = { transitionId, label };
}
// 범위를 바꾸면 그 범위에 없는 필드는 첫 필드로 되돌린다.
watch(cScope, () => {
  if (!scopeFields.value.some((f) => f.code === cLeftField.value)) {
    cLeftField.value = scopeFields.value[0]?.code ?? '';
  }
});
function toggleChildStatus(code: string) {
  const set = new Set(cStatuses.value);
  if (set.has(code)) set.delete(code); else set.add(code);
  cStatuses.value = [...set];
}
async function submitCondition() {
  const m = condModal.value;
  if (!m) return;
  const form = opForm.value;
  let params: Record<string, unknown> | undefined;
  if (form.param === 'value') {
    if (cValue.value == null) { actionError.value = '기준값을 입력하세요.'; return; }
    params = { value: cValue.value };
  } else if (form.param === 'sinceStatus') {
    params = { since_status: cSinceStatus.value };
  } else if (form.param === 'roles') {
    const roles = cRoles.value.split(',').map((s) => s.trim()).filter(Boolean);
    if (!roles.length) { actionError.value = '역할을 1개 이상 입력하세요.'; return; }
    params = { roles };
  } else if (form.param === 'statuses') {
    if (!cStatuses.value.length) { actionError.value = '상태를 1개 이상 선택하세요.'; return; }
    params = { statuses: cStatuses.value };
  }
  const input: TransitionConditionInput = {
    subjectScope: form.scope ? cScope.value : 'SELF',
    operator: cOperator.value,
    leftField: form.field ? (cLeftField.value || null) : null,
    params,
    errorMessage: cMessage.value.trim() || null,
  };
  await run(async () => {
    await dataClient.workflowsAdmin.createCondition(m.transitionId, input);
    condModal.value = null;
  }, selectedId.value);
}
async function removeCondition(transitionId: number, conditionId: number) {
  if (!window.confirm('이 조건을 삭제할까요?')) return;
  await run(() => dataClient.workflowsAdmin.removeCondition(transitionId, conditionId), selectedId.value);
}

// ---- 표시 헬퍼 ----------------------------------------------------------------
function statusName(wf: Workflow | null, id: number): string {
  return wf?.statuses.find((s) => s.id === id)?.name ?? `#${id}`;
}
function transitionLabel(wf: Workflow | null, t: { fromStatusId: number; toStatusId: number; name: string | null }): string {
  return t.name || `${statusName(wf, t.fromStatusId)} → ${statusName(wf, t.toStatusId)}`;
}
</script>

<template>
  <div>
    <div class="head-row">
      <div>
        <h2 class="module-title">워크플로 관리</h2>
        <p class="sub">워크플로 종류 추가·수정과 상태/전이/조건 편집을 지원합니다. 사용 중인 항목은 삭제가 거부됩니다(409).</p>
      </div>
      <button class="btn btn-primary btn-sm" type="button" :disabled="busy" @click="openCreateWorkflow">+ 워크플로 추가</button>
    </div>

    <StateNotice
      :loading="loading" :error="loadError"
      :empty="!loading && !loadError && workflows.length === 0"
      empty-text="정의된 워크플로가 없습니다 — 위 '워크플로 추가'로 만들 수 있습니다."
    />
    <p v-if="actionError" class="msg err">{{ actionError }}</p>

    <div v-if="!loading && workflows.length > 0" class="layout">
      <aside class="wf-list">
        <button
          v-for="w in workflows" :key="w.id"
          class="wf-item" :class="{ on: w.id === selectedId }"
          @click="selectedId = w.id"
        >
          <span class="wf-name">{{ w.name }}<span v-if="w.isDefault" class="default-chip">기본</span></span>
          <span class="wf-meta">
            상태 {{ w.statuses.length }} · 전이 {{ w.transitions.length }} ·
            사용 노드 {{ usageById.get(w.id) ?? 0 }}
          </span>
        </button>
      </aside>

      <section class="detail">
        <template v-if="selected">
          <div class="detail-head">
            <div>
              <h3 class="wf-title">{{ selected.name }}</h3>
              <p v-if="selected.description" class="wf-desc">{{ selected.description }}</p>
            </div>
            <div class="detail-actions">
              <button class="btn btn-sm" type="button" :disabled="busy" @click="openEditWorkflow(selected)">이름·설명 수정</button>
              <button class="btn btn-sm danger" type="button" :disabled="busy" @click="removeWorkflow(selected)">삭제</button>
            </div>
          </div>

          <WorkflowDiagram :workflow="selected" />

          <CollapsibleSection title="상태" :count="selected.statuses.length" default-open>
            <div class="sect-actions">
              <button class="btn btn-sm" type="button" :disabled="busy" @click="openCreateStatus">+ 상태 추가</button>
            </div>
            <table class="tbl">
              <thead><tr><th>순서</th><th>이름</th><th>코드</th><th>분류</th><th class="num">진척률</th><th>시작</th><th>종료</th><th></th></tr></thead>
              <tbody>
                <tr v-for="s in selected.statuses" :key="s.id">
                  <td class="num">{{ s.sortOrder }}</td>
                  <td class="name">{{ s.name }}</td>
                  <td class="code">{{ s.code || '—' }}</td>
                  <td>{{ s.category ? (STATUS_CATEGORY_LABELS[s.category] ?? s.category) : '—' }}</td>
                  <td class="num strong">{{ s.progressWeight == null ? '—' : s.progressWeight + '%' }}</td>
                  <td>{{ s.isInitial ? '●' : '' }}</td>
                  <td>{{ s.isFinal ? '●' : '' }}</td>
                  <td class="row-actions">
                    <button class="btn-link" type="button" :disabled="busy" @click="openEditStatus(s)">수정</button>
                    <button class="btn-link danger" type="button" :disabled="busy" @click="removeStatus(s)">삭제</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </CollapsibleSection>

          <CollapsibleSection title="전이 · 조건" :count="selected.transitions.length" default-open>
            <div class="sect-actions">
              <button class="btn btn-sm" type="button" :disabled="busy || selected.statuses.length === 0" @click="openCreateTransition">+ 전이 추가</button>
            </div>
            <p v-if="selected.transitions.length === 0" class="msg">정의된 전이가 없습니다.</p>
            <div v-for="t in selected.transitions" :key="t.id" class="tr-card">
              <div class="tr-head">
                <span class="tr-label">{{ transitionLabel(selected, t) }}</span>
                <span class="tr-path">{{ statusName(selected, t.fromStatusId) }} → {{ statusName(selected, t.toStatusId) }}</span>
                <button class="btn-link" type="button" :disabled="busy" @click="openCreateCondition(t.id, transitionLabel(selected, t))">+ 조건</button>
                <button class="btn-link danger" type="button" :disabled="busy" @click="removeTransition(t.id, transitionLabel(selected, t))">삭제</button>
              </div>
              <ul v-if="t.conditions.length" class="cond-list">
                <li v-for="c in t.conditions" :key="c.id" class="cond">
                  <span class="cond-txt">
                    <b>{{ scopeLabel(c.subjectScope) }}</b>
                    <template v-if="c.leftField"> · {{ c.leftField }}</template>
                    — {{ operatorLabel(c.operator) }}
                    <template v-if="c.params && Object.keys(c.params).length">{{ JSON.stringify(c.params) }}</template>
                  </span>
                  <span v-if="c.errorMessage" class="cond-msg">“{{ c.errorMessage }}”</span>
                  <button class="btn-link danger" type="button" :disabled="busy" @click="removeCondition(t.id, c.id)">삭제</button>
                </li>
              </ul>
              <p v-else class="cond-none">조건 없음(무조건 전이 가능)</p>
            </div>
          </CollapsibleSection>

          <p class="usage">이 워크플로를 사용하는 카탈로그 노드: {{ usageById.get(selected.id) ?? 0 }}개</p>
        </template>
      </section>
    </div>

    <!-- 워크플로 추가/수정 -->
    <ModalShell v-if="wfModal" :title="wfModal.mode === 'create' ? '워크플로 추가' : '워크플로 수정'" @close="wfModal = null">
      <label class="label">이름 <span class="req">*</span></label>
      <input v-model="wfName" class="input" type="text" placeholder="예: 산출물 승인" :disabled="busy" />
      <label class="label">설명</label>
      <textarea v-model="wfDesc" class="input" rows="2" placeholder="설명 (선택)" :disabled="busy" />
      <label class="chk"><input v-model="wfDefault" type="checkbox" :disabled="busy" /> 기본 워크플로로 지정</label>
      <template #footer>
        <button class="btn btn-sm" type="button" :disabled="busy" @click="wfModal = null">취소</button>
        <button class="btn btn-primary btn-sm" type="button" :disabled="busy || !wfName.trim()" @click="submitWorkflow">저장</button>
      </template>
    </ModalShell>

    <!-- 상태 추가/수정 -->
    <ModalShell v-if="stModal" :title="stModal.mode === 'create' ? '상태 추가' : '상태 수정'" @close="stModal = null">
      <label class="label">이름 <span class="req">*</span></label>
      <input v-model="stName" class="input" type="text" placeholder="예: 검토중" :disabled="busy" />
      <label class="label">코드 <span class="hint">(엔티티 status 값과 매칭 — 비우면 이름으로 매칭)</span></label>
      <input v-model="stCode" class="input" type="text" placeholder="예: IN_REVIEW" :disabled="busy" />
      <div class="row2">
        <div>
          <label class="label">분류</label>
          <select v-model="stCategory" class="input" :disabled="busy">
            <option v-for="c in STATUS_CATEGORIES" :key="c" :value="c">{{ STATUS_CATEGORY_LABELS[c] }}</option>
          </select>
        </div>
        <div>
          <label class="label">정렬 순서</label>
          <input v-model.number="stSort" class="input" type="number" :disabled="busy" />
        </div>
      </div>
      <label class="label">
        진척률(%)
        <span class="hint">이 상태의 산출물이 기여하는 진척도 — 태스크 진척률은 하위 산출물들의 이 값 평균입니다(비우면 0%)</span>
      </label>
      <input v-model.number="stWeight" class="input" type="number" min="0" max="100" placeholder="예: 30" :disabled="busy" />
      <label class="chk"><input v-model="stInitial" type="checkbox" :disabled="busy" /> 시작 상태</label>
      <label class="chk"><input v-model="stFinal" type="checkbox" :disabled="busy" /> 종료 상태</label>
      <template #footer>
        <button class="btn btn-sm" type="button" :disabled="busy" @click="stModal = null">취소</button>
        <button class="btn btn-primary btn-sm" type="button" :disabled="busy || !stName.trim()" @click="submitStatus">저장</button>
      </template>
    </ModalShell>

    <!-- 전이 추가 -->
    <ModalShell v-if="trModal" title="전이 추가" @close="trModal = false">
      <div class="row2">
        <div>
          <label class="label">시작 상태 <span class="req">*</span></label>
          <select v-model.number="trFrom" class="input" :disabled="busy">
            <option v-for="s in selected?.statuses ?? []" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
        </div>
        <div>
          <label class="label">도착 상태 <span class="req">*</span></label>
          <select v-model.number="trTo" class="input" :disabled="busy">
            <option v-for="s in selected?.statuses ?? []" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
        </div>
      </div>
      <label class="label">전이 이름 <span class="hint">(선택 — 버튼에 표시)</span></label>
      <input v-model="trName" class="input" type="text" placeholder="예: 승인 요청" :disabled="busy" />
      <template #footer>
        <button class="btn btn-sm" type="button" :disabled="busy" @click="trModal = false">취소</button>
        <button class="btn btn-primary btn-sm" type="button" :disabled="busy || trFrom == null || trTo == null" @click="submitTransition">추가</button>
      </template>
    </ModalShell>

    <!-- 전이 조건 추가 -->
    <ModalShell v-if="condModal" :title="`조건 추가 — ${condModal.label}`" @close="condModal = null">
      <label class="label">조건 종류</label>
      <select v-model="cOperator" class="input" :disabled="busy">
        <option v-for="o in CONDITION_OPERATORS" :key="o.code" :value="o.code">{{ o.label }}</option>
      </select>

      <div v-if="opForm.scope || opForm.field" class="row2">
        <div v-if="opForm.scope">
          <label class="label">대상 범위</label>
          <select v-model="cScope" class="input" :disabled="busy">
            <option v-for="s in CONDITION_SCOPES" :key="s.code" :value="s.code">{{ s.label }}</option>
          </select>
        </div>
        <div v-if="opForm.field">
          <label class="label">대상 항목</label>
          <select v-model="cLeftField" class="input" :disabled="busy">
            <option v-for="f in scopeFields" :key="f.code" :value="f.code">{{ f.label }}</option>
          </select>
        </div>
      </div>

      <template v-if="opForm.param === 'value'">
        <label class="label">기준값 <span class="hint">(이 값 이상이면 통과)</span></label>
        <input v-model.number="cValue" class="input" type="number" placeholder="예: 100" :disabled="busy" />
      </template>
      <template v-else-if="opForm.param === 'sinceStatus'">
        <label class="label">기준 상태 <span class="hint">(이 상태가 된 이후 새 버전이 올라왔는지 확인)</span></label>
        <select v-model="cSinceStatus" class="input" :disabled="busy">
          <option v-for="s in DELIVERABLE_STATUSES" :key="s.code" :value="s.code">{{ s.label }}</option>
        </select>
      </template>
      <template v-else-if="opForm.param === 'roles'">
        <label class="label">허용 역할 <span class="hint">(참여인력의 직책/역할명, 쉼표로 구분)</span></label>
        <input v-model="cRoles" class="input" type="text" placeholder="예: PM, 품질담당" :disabled="busy" />
      </template>
      <template v-else-if="opForm.param === 'statuses'">
        <label class="label">하위 산출물이 도달해야 할 상태 <span class="hint">(선택한 상태 중 하나면 통과)</span></label>
        <div class="chk-grid">
          <label v-for="s in DELIVERABLE_STATUSES" :key="s.code" class="chk">
            <input type="checkbox" :checked="cStatuses.includes(s.code)" :disabled="busy" @change="toggleChildStatus(s.code)" />
            {{ s.label }}
          </label>
        </div>
      </template>
      <p v-else-if="cOperator === 'COMMENT_REQUIRED'" class="msg">전이 실행 시 코멘트 입력을 필수로 만듭니다 — 추가 설정이 없습니다.</p>

      <label class="label">실패 안내 문구 <span class="hint">(조건 미충족 시 사용자에게 표시)</span></label>
      <input v-model="cMessage" class="input" type="text" placeholder="예: 산출물 파일을 1개 이상 첨부하세요." :disabled="busy" />
      <template #footer>
        <button class="btn btn-sm" type="button" :disabled="busy" @click="condModal = null">취소</button>
        <button class="btn btn-primary btn-sm" type="button" :disabled="busy" @click="submitCondition">추가</button>
      </template>
    </ModalShell>
  </div>
</template>

<style scoped>
.head-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.module-title { font-size: 17px; margin: 0 0 4px; }
.sub { color: var(--muted); font-size: 13px; margin: 0 0 14px; max-width: 640px; }
.msg { font-size: 12.5px; color: var(--muted); }
.msg.err { color: var(--red); }

.layout { display: flex; gap: 14px; align-items: flex-start; }
.wf-list { width: 230px; flex-shrink: 0; display: flex; flex-direction: column; gap: 6px; }
.wf-item {
  text-align: left; border: 1px solid var(--border); background: var(--panel);
  border-radius: 8px; padding: 10px 12px; cursor: pointer; color: var(--text);
  display: flex; flex-direction: column; gap: 3px; font-family: inherit;
}
.wf-item:hover { background: var(--panel-2); }
.wf-item.on { border-color: var(--accent); background: rgba(139, 92, 246, 0.1); }
.wf-name { font-size: 14px; font-weight: 600; }
.default-chip {
  margin-left: 6px; font-size: 11px; color: var(--muted); font-weight: 400;
  border: 1px solid var(--border); border-radius: 999px; padding: 0 6px;
}
.wf-meta { font-size: 12px; color: var(--muted); }

.detail {
  flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 12px;
  background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 16px;
}
.detail-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.detail-actions { display: flex; gap: 6px; flex-shrink: 0; }
.wf-title { font-size: 15px; margin: 0; }
.wf-desc { font-size: 13px; color: var(--muted); margin: 4px 0 0; }
.usage { font-size: 13px; color: var(--muted); margin: 0; }

.sect-actions { display: flex; justify-content: flex-end; margin-bottom: 8px; }
.tbl { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.tbl th, .tbl td { border-bottom: 1px solid var(--border); padding: 6px 8px; text-align: left; }
.tbl th { color: var(--muted); font-weight: 600; font-size: 11.5px; }
.tbl .num { text-align: right; color: var(--muted); width: 48px; }
.tbl .name { font-weight: 600; }
.tbl .code { font-family: ui-monospace, monospace; color: var(--muted); }
.row-actions { display: flex; gap: 8px; justify-content: flex-end; }

.tr-card { border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; margin-bottom: 8px; background: var(--bg); }
.tr-head { display: flex; align-items: center; gap: 10px; }
.tr-label { font-weight: 600; font-size: 13px; }
.tr-path { flex: 1; font-size: 12px; color: var(--muted); }
.cond-list { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
.cond { display: flex; align-items: center; gap: 8px; font-size: 12.5px; }
.cond-txt { font-family: ui-monospace, monospace; }
.cond-msg { flex: 1; color: var(--muted); font-size: 12px; }
.cond-none { margin: 6px 0 0; font-size: 12px; color: var(--muted); }

.btn-link { border: 0; background: transparent; color: var(--accent); font-size: 12px; cursor: pointer; font-family: inherit; padding: 0; }
.btn-link:hover:not(:disabled) { text-decoration: underline; }
.btn-link:disabled { opacity: 0.5; cursor: default; }
.btn-link.danger, .btn.danger { color: var(--red); }
.btn.danger { border-color: var(--red); }

.label { font-size: 13px; color: var(--muted); }
.req { color: var(--red); }
.hint { color: var(--muted); font-weight: 400; font-size: 11.5px; }
.input {
  background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); font-size: 14px; padding: 8px 10px; outline: none;
  font-family: inherit; width: 100%; box-sizing: border-box; resize: vertical;
}
.input:focus { border-color: var(--accent); }
.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.row2 > div { display: flex; flex-direction: column; gap: 4px; }
.chk { display: inline-flex; align-items: center; gap: 6px; font-size: 13.5px; cursor: pointer; }
.chk-grid { display: flex; flex-wrap: wrap; gap: 10px 16px; }
.tbl .strong { font-weight: 700; }
</style>
