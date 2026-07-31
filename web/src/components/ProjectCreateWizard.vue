<script setup lang="ts">
// 0044 §A — 신규 프로젝트 생성 마법사(입찰/수행 공용).
//   "+ 신규 프로젝트"가 폼 모달 대신 이 3스텝 마법사를 연다 — 나라장터→입찰(BidProjectCreateWizard)·
//   입찰→수행(ExecConvertWizard)과 같은 골격(스텝 인디케이터·TailoringPicker·확인 요약).
//   Step 1 기본정보 — 최상단에서 단계(입찰/수행)를 고르면 사업번호 필수 여부·상태 어휘가 따라온다.
//   Step 2 테일러링 — 선택 단계의 PHASE만 노출(TailoringPicker :stage).
//   Step 3 확인 & 생성 — dataClient.projects.create() (백엔드 분기 기존 그대로 — 신규 API 없음).
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue';
import { dataClient } from '../lib/dataClient';
import type { Project, ProjectCreateInput, CatalogNode } from '../types';
import { subtreeIds, toTailoringEntries } from '../lib/tailoring';
import { useProjectCode } from '../lib/projectCode';
import TailoringPicker from './TailoringPicker.vue';
import OrgPersonField from './OrgPersonField.vue';

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'created', project: Project): void;
}>();

const STEPS = ['기본정보', '테일러링 선택', '확인 & 생성'] as const;
const step = ref(0);

// 단계(생성 대상). 입찰=사업번호 선택 입력, 수행=필수(수주 후 사업번호 존재).
const STAGES = [
  { value: 'BIDDING', label: '입찰' },
  { value: 'EXECUTION', label: '수행' },
] as const;
const stage = ref<'BIDDING' | 'EXECUTION'>('BIDDING');
// 상태 어휘(백엔드 한글 저장값). 미선택이면 백엔드 기본값(입찰: 입찰/제안준비중, 수행: 진행중).
const statusOptions = computed(() =>
  stage.value === 'BIDDING' ? ['입찰', '보류'] : ['진행중', '지연', '보류']);

const form = reactive({
  name: '',
  customerName: '',
  businessType: '',
  dept: '',
  location: '',
  pmName: '',
  budget: null as number | null,
  contractAmount: null as number | null,
  status: '',
  plannedStartDate: '',
  plannedEndDate: '',
  announcementNo: '',
  salesOwner: '',
  proposalOwner: '',
  proposalPm: '',
  businessManager: '',
  contractOwner: '',
  legalOwner: '',
  description: '',
});

// 사업번호 — 입찰은 선택(수주 후 채번), 수행은 필수. 중복은 실시간 확인 + 서버 409.
const { code: projectCode, state: codeState, message: codeMessage, canSubmit: codeOk } =
  useProjectCode(undefined, () => stage.value !== 'BIDDING');

// --- Step 2 테일러링 ---
const catalogTree = ref<CatalogNode[]>([]);
const catalogLoading = ref(false);
const catalogError = ref<string | null>(null);
const catalogLoaded = ref(false);
const selectedNodeIds = reactive(new Set<number>());
const selectedCount = computed(() => selectedNodeIds.size);

function toggleNode(node: CatalogNode, checked: boolean) {
  const ids = subtreeIds(node);
  if (checked) ids.forEach((id) => selectedNodeIds.add(id));
  else ids.forEach((id) => selectedNodeIds.delete(id));
}
function addNodes(ids: number[]) { ids.forEach((id) => selectedNodeIds.add(id)); }
function removeNodes(ids: number[]) { ids.forEach((id) => selectedNodeIds.delete(id)); }
function clearSelection() { selectedNodeIds.clear(); }

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

const step1Valid = computed(() => form.name.trim().length > 0 && codeOk.value);
const canSubmit = computed(() => step1Valid.value && !saving.value);

function goNext() {
  if (step.value === 0 && !step1Valid.value) return;
  if (step.value < STEPS.length - 1) step.value += 1;
  if (step.value === 1) loadCatalog();
}
function goPrev() { if (step.value > 0) step.value -= 1; }

const moneyText = (v: number | null): string => (v ? v.toLocaleString('ko-KR') + ' 원' : '—');
const dash = (v: string | null | undefined) => (v && String(v).trim() ? v : '—');
const stageLabel = computed(() => STAGES.find((s) => s.value === stage.value)?.label ?? stage.value);

async function submit() {
  if (!canSubmit.value) return;
  saving.value = true;
  saveError.value = null;
  try {
    const input: ProjectCreateInput = { name: form.name.trim(), stage: stage.value };
    const s = (v: string) => v.trim() || undefined;
    if (s(projectCode.value)) input.projectCode = s(projectCode.value);
    if (s(form.customerName)) input.customerName = s(form.customerName);
    if (s(form.businessType)) input.businessType = s(form.businessType);
    if (s(form.dept)) input.dept = s(form.dept);
    if (s(form.location)) input.location = s(form.location);
    if (s(form.pmName)) input.pmName = s(form.pmName);
    if (form.budget != null) input.budget = form.budget;
    if (form.contractAmount != null) input.contractAmount = form.contractAmount;
    if (form.status) input.status = form.status;
    if (s(form.plannedStartDate)) input.plannedStartDate = s(form.plannedStartDate);
    if (s(form.plannedEndDate)) input.plannedEndDate = s(form.plannedEndDate);
    if (s(form.announcementNo)) input.announcementNo = s(form.announcementNo);
    if (s(form.salesOwner)) input.salesOwner = s(form.salesOwner);
    if (s(form.proposalOwner)) input.proposalOwner = s(form.proposalOwner);
    if (s(form.proposalPm)) input.proposalPm = s(form.proposalPm);
    if (s(form.businessManager)) input.businessManager = s(form.businessManager);
    if (s(form.contractOwner)) input.contractOwner = s(form.contractOwner);
    if (s(form.legalOwner)) input.legalOwner = s(form.legalOwner);
    if (s(form.description)) input.description = s(form.description);
    if (selectedNodeIds.size > 0) {
      // 조상 전개는 필터 전 전체 트리 기준(유형 필터로 조상이 끊기지 않게).
      input.tailoring = toTailoringEntries(selectedNodeIds, catalogTree.value);
    }
    const project = await dataClient.projects.create(input);
    emit('created', project);
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : String(e);
  } finally {
    saving.value = false;
  }
}

function onKey(ev: KeyboardEvent) {
  if (ev.key === 'Escape' && !saving.value) emit('close');
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="overlay" @click.self="!saving && emit('close')">
    <div class="modal" role="dialog" aria-modal="true" aria-label="신규 프로젝트 등록">
      <header class="head">
        <h2 class="mtitle">신규 프로젝트 등록</h2>
        <button class="x" type="button" aria-label="닫기" :disabled="saving" @click="emit('close')">✕</button>
      </header>

      <ol class="steps" aria-label="진행 단계">
        <li v-for="(label, i) in STEPS" :key="label" class="step" :class="{ on: i === step, done: i < step }">
          <span class="dot">{{ i < step ? '✓' : i + 1 }}</span>
          <span class="slabel">{{ label }}</span>
        </li>
      </ol>

      <div class="body">
        <!-- Step 1. 기본정보 -->
        <section v-show="step === 0" class="pane">
          <form class="form" @submit.prevent="goNext">
            <div class="field">
              <span class="flabel">단계 <span class="req">*</span></span>
              <div class="stage-row">
                <button
                  v-for="s2 in STAGES" :key="s2.value" type="button"
                  class="stage-chip" :class="{ on: stage === s2.value }" :disabled="saving"
                  @click="stage = s2.value; form.status = ''"
                >{{ s2.label }}</button>
                <span class="stage-hint">
                  {{ stage === 'BIDDING' ? '입찰 단계 — 사업번호는 수주 후 입력해도 됩니다.' : '수행 단계 — 사업번호가 필수입니다.' }}
                </span>
              </div>
            </div>
            <label class="field">
              <span class="flabel">사업명 <span class="req">*</span></span>
              <input v-model="form.name" class="in" type="text" required :disabled="saving" />
            </label>
            <label class="field">
              <span class="flabel">사업번호
                <span v-if="stage === 'BIDDING'" class="opt">(선택 — 수주 후 입력 가능)</span>
                <span v-else class="req">*</span>
              </span>
              <input
                v-model="projectCode" class="in mono" type="text" maxlength="50"
                :placeholder="stage === 'BIDDING' ? '예: OKC26-001 (아직 없으면 비워 두세요)' : '예: OKC26-001'"
                :class="{ bad: codeState === 'taken' }" :disabled="saving"
              />
              <span v-if="codeMessage" class="code-msg" :class="codeState">{{ codeMessage }}</span>
            </label>
            <div class="grid2">
              <label class="field">
                <span class="flabel">고객사(기관)</span>
                <input v-model="form.customerName" class="in" type="text" :disabled="saving" />
              </label>
              <label class="field">
                <span class="flabel">사업유형</span>
                <input v-model="form.businessType" class="in" type="text" placeholder="예: SI 구축" :disabled="saving" />
              </label>
              <label class="field">
                <span class="flabel">계약금액(원)</span>
                <input v-model.number="form.contractAmount" class="in" type="number" min="0" step="1" :disabled="saving" />
              </label>
              <label class="field">
                <span class="flabel">예산(원)</span>
                <input v-model.number="form.budget" class="in" type="number" min="0" step="1" :disabled="saving" />
              </label>
              <label class="field">
                <span class="flabel">수행부서</span>
                <input v-model="form.dept" class="in" type="text" :disabled="saving" />
              </label>
              <label class="field">
                <span class="flabel">수행장소</span>
                <input v-model="form.location" class="in" type="text" :disabled="saving" />
              </label>
              <label class="field">
                <span class="flabel">상태</span>
                <select v-model="form.status" class="in" :disabled="saving">
                  <option value="">기본({{ stage === 'BIDDING' ? '입찰' : '진행중' }})</option>
                  <option v-for="st in statusOptions" :key="st" :value="st">{{ st }}</option>
                </select>
              </label>
              <label class="field">
                <span class="flabel">공고번호</span>
                <input v-model="form.announcementNo" class="in mono" type="text" :disabled="saving" />
              </label>
              <label class="field">
                <span class="flabel">계획 시작일</span>
                <input v-model="form.plannedStartDate" class="in" type="date" :disabled="saving" />
              </label>
              <label class="field">
                <span class="flabel">계획 종료일</span>
                <input v-model="form.plannedEndDate" class="in" type="date" :disabled="saving" />
              </label>
              <label class="field">
                <span class="flabel">PM</span>
                <OrgPersonField v-model="form.pmName" placeholder="PM 이름" :disabled="saving" title="PM 선택" />
              </label>
            </div>
            <label class="field">
              <span class="flabel">설명</span>
              <textarea v-model="form.description" class="in ta" rows="2" :disabled="saving"></textarea>
            </label>
            <p class="owners-head">담당조직 지정 <span class="owners-sub">(선택)</span></p>
            <div class="grid2">
              <label class="field"><span class="flabel">영업 담당자</span>
                <OrgPersonField v-model="form.salesOwner" placeholder="영업 담당자" :disabled="saving" title="영업 담당자 선택" /></label>
              <label class="field"><span class="flabel">제안전략팀 담당자</span>
                <OrgPersonField v-model="form.proposalOwner" placeholder="제안전략팀 담당자" :disabled="saving" title="제안전략팀 담당자 선택" /></label>
              <label class="field"><span class="flabel">제안PM</span>
                <OrgPersonField v-model="form.proposalPm" placeholder="제안PM" :disabled="saving" title="제안PM 선택" /></label>
              <label class="field"><span class="flabel">사업관리 담당자</span>
                <OrgPersonField v-model="form.businessManager" placeholder="사업관리 담당자" :disabled="saving" title="사업관리 담당자 선택" /></label>
              <label class="field"><span class="flabel">계약 담당자</span>
                <OrgPersonField v-model="form.contractOwner" placeholder="계약 담당자" :disabled="saving" title="계약 담당자 선택" /></label>
              <label class="field"><span class="flabel">법무 담당자</span>
                <OrgPersonField v-model="form.legalOwner" placeholder="법무 담당자" :disabled="saving" title="법무 담당자 선택" /></label>
            </div>
          </form>
        </section>

        <!-- Step 2. 테일러링 선택 -->
        <section v-show="step === 1" class="pane">
          <p class="lead">
            <b>{{ stageLabel }}</b> 단계의 방법론 트리에서 전개할 항목을 선택하세요.
            계약금액으로 규모(소/중/대)를 판정해 <b>규모별 필수 산출물을 자동 선택</b>할 수 있습니다.
            선택하지 않으면 테일러링 없이 생성되며, 생성 후에도 WBS 탭의 '테일러링 편집'에서 추가할 수 있습니다.
          </p>
          <p v-if="catalogLoading" class="tl-state">테일러링 불러오는 중…</p>
          <p v-else-if="catalogError" class="tl-state err">
            테일러링을 불러오지 못했습니다. <span class="detail">({{ catalogError }})</span>
            테일러링 없이도 등록할 수 있습니다.
          </p>
          <p v-else-if="catalogLoaded && catalogTree.length === 0" class="tl-state">
            선택 가능한 테일러링 항목이 없습니다 — 테일러링 없이 기본 생성됩니다.
          </p>
          <TailoringPicker
            v-else-if="catalogTree.length > 0"
            :stage="stage"
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

        <!-- Step 3. 확인 & 생성 -->
        <section v-show="step === 2" class="pane">
          <p class="lead">아래 내용으로 신규 <b>{{ stageLabel }}</b> 프로젝트를 생성합니다.</p>
          <dl class="summary">
            <div class="wide"><dt>사업명</dt><dd>{{ dash(form.name) }}</dd></div>
            <div><dt>단계</dt><dd>{{ stageLabel }}</dd></div>
            <div><dt>사업번호</dt><dd class="mono">{{ dash(projectCode) }}</dd></div>
            <div><dt>고객사(기관)</dt><dd>{{ dash(form.customerName) }}</dd></div>
            <div><dt>계약금액</dt><dd>{{ moneyText(form.contractAmount) }}</dd></div>
            <div><dt>계획 기간</dt><dd>{{ dash(form.plannedStartDate) }} ~ {{ dash(form.plannedEndDate) }}</dd></div>
            <div><dt>PM</dt><dd>{{ dash(form.pmName) }}</dd></div>
            <div class="wide">
              <dt>테일러링 선택</dt>
              <dd>{{ selectedCount > 0 ? `${selectedCount}개 선택(조상 자동 포함)` : '선택 안 함 — 테일러링 없이 생성' }}</dd>
            </div>
          </dl>

          <div v-if="saveError" class="notice err">
            등록에 실패했습니다. <span class="detail">({{ saveError }})</span>
          </div>
        </section>
      </div>

      <footer class="foot">
        <button type="button" class="btn" :disabled="step === 0 || saving" @click="goPrev">이전</button>
        <div class="spacer" />
        <button type="button" class="btn" :disabled="saving" @click="emit('close')">취소</button>
        <button
          v-if="step < STEPS.length - 1"
          type="button" class="btn btn-primary"
          :disabled="(step === 0 && !step1Valid) || saving"
          @click="goNext"
        >다음</button>
        <button v-else type="button" class="btn btn-primary" :disabled="!canSubmit" @click="submit">
          {{ saving ? '생성 중…' : '생성' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
/* BidProjectCreateWizard와 동일 골격(0044 §A — 마법사 3형제 외형 통일) */
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
.opt { color: var(--muted); font-weight: 400; }
.in {
  background: var(--panel-2, var(--panel)); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); font-size: 14px; padding: 9px 12px; outline: none; width: 100%; box-sizing: border-box;
}
.in:focus { border-color: var(--accent); }
.in.bad { border-color: var(--red); }
.in.ta { resize: vertical; font-family: inherit; }
.code-msg { font-size: 12px; color: var(--muted); margin-top: 4px; display: block; }
.code-msg.ok { color: var(--green, #22c55e); }
.code-msg.taken, .code-msg.error { color: var(--red); }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }

/* 단계 선택 칩 */
.stage-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.stage-chip {
  border: 1px solid var(--border); background: var(--panel-2); color: var(--muted);
  font-size: 14px; font-weight: 700; padding: 8px 22px; border-radius: 999px;
  cursor: pointer; font-family: inherit;
}
.stage-chip:hover:not(:disabled) { color: var(--text); }
.stage-chip.on { background: var(--accent); color: #fff; border-color: var(--accent); }
.stage-hint { font-size: 12.5px; color: var(--muted); }

.tl-state { font-size: 14px; color: var(--muted); margin: 4px 0; }
.tl-state.err { color: var(--danger, #c0392b); }
.tl-state .detail { opacity: 0.75; }

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
