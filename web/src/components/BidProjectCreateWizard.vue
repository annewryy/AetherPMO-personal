<script setup lang="ts">
// 입찰 프로젝트 등록 — 중앙 모달 3스텝 마법사 (0017 §C-2 재설계).
//  드로어 인라인 폼(BidNoticeDetailPanel)을 대체. 딤 배경 중앙 모달(≈860px) + 스텝 인디케이터(1-2-3).
//   Step 1 기본정보 — 공고 상세에서 프리필된 필드(사업명·고객·계약금액·공고번호·마감일) 편집.
//   Step 2 카탈로그 선택 — 기존 CatalogSelector(P4: 검색·필터·미리보기, cascade up/down) 재사용.
//   Step 3 확인 & 생성 — 입력값 + 선택 항목 수 요약 → dataClient.projects.create({...prefill, tailoring}).
//  프리필 매핑(0017 §B): name←공고명, customerName←수요기관, contractAmount←배정예산(없으면 추정가격),
//   announcementNo←공고번호, proposalDeadline←마감일(yyyy-MM-dd). stage/status/bidStatus·발번(-B)은 백엔드.
//  성공 시 emit('created', project) — 부모가 모달 닫고 /projects 이동 + 안내. 실패 시 스텝 내 {message}.
//  더미데이터 금지([[no-dummy-data]]): 프리필은 공고 실제 값만, 없으면 빈 값.
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue';
import { dataClient } from '../lib/dataClient';
import type { BidNoticeDetail, Project, ProjectCreateInput, CatalogNode, TailoringEntry } from '../types';
import CatalogSelector from './CatalogSelector.vue';
import OrgPersonField from './OrgPersonField.vue';

const props = defineProps<{ notice: BidNoticeDetail }>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'created', project: Project): void;
}>();

const STEPS = ['기본정보', '카탈로그 선택', '확인 & 생성'] as const;
const step = ref(0); // 0-base 스텝 인덱스

// 마감일 원문(입찰마감일시, "YYYY-MM-DD HH:MM:SS" 또는 "-") → <input type="date"> 값(yyyy-MM-dd).
//   앞 10자리가 날짜 형태면 사용, 아니면 빈 값(프리필 생략).
function toDeadline(v: string | null | undefined): string {
  const d = (v || '').trim();
  if (!d || d === '-') return '';
  const head = d.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(head) ? head : '';
}

// --- Step 1 폼 모델(프리필, 편집 가능) ---
const form = reactive({
  name: props.notice.name || '',
  customerName: props.notice.demandAgencyName || props.notice.customer || '',
  // 계약금액: 배정예산 우선, 없으면 추정가격, 없으면 리스트 budget.
  contractAmount:
    props.notice.assignBudgetAmount ??
    props.notice.estimatedPrice ??
    props.notice.budget ??
    (null as number | null),
  announcementNo: props.notice.announcementNo || '',
  proposalDeadline: toDeadline(props.notice.endDate),
  pmName: '',
});

// --- Step 2 카탈로그 선택(테일러링) 상태 (0017 §C) ---
const catalogTree = ref<CatalogNode[]>([]);
const catalogLoading = ref(false);
const catalogError = ref<string | null>(null);
const catalogLoaded = ref(false);
const selectedNodeIds = reactive(new Set<number>());

// --- 생성 상태 ---
const saving = ref(false);
const saveError = ref<string | null>(null);

const canSubmit = computed(() => form.name.trim().length > 0 && !saving.value);
const step1Valid = computed(() => form.name.trim().length > 0);

// 노드 서브트리 id 전부 수집(cascade down용).
function subtreeIds(n: CatalogNode, acc: number[] = []): number[] {
  acc.push(n.id);
  for (const c of n.children) subtreeIds(c, acc);
  return acc;
}

// 선택 집합 → 조상(cascade up) 포함 전개 id 집합.
//   진척 롤업이 PHASE→ACTIVITY 계층을 만들려면 tailoring에 조상 노드도 있어야 한다(0017 P3a).
function expandWithAncestors(selected: Set<number>, tree: CatalogNode[]): Set<number> {
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

// cascade 토글: 이 노드 + 하위 전체를 선택/해제.
function toggleNode(node: CatalogNode, checked: boolean) {
  const ids = subtreeIds(node);
  if (checked) ids.forEach((id) => selectedNodeIds.add(id));
  else ids.forEach((id) => selectedNodeIds.delete(id));
}
function clearSelection() {
  selectedNodeIds.clear();
}

const selectedCount = computed(() => selectedNodeIds.size);

// 카탈로그 1회 로드(공고와 무관한 마스터 데이터). 실패해도 프리필 생성은 가능.
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

function goNext() {
  if (step.value === 0 && !step1Valid.value) return;
  if (step.value < STEPS.length - 1) step.value += 1;
  if (step.value === 1) loadCatalog(); // 카탈로그 스텝 진입 시 로드
}
function goPrev() {
  if (step.value > 0) step.value -= 1;
}

const budgetText = (v: number | null): string => (v ? v.toLocaleString('ko-KR') + ' 원' : '—');
const dash = (v: string | null | undefined) => (v && String(v).trim() ? v : '—');

async function submit() {
  if (!canSubmit.value) return;
  saving.value = true;
  saveError.value = null;
  try {
    // 화이트리스트(camelCase)만 전송. 빈 값은 생략(백엔드 기본값 유지).
    const input: ProjectCreateInput = { name: form.name.trim() };
    if (form.customerName.trim()) input.customerName = form.customerName.trim();
    // 배치16: 공고의 수요기관코드를 함께 전송 → 백엔드가 회사 매칭, 없으면 CLIENT 자동생성·연결.
    //   코드 없으면(구 공고 등) 생략 → 백엔드가 customerName 이름 폴백으로 처리.
    const agencyCode = (props.notice.demandAgencyCode || '').trim();
    if (agencyCode) input.clientAgencyCode = agencyCode;
    if (form.contractAmount != null && !Number.isNaN(form.contractAmount)) {
      input.contractAmount = Number(form.contractAmount);
    }
    if (form.announcementNo.trim()) input.announcementNo = form.announcementNo.trim();
    if (form.proposalDeadline.trim()) input.proposalDeadline = form.proposalDeadline.trim();
    if (form.pmName.trim()) input.pmName = form.pmName.trim();

    // 0017 §C 테일러링: 선택 노드 → 조상 포함(cascade up) tailoring 엔트리(isSelected:true).
    //   선택이 없으면 tailoring 생략 → 백엔드 기본 생성(회귀 없음).
    if (selectedNodeIds.size > 0) {
      const expanded = expandWithAncestors(selectedNodeIds, catalogTree.value);
      const tailoring: TailoringEntry[] = [...expanded].map((catalogNodeId) => ({
        catalogNodeId,
        isSelected: true,
      }));
      input.tailoring = tailoring;
    }

    const project = await dataClient.projects.create(input);
    emit('created', project);
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : String(e);
  } finally {
    saving.value = false;
  }
}

// Esc로 닫기(작업 중 실수 방지: 저장 중엔 무시).
function onKey(ev: KeyboardEvent) {
  if (ev.key === 'Escape' && !saving.value) emit('close');
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="overlay" @click.self="!saving && emit('close')">
    <div class="modal" role="dialog" aria-modal="true" aria-label="입찰 프로젝트 등록">
      <header class="head">
        <h2 class="mtitle">입찰 프로젝트 등록</h2>
        <button class="x" type="button" aria-label="닫기" :disabled="saving" @click="emit('close')">✕</button>
      </header>

      <!-- 스텝 인디케이터 1-2-3 -->
      <ol class="steps" aria-label="진행 단계">
        <li
          v-for="(label, i) in STEPS"
          :key="label"
          class="step"
          :class="{ on: i === step, done: i < step }"
        >
          <span class="dot">{{ i < step ? '✓' : i + 1 }}</span>
          <span class="slabel">{{ label }}</span>
        </li>
      </ol>

      <div class="body">
        <!-- Step 1. 기본정보 -->
        <section v-show="step === 0" class="pane">
          <p class="lead">공고 정보를 프리필했습니다. 등록 전에 값을 조정할 수 있습니다.</p>
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
                <span class="flabel">공고번호</span>
                <input v-model="form.announcementNo" class="in mono" type="text" :disabled="saving" />
              </label>
              <label class="field">
                <span class="flabel">제안마감일</span>
                <input v-model="form.proposalDeadline" class="in" type="date" :disabled="saving" />
              </label>
              <label class="field">
                <span class="flabel">PM</span>
                <OrgPersonField v-model="form.pmName" placeholder="PM 이름" :disabled="saving" title="PM 선택" />
              </label>
            </div>
            <p class="hint">단계·상태(입찰)·발번(-B)은 등록 시 자동으로 지정됩니다.</p>
          </form>
        </section>

        <!-- Step 2. 카탈로그 선택 -->
        <section v-show="step === 1" class="pane">
          <p class="lead">
            검색·필터로 필요한 단계·활동·태스크·산출물을 찾고, 항목을 클릭해 내용(설명·구분·태그·템플릿)을
            확인한 뒤 선택하세요. 상위 항목을 체크하면 하위가 함께 선택됩니다. 선택하지 않으면 기본 생성됩니다.
          </p>
          <p v-if="catalogLoading" class="tl-state">카탈로그 불러오는 중…</p>
          <p v-else-if="catalogError" class="tl-state err">
            카탈로그를 불러오지 못했습니다. <span class="detail">({{ catalogError }})</span>
            테일러링 없이도 등록할 수 있습니다.
          </p>
          <p v-else-if="catalogLoaded && catalogTree.length === 0" class="tl-state">
            선택 가능한 카탈로그 항목이 없습니다 — 테일러링 없이 기본 생성됩니다.
          </p>
          <CatalogSelector
            v-else-if="catalogTree.length > 0"
            :tree="catalogTree"
            :selected="selectedNodeIds"
            :disabled="saving"
            @toggle="toggleNode"
            @clear="clearSelection"
          />
        </section>

        <!-- Step 3. 확인 & 생성 -->
        <section v-show="step === 2" class="pane">
          <p class="lead">아래 내용으로 신규 입찰 프로젝트(단계=입찰)를 생성합니다.</p>
          <dl class="summary">
            <div class="wide"><dt>사업명</dt><dd>{{ dash(form.name) }}</dd></div>
            <div><dt>고객사(기관)</dt><dd>{{ dash(form.customerName) }}</dd></div>
            <div><dt>계약금액</dt><dd>{{ budgetText(form.contractAmount) }}</dd></div>
            <div><dt>공고번호</dt><dd class="mono">{{ dash(form.announcementNo) }}</dd></div>
            <div><dt>제안마감일</dt><dd>{{ dash(form.proposalDeadline) }}</dd></div>
            <div class="wide">
              <dt>카탈로그 선택</dt>
              <dd>{{ selectedCount > 0 ? `${selectedCount}개 선택(조상 자동 포함)` : '선택 안 함 — 기본 생성' }}</dd>
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
          type="button"
          class="btn btn-primary"
          :disabled="(step === 0 && !step1Valid) || saving"
          @click="goNext"
        >다음</button>
        <button
          v-else
          type="button"
          class="btn btn-primary"
          :disabled="!canSubmit"
          @click="submit"
        >{{ saving ? '생성 중…' : '생성' }}</button>
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
</style>
