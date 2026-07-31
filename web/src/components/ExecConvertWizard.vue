<script setup lang="ts">
// 0033 개정 — 입찰 → 수행 전환 마법사(너울님 2026-07-26):
//   나라장터→입찰 마법사와 동일 흐름. Step1 입찰 정보 프리필 + 수행 추가 입력(기간 등)
//   → Step2 테일러링 선택(CatalogSelector 재사용) → Step3 확인·전환.
//   전환 트랜잭션(정보 복사·컨소시엄/연락처 복제·수주·완료 처리·전개)은 백엔드(0001 경계).
//   ⚠️ 2026-07-29 임시: 발표 시연 편의를 위해 수행 사업번호를 자동으로 채워 넣는다.
//      아래 "[임시 — 시연용 자동 채번]" 블록만 지우면 원래(직접 입력) 동작으로 돌아온다.
import { ref, reactive, computed, onMounted } from 'vue';
import { dataClient } from '../lib/dataClient';
import type { Project, ProjectConvertInput, CatalogNode } from '../types';
import { subtreeIds, toTailoringEntries } from '../lib/tailoring';
import { useProjectCode } from '../lib/projectCode';
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
// 수행 프로젝트 사업번호 — 2026-07-29부터 입찰코드에서 자동 파생하지 않고 직접 입력한다.
const { code: projectCode, state: codeState, message: codeMessage, canSubmit: codeOk } = useProjectCode();

const step1Valid = computed(() => form.name.trim().length > 0 && codeOk.value);
const canSubmit = computed(() => step1Valid.value && !saving.value);

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ [임시 — 시연용 자동 채번] 2026-07-29 너울님 요청.
//   정식 규칙은 "수행 사업번호는 사용자가 직접 입력"이다(자동 발번 폐지, 0029/0033).
//   발표 자료 촬영·시연 중에 매번 사업번호를 손으로 만들어 넣지 않도록, 기존 코드 체계를
//   보고 다음 번호를 후보로 채워 넣기만 한다(입력칸은 그대로 수정 가능).
//   TODO(시연 종료 후 제거): 이 블록 전체 + onMounted 호출 + 템플릿의 .demo-hint 안내 문구.
//   서버는 여전히 필수·중복 검증을 하므로 이 값이 틀려도 저장이 강행되지는 않는다.
const demoAutoCode = ref(false);   // 시연용 자동 채움이 실제로 일어났는지(안내 문구 노출용)

/** 기존 코드에서 접두어(OKC26 등)와 순번 자릿수를 추론해 다음 빈 번호를 만든다. */
async function autofillProjectCode() {
  if (projectCode.value.trim()) return;   // 사용자가 이미 입력했으면 건드리지 않는다
  try {
    const projects = await dataClient.projects.list();
    const CODE_RE = /^([A-Za-z]+\d{2})-(\d+)$/;   // 예: OKC26-023
    const srcPrefix = props.project.projectCode?.match(CODE_RE)?.[1];
    const counts = new Map<string, number>();
    let width = 3;
    let maxSeq = 0;
    for (const p of projects) {
      const m = p.projectCode?.match(CODE_RE);
      if (!m) continue;
      counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
    }
    // 원본 입찰 코드의 접두어 > 가장 많이 쓰인 접두어 > 올해 기본값(OKC{YY}).
    const topPrefix = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const prefix = srcPrefix ?? topPrefix ?? `OKC${String(new Date().getFullYear() % 100).padStart(2, '0')}`;
    for (const p of projects) {
      const m = p.projectCode?.match(CODE_RE);
      if (!m || m[1] !== prefix) continue;
      width = Math.max(width, m[2].length);
      maxSeq = Math.max(maxSeq, Number(m[2]));
    }
    // 중복이면 다음 번호로 — 시연 중 반복 전환해도 계속 새 번호가 나오게.
    for (let seq = maxSeq + 1; seq <= maxSeq + 50; seq += 1) {
      const candidate = `${prefix}-${String(seq).padStart(width, '0')}`;
      const r = await dataClient.projects.codeAvailable(candidate);
      if (r.available) {
        projectCode.value = candidate;
        demoAutoCode.value = true;
        return;
      }
    }
  } catch {
    // 자동 채움은 편의 기능일 뿐 — 실패하면 조용히 빈칸으로 두고 직접 입력받는다.
  }
}
onMounted(autofillProjectCode);
// ───────────────────────────────── 임시 블록 끝 ──────────────────────────────

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
    const input: ProjectConvertInput = { projectCode: projectCode.value.trim() };
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
        <h2 class="title">수행 전환 — {{ props.project.projectCode || props.project.name }}</h2>
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
            <label class="field">
              <span class="flabel">수행 사업번호 <span class="req">*</span></span>
              <input
                v-model="projectCode" class="in mono" type="text" maxlength="50" required
                placeholder="예: OKC26-045 (수행 프로젝트에 부여할 사업번호)"
                :class="{ bad: codeState === 'taken' }" :disabled="saving"
              />
              <span v-if="codeMessage" class="code-msg" :class="codeState">{{ codeMessage }}</span>
              <!-- TODO(시연 종료 후 제거): 임시 자동 채번 안내(script의 임시 블록과 함께 삭제) -->
              <span v-if="demoAutoCode" class="demo-hint">자동으로 다음 번호를 채웠습니다 — 필요하면 수정하세요.</span>
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
            <div class="wide"><dt>원본 입찰</dt><dd>{{ props.project.projectCode || props.project.name }} — 전환 후 수주·완료 처리(기록 유지)</dd></div>
            <div><dt>수행 사업번호</dt><dd class="mono">{{ projectCode.trim() || '—' }}</dd></div>
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
.in.bad { border-color: var(--red); }
/* 사업번호 중복 확인 결과 */
.code-msg { font-size: 12px; color: var(--muted); margin-top: 4px; display: block; }
.code-msg.ok { color: var(--green, #22c55e); }
.code-msg.taken, .code-msg.error { color: var(--red); }
/* TODO(시연 종료 후 제거): 임시 자동 채번 안내 문구 스타일 */
.demo-hint { font-size: 12px; color: var(--muted); margin-top: 2px; display: block; opacity: 0.85; }
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
