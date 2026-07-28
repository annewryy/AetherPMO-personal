<script setup lang="ts">
// 0033 개정 — 입찰 → 수행 전환 마법사(너울님 2026-07-26):
//   나라장터→입찰 마법사와 동일 흐름. Step1 입찰 정보 프리필 + 수행 추가 입력(기간 등)
//   → Step2 테일러링 선택(CatalogSelector 재사용) → Step3 확인·전환.
//   전환 트랜잭션(정보 복사·컨소시엄/연락처 복제·수주·완료 처리·전개)은 백엔드(0001 경계).
import { ref, reactive, computed } from 'vue';
import { dataClient } from '../lib/dataClient';
import type { Project, ProjectConvertInput, CatalogNode } from '../types';
import { subtreeIds, toTailoringEntries } from '../lib/tailoring';
import TailoringPicker from './TailoringPicker.vue';
import OrgPersonField from './OrgPersonField.vue';

const props = defineProps<{ project: Project }>();
const emit = defineEmits<{ (e: 'converted', p: Project): void; (e: 'close'): void }>();

const STEPS = ['기본정보', '테일러링', '확인'];
const step = ref(0);

const form = reactive({
  name: props.project.name ?? '',
  customerName: props.project.customerName ?? '',
  contractAmount: (props.project.projectBudget || null) as number | null,
  pmName: props.project.manager ?? '',
  dept: props.project.dept ?? '',
  location: props.project.location ?? '',
  plannedStartDate: '',
  plannedEndDate: '',
  description: props.project.desc ?? '',
});

// --- 테일러링 선택 — 유형·규모 컨트롤은 TailoringPicker 공용 컴포넌트가 담당 ---
const catalogTree = ref<CatalogNode[]>([]);
const catalogLoading = ref(false);
const catalogError = ref<string | null>(null);
const catalogLoaded = ref(false);
const selectedNodeIds = reactive(new Set<number>());

function toggleNode(node: CatalogNode, checked: boolean) {
  const ids = subtreeIds(node);
  if (checked) ids.forEach((id) => selectedNodeIds.add(id));
  else ids.forEach((id) => selectedNodeIds.delete(id));
}
function addNodes(ids: number[]) { ids.forEach((id) => selectedNodeIds.add(id)); }
function removeNodes(ids: number[]) { ids.forEach((id) => selectedNodeIds.delete(id)); }
function clearSelection() { selectedNodeIds.clear(); }
const selectedCount = computed(() => selectedNodeIds.size);

async function loadCatalog() {
  if (catalogLoaded.value || catalogLoading.value) return;
  catalogLoading.value = true;
  catalogError.value = null;
  try {
    catalogTree.value = await dataClient.catalog.tree();
    catalogLoaded.value = true;
  } catch (e) {
    catalogError.value = e instanceof Error ? e.message : String(e);
  } finally {
    catalogLoading.value = false;
  }
}

const saving = ref(false);
const saveError = ref<string | null>(null);
const step1Valid = computed(() => form.name.trim().length > 0);
const canSubmit = computed(() => step1Valid.value && !saving.value);

function goNext() {
  if (step.value === 0 && !step1Valid.value) return;
  if (step.value < STEPS.length - 1) step.value += 1;
  if (step.value === 1) loadCatalog();
}
function goPrev() { if (step.value > 0) step.value -= 1; }

const budgetText = (v: number | null): string => (v ? v.toLocaleString('ko-KR') + ' 원' : '—');
const dash = (v: string | null | undefined) => (v && String(v).trim() ? v : '—');

async function submit() {
  if (!canSubmit.value) return;
  saving.value = true;
  saveError.value = null;
  try {
    const input: ProjectConvertInput = {};
    const s = (v: string) => v.trim() || undefined;
    if (s(form.name)) input.name = s(form.name);
    if (s(form.customerName)) input.customerName = s(form.customerName);
    if (form.contractAmount != null && !Number.isNaN(form.contractAmount)) {
      input.contractAmount = Number(form.contractAmount);
    }
    if (s(form.pmName)) input.pmName = s(form.pmName);
    if (s(form.dept)) input.dept = s(form.dept);
    if (s(form.location)) input.location = s(form.location);
    if (s(form.plannedStartDate)) input.plannedStartDate = s(form.plannedStartDate);
    if (s(form.plannedEndDate)) input.plannedEndDate = s(form.plannedEndDate);
    if (s(form.description)) input.description = s(form.description);
    if (selectedNodeIds.size > 0) {
      // 조상 전개는 **필터 전 전체 트리** 기준(유형 필터로 조상이 끊기지 않게).
      input.tailoring = toTailoringEntries(selectedNodeIds, catalogTree.value);
    }
    const created = await dataClient.projects.convertToExecution(props.project.id, input);
    emit('converted', created);
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : String(e);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="overlay" @click.self="!saving && emit('close')">
    <div class="modal" role="dialog" aria-modal="true" aria-label="수행 전환">
      <header class="head">
        <h2 class="title">수행 전환 — {{ props.project.projectCode }}</h2>
        <button class="x" type="button" aria-label="닫기" :disabled="saving" @click="emit('close')">✕</button>
      </header>

      <ol class="steps" aria-label="진행 단계">
        <li v-for="(label, i) in STEPS" :key="label" class="step" :class="{ on: step === i, done: step > i }">
          <span class="sno">{{ i + 1 }}</span>
          <span class="slabel">{{ label }}</span>
        </li>
      </ol>

      <div class="body">
        <!-- Step 1. 기본정보(입찰 프리필 + 수행 추가 입력) -->
        <section v-show="step === 0" class="pane">
          <p class="lead">입찰 프로젝트 정보를 프리필했습니다. 수행 기간 등 추가 정보를 입력하세요.</p>
          <form class="form" @submit.prevent="goNext">
            <label class="field">
              <span class="flabel">사업명 <span class="req">*</span></span>
              <input v-model="form.name" class="in" type="text" required :disabled="saving" />
            </label>
            <div class="grid2">
              <label class="field">
                <span class="flabel">고객사(기관)</span>
                <input v-model="form.customerName" class="in" type="text" :disabled="saving" />
              </label>
              <label class="field">
                <span class="flabel">계약금액(원)</span>
                <input v-model.number="form.contractAmount" class="in" type="number" min="0" step="1" :disabled="saving" />
              </label>
              <label class="field">
                <span class="flabel">PM</span>
                <OrgPersonField v-model="form.pmName" placeholder="PM 이름" :disabled="saving" title="PM 선택" />
              </label>
              <label class="field">
                <span class="flabel">수행부서</span>
                <input v-model="form.dept" class="in" type="text" :disabled="saving" />
              </label>
              <label class="field">
                <span class="flabel">수행장소</span>
                <input v-model="form.location" class="in" type="text" placeholder="예: 서울" :disabled="saving" />
              </label>
              <label class="field">
                <span class="flabel">수행 시작일</span>
                <input v-model="form.plannedStartDate" class="in" type="date" :disabled="saving" />
              </label>
              <label class="field">
                <span class="flabel">수행 종료일</span>
                <input v-model="form.plannedEndDate" class="in" type="date" :disabled="saving" />
              </label>
            </div>
            <label class="field">
              <span class="flabel">설명</span>
              <textarea v-model="form.description" class="in" rows="2" :disabled="saving"></textarea>
            </label>
            <p class="hint">전환 시 컨소시엄·연락처가 복제되고, 이 입찰 프로젝트는 수주·완료 처리됩니다. 코드(-B 제거)·발번은 자동입니다.</p>
          </form>
        </section>

        <!-- Step 2. 테일러링 선택 -->
        <section v-show="step === 1" class="pane">
          <p class="lead">
            수행 단계에 필요한 단계·활동·태스크·산출물을 선택하세요. 상위 항목을 체크하면 하위가 함께 선택됩니다.
            선택하지 않으면 태스크 없이 생성되며, 이후 테일러링에서 전개할 수 있습니다.
          </p>
          <p v-if="catalogLoading" class="tl-state">테일러링 표준 트리 불러오는 중…</p>
          <p v-else-if="catalogError" class="tl-state err">불러오기 실패: {{ catalogError }}</p>
          <TailoringPicker
            v-else
            :stage="'EXECUTION'"
            :tree="catalogTree"
            :selected="selectedNodeIds"
            :contract-amount="form.contractAmount"
            :disabled="saving"
            @toggle="toggleNode"
            @add="addNodes"
            @remove="removeNodes"
            @clear="clearSelection"
          />
        </section>

        <!-- Step 3. 확인 & 전환 -->
        <section v-show="step === 2" class="pane">
          <p class="lead">아래 내용으로 수행 프로젝트를 생성하고, 이 입찰 프로젝트는 수주·완료 처리합니다.</p>
          <dl class="summary">
            <div class="wide"><dt>사업명</dt><dd>{{ dash(form.name) }}</dd></div>
            <div><dt>고객사(기관)</dt><dd>{{ dash(form.customerName) }}</dd></div>
            <div><dt>계약금액</dt><dd>{{ budgetText(form.contractAmount) }}</dd></div>
            <div><dt>PM</dt><dd>{{ dash(form.pmName) }}</dd></div>
            <div><dt>수행 기간</dt><dd>{{ dash(form.plannedStartDate) }} ~ {{ dash(form.plannedEndDate) }}</dd></div>
            <div class="wide">
              <dt>테일러링 선택</dt>
              <dd>{{ selectedCount > 0 ? `${selectedCount}개 선택(조상 자동 포함) — 태스크·산출물 전개` : '선택 안 함 — 전개 없이 생성' }}</dd>
            </div>
            <div class="wide"><dt>원본 입찰</dt><dd>{{ props.project.projectCode }} — 전환 후 수주·완료 처리(기록 유지)</dd></div>
          </dl>
          <div v-if="saveError" class="notice err">
            전환에 실패했습니다. <span class="detail">({{ saveError }})</span>
          </div>
        </section>
      </div>

      <footer class="foot">
        <button type="button" class="btn" :disabled="step === 0 || saving" @click="goPrev">이전</button>
        <div class="spacer" />
        <button type="button" class="btn" :disabled="saving" @click="emit('close')">취소</button>
        <button v-if="step < STEPS.length - 1" type="button" class="btn btn-primary"
                :disabled="(step === 0 && !step1Valid) || saving" @click="goNext">다음</button>
        <button v-else type="button" class="btn btn-primary" :disabled="!canSubmit" @click="submit">
          {{ saving ? '전환 중…' : '수행 전환' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(0, 0, 0, 0.55);
  display: flex; align-items: flex-start; justify-content: center;
  padding: 6vh 16px 24px; overflow-y: auto;
}
.modal {
  width: 100%; max-width: 880px;
  background: var(--panel); border: 1px solid var(--border); border-radius: 14px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
  display: flex; flex-direction: column; max-height: 88vh;
}

.head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 24px; border-bottom: 1px solid var(--border);
}
.mtitle { font-size: 18px; margin: 0; }
.x {
  border: 0; background: transparent; color: var(--muted);
  font-size: 17px; cursor: pointer; line-height: 1; padding: 6px; border-radius: 6px;
}
.x:hover:not(:disabled) { background: var(--panel-2); color: var(--text); }
.x:disabled { opacity: 0.4; cursor: not-allowed; }

/* 스텝 인디케이터 */
.steps {
  display: flex; align-items: center; gap: 6px; list-style: none;
  margin: 0; padding: 16px 24px 0;
}
.step { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
.step .dot {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border-radius: 999px; flex-shrink: 0;
  border: 1px solid var(--border); background: var(--panel-2); color: var(--muted);
  font-size: 13px; font-weight: 700;
}
.step .slabel { font-size: 14px; font-weight: 600; color: var(--muted); white-space: nowrap; }
.step.on .dot { background: var(--accent); border-color: var(--accent); color: #fff; }
.step.on .slabel { color: var(--text); }
.step.done .dot { background: var(--accent); border-color: var(--accent); color: #fff; opacity: 0.75; }
.step.done .slabel { color: var(--text); }
.step:not(:last-child)::after {
  content: ''; flex: 1; height: 1px; background: var(--border); margin: 0 4px;
}

.body { padding: 20px 24px; overflow-y: auto; }
.pane { display: flex; flex-direction: column; gap: 14px; }
.lead { margin: 0; font-size: 14px; color: var(--muted); line-height: 1.55; }

.form { display: flex; flex-direction: column; gap: 14px; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.field { display: flex; flex-direction: column; gap: 5px; }
.flabel { font-size: 13px; font-weight: 600; color: var(--muted); }
.req { color: var(--accent); }
.in {
  background: var(--panel-2, var(--panel)); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); font-size: 14px; padding: 9px 12px; outline: none; width: 100%; box-sizing: border-box;
}
.in:focus { border-color: var(--accent); }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }

.hint { margin: 0; font-size: 13px; color: var(--muted); opacity: 0.85; }
.tl-state { font-size: 14px; color: var(--muted); margin: 4px 0; }
.tl-state.err { color: var(--danger, #c0392b); }
.tl-state .detail { opacity: 0.75; }

/* Step 3 요약 */
.summary {
  display: grid; grid-template-columns: 1fr 1fr; gap: 14px 24px; margin: 0;
  border: 1px solid var(--border); border-radius: 10px; background: var(--panel-2); padding: 16px 18px;
}
.summary .wide { grid-column: 1 / -1; }
.summary dt { color: var(--muted); font-size: 12px; margin-bottom: 3px; }
.summary dd { margin: 0; font-size: 15px; color: var(--text); }

.notice {
  padding: 12px 14px; border-radius: 8px;
  background: var(--panel); border: 1px solid var(--border); color: var(--muted); font-size: 14px;
}
.notice.err { border-color: var(--danger, #c0392b); color: var(--danger, #c0392b); }
.notice .detail { opacity: 0.75; }

.foot {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 24px; border-top: 1px solid var(--border);
}
.spacer { flex: 1; }
.btn {
  border: 1px solid var(--border); background: var(--panel-2); color: var(--text);
  font-size: 14px; font-weight: 600; padding: 9px 18px; border-radius: 8px; cursor: pointer;
}
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary { background: var(--accent); color: #fff; border-color: var(--accent); }
.owners-head { font-size: 13px; font-weight: 700; margin: 12px 0 6px; padding-top: 12px; border-top: 1px solid var(--border); }
.owners-sub { font-weight: 400; color: var(--muted); font-size: 11.5px; }
</style>
