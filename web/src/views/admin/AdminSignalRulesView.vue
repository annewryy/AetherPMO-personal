<script setup lang="ts">
// 0009 모듈 1 / 0007 §2.5 — 신호 규칙 룰 빌더 (/app/admin/signal-rules)
// 사용자 등록형: 목록(전역/프로젝트 필터, 활성 토글) + 미니 룰 빌더 폼(사람 문장 미리보기).
// 첫 실제 쓰기 화면 — 쓰기는 API_BASE 필수, 폴백에선 목록 읽기 + 안내만.
import { ref, computed, watch, onMounted } from 'vue';
import { dataClient } from '../../lib/dataClient';
import type { Project, SignalRule, SignalRuleInput } from '../../types';
import StateNotice from '../../components/StateNotice.vue';
import PageSizeSelect from '../../components/PageSizeSelect.vue';
import Pager from '../../components/Pager.vue';
import { DEFAULT_PAGE_SIZE, usePagination } from '../../lib/pagination';

const apiMode = computed(() => !!window.API_BASE);

const rules = ref<SignalRule[]>([]);
const projects = ref<Project[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
const actionError = ref<string | null>(null);

const scopeFilter = ref<'ALL' | 'GLOBAL' | number>('ALL');

// ---- 어휘(코드값은 영문 유지, 라벨은 한글 — 0007 metric vocabulary v1) ----------
const METRICS = [
  { code: 'PROGRESS_DELAY_PCT', label: '지연율 (기대−실제 %p)', unit: '%p' },
  { code: 'STALLED_DAYS', label: '산출물 정체 (일)', unit: '일' },
  { code: 'DUE_IN_DAYS', label: '마감 임박 (일)', unit: '일' },
] as const;
const OPERATORS = [
  { code: 'GT', label: '초과 (>)' },
  { code: 'GTE', label: '이상 (≥)' },
  { code: 'LT', label: '미만 (<)' },
  { code: 'LTE', label: '이하 (≤)' },
] as const;
const ACTIONS = [
  { code: 'SHOW', label: '대시보드 표시만' },
  { code: 'CREATE_RISK', label: '리스크 자동 등록' },
] as const;

const metricLabel = (code: string) => METRICS.find((m) => m.code === code)?.label ?? code;
const operatorWord = (code: string) =>
  ({ GT: '초과', GTE: '이상', LT: '미만', LTE: '이하' } as Record<string, string>)[code] ?? code;
const actionLabel = (code: string) => ACTIONS.find((a) => a.code === code)?.label ?? code;

const projectName = (id: number | null) =>
  id == null ? '전역' : projects.value.find((p) => p.id === id)?.name ?? `#${id}`;

const filtered = computed(() =>
  rules.value.filter((r) => {
    if (scopeFilter.value === 'ALL') return true;
    if (scopeFilter.value === 'GLOBAL') return r.projectId == null;
    return r.projectId === scopeFilter.value;
  }),
);

// 배치8 — 공통 클라이언트 페이징. 범위 필터 변경 시 1페이지 리셋.
const pageSize = ref<number>(DEFAULT_PAGE_SIZE);
const { page, total, totalPages, paged, goPage, resetPage, setPageSize, rowNo } =
  usePagination(filtered, pageSize);
watch(scopeFilter, () => resetPage());

// ---- 사람 문장(조건·미리보기 공용 — 0007 §2.5) --------------------------------
function humanSentence(metric: string, operator: string, threshold: number | null, action: string, projectId: number | null): string {
  const t = threshold ?? 0;
  const op = operatorWord(operator);
  const act = action === 'CREATE_RISK' ? '리스크로 자동 등록' : '대시보드에 표시';
  const scope = projectId == null ? '모든 프로젝트에서' : `'${projectName(projectId)}'에서`;
  switch (metric) {
    case 'PROGRESS_DELAY_PCT':
      return `${scope} 기대 진척률보다 ${t}%p ${op} 지연되면 ${act}`;
    case 'STALLED_DAYS':
      return `${scope} 산출물 상태가 ${t}일 ${op} 정체되면 ${act}`;
    case 'DUE_IN_DAYS':
      return `${scope} 마감까지 ${t}일 ${op} 남으면 ${act}`;
    default:
      return `${scope} ${metric} ${operator} ${t} → ${act}`;
  }
}

function conditionText(r: SignalRule): string {
  const unit = METRICS.find((m) => m.code === r.metric)?.unit ?? '';
  return `${r.threshold ?? '—'}${unit} ${operatorWord(r.operator)}`;
}

// ---- 폼 (생성/수정 겸용) ------------------------------------------------------
const formOpen = ref(false);
const editingId = ref<number | null>(null);
const saving = ref(false);

const form = ref({
  scope: 'GLOBAL' as 'GLOBAL' | 'PROJECT',
  projectId: null as number | null,
  name: '',
  metric: 'PROGRESS_DELAY_PCT' as string,
  operator: 'GTE' as string,
  threshold: 10 as number | null,
  action: 'SHOW' as string,
  enabled: true,
});

const preview = computed(() =>
  humanSentence(
    form.value.metric, form.value.operator, form.value.threshold, form.value.action,
    form.value.scope === 'GLOBAL' ? null : form.value.projectId,
  ),
);

function openCreate() {
  editingId.value = null;
  form.value = {
    scope: 'GLOBAL', projectId: null, name: '',
    metric: 'PROGRESS_DELAY_PCT', operator: 'GTE', threshold: 10, action: 'SHOW', enabled: true,
  };
  actionError.value = null;
  formOpen.value = true;
}

function openEdit(r: SignalRule) {
  editingId.value = r.ruleId;
  form.value = {
    scope: r.projectId == null ? 'GLOBAL' : 'PROJECT',
    projectId: r.projectId,
    name: r.name,
    metric: r.metric,
    operator: r.operator,
    threshold: r.threshold,
    action: r.action,
    enabled: r.enabled,
  };
  actionError.value = null;
  formOpen.value = true;
}

function toInput(): SignalRuleInput {
  return {
    projectId: form.value.scope === 'GLOBAL' ? null : form.value.projectId,
    name: form.value.name.trim() || preview.value,
    metric: form.value.metric,
    operator: form.value.operator,
    threshold: form.value.threshold,
    params: {},
    action: form.value.action,
    enabled: form.value.enabled,
  };
}

async function save() {
  if (form.value.scope === 'PROJECT' && form.value.projectId == null) {
    actionError.value = '프로젝트 전용 규칙은 프로젝트를 선택해야 합니다.';
    return;
  }
  saving.value = true;
  actionError.value = null;
  try {
    if (editingId.value == null) await dataClient.signalRules.create(toInput());
    else await dataClient.signalRules.update(editingId.value, toInput());
    formOpen.value = false;
    await reload();
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : String(e);
  } finally {
    saving.value = false;
  }
}

async function toggleEnabled(r: SignalRule) {
  actionError.value = null;
  try {
    await dataClient.signalRules.update(r.ruleId, { enabled: !r.enabled });
    r.enabled = !r.enabled;
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : String(e);
  }
}

async function removeRule(r: SignalRule) {
  if (!window.confirm(`규칙 "${r.name}"을(를) 삭제할까요?`)) return;
  actionError.value = null;
  try {
    await dataClient.signalRules.remove(r.ruleId);
    await reload();
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : String(e);
  }
}

async function reload() {
  rules.value = await dataClient.signalRules.list();
}

onMounted(async () => {
  try {
    [rules.value, projects.value] = await Promise.all([
      dataClient.signalRules.list(),
      dataClient.projects.list(),
    ]);
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div>
    <h2 class="module-title">신호 규칙</h2>
    <p class="sub">기준은 시스템이 프리셋하지 않습니다 — 사용자가 규칙을 등록합니다 (0007).</p>

    <div v-if="!apiMode" class="gate-notice">
      규칙 등록·수정·삭제는 백엔드(API_BASE) 연결 후 가능합니다 — 현재는 목록 조회만.
    </div>
    <div v-if="actionError" class="error-notice">{{ actionError }}</div>

    <div class="toolbar">
      <select v-model="scopeFilter" class="select">
        <option value="ALL">전체 범위</option>
        <option value="GLOBAL">전역 규칙</option>
        <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
      <button class="btn btn-primary" :disabled="!apiMode" :title="apiMode ? '' : '백엔드 연결 후 사용 가능'" @click="openCreate">
        + 규칙 등록
      </button>
    </div>

    <!-- 미니 룰 빌더 폼 -->
    <section v-if="formOpen" class="card form">
      <h3 class="form-title">{{ editingId == null ? '규칙 등록' : '규칙 수정' }}</h3>
      <div class="form-grid">
        <label class="field">
          <span class="label">적용 범위</span>
          <div class="scope-row">
            <select v-model="form.scope" class="select">
              <option value="GLOBAL">전역 (모든 프로젝트)</option>
              <option value="PROJECT">프로젝트 전용</option>
            </select>
            <select v-if="form.scope === 'PROJECT'" v-model="form.projectId" class="select">
              <option :value="null" disabled>프로젝트 선택</option>
              <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </div>
          <span v-if="form.scope === 'PROJECT'" class="hint">프로젝트 전용 규칙은 같은 지표의 전역 규칙을 대체합니다.</span>
        </label>
        <label class="field">
          <span class="label">지표</span>
          <select v-model="form.metric" class="select">
            <option v-for="m in METRICS" :key="m.code" :value="m.code">{{ m.label }}</option>
          </select>
        </label>
        <label class="field">
          <span class="label">조건</span>
          <div class="scope-row">
            <input v-model.number="form.threshold" type="number" class="input num" />
            <select v-model="form.operator" class="select">
              <option v-for="o in OPERATORS" :key="o.code" :value="o.code">{{ o.label }}</option>
            </select>
          </div>
        </label>
        <label class="field">
          <span class="label">액션</span>
          <select v-model="form.action" class="select">
            <option v-for="a in ACTIONS" :key="a.code" :value="a.code">{{ a.label }}</option>
          </select>
        </label>
        <label class="field wide">
          <span class="label">규칙 이름 (비우면 미리보기 문장 사용)</span>
          <input v-model="form.name" type="text" class="input" placeholder="예: 지연 10%p 자동 리스크" />
        </label>
        <label class="field">
          <span class="label">활성</span>
          <input v-model="form.enabled" type="checkbox" class="check" />
        </label>
      </div>
      <div class="preview">
        <span class="preview-label">미리보기</span>
        {{ preview }}
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" :disabled="saving" @click="save">{{ saving ? '저장 중…' : '저장' }}</button>
        <button class="btn" @click="formOpen = false">취소</button>
      </div>
    </section>

    <StateNotice
      :loading="loading" :error="loadError"
      :empty="!loading && !loadError && rules.length === 0"
      empty-text="등록된 규칙이 없습니다 — 백엔드 연결 후 '+ 규칙 등록'으로 첫 규칙을 만들 수 있습니다 (시드 예시는 enabled=false로 제공)."
    />
    <div v-if="!loading && rules.length > 0 && filtered.length === 0" class="gate-notice">
      필터 조건에 맞는 규칙이 없습니다.
    </div>

    <div v-if="!loading && filtered.length > 0" class="list-head">
      <span class="count">총 <strong>{{ total.toLocaleString('ko-KR') }}</strong>건</span>
      <PageSizeSelect :model-value="pageSize" @update:model-value="setPageSize" />
    </div>

    <table v-if="!loading && filtered.length > 0" class="grid">
      <thead>
        <tr><th class="no">No.</th><th>이름</th><th>적용 범위</th><th>지표</th><th>조건</th><th>액션</th><th>활성</th><th>동작</th></tr>
      </thead>
      <tbody>
        <tr v-for="(r, idx) in paged" :key="r.ruleId" :class="{ off: !r.enabled }">
          <td class="no">{{ rowNo(idx) }}</td>
          <td class="name" :title="humanSentence(r.metric, r.operator, r.threshold, r.action, r.projectId)">{{ r.name }}</td>
          <td>
            <span class="scope-badge" :class="{ global: r.projectId == null }">{{ projectName(r.projectId) }}</span>
          </td>
          <td>{{ metricLabel(r.metric) }}</td>
          <td class="mono">{{ conditionText(r) }}</td>
          <td>{{ actionLabel(r.action) }}</td>
          <td>
            <button
              class="toggle" :class="{ on: r.enabled }" :disabled="!apiMode"
              :title="apiMode ? '클릭하여 전환' : '백엔드 연결 후 사용 가능'"
              @click="toggleEnabled(r)"
            ><span class="knob" /></button>
          </td>
          <td class="cell-actions">
            <button class="btn btn-sm" :disabled="!apiMode" @click="openEdit(r)">수정</button>
            <button class="btn btn-sm btn-danger" :disabled="!apiMode" @click="removeRule(r)">삭제</button>
          </td>
        </tr>
      </tbody>
    </table>

    <Pager
      v-if="!loading && filtered.length > 0"
      :page="page" :total-pages="totalPages" :total="total"
      @update:page="goPage"
    />
  </div>
</template>

<style scoped>
.module-title { font-size: 16px; margin: 0 0 4px; }
.sub { color: var(--muted); font-size: 12px; margin: 0 0 14px; }

.gate-notice {
  padding: 9px 14px; margin-bottom: 12px; border-radius: 8px;
  background: var(--panel); border: 1px dashed var(--border);
  color: var(--muted); font-size: 12px;
}
.error-notice {
  padding: 9px 14px; margin-bottom: 12px; border-radius: 8px;
  background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.4);
  color: var(--red); font-size: 12px;
}

.toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.toolbar .btn { margin-left: auto; }
.select, .input {
  background: var(--panel); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); font-size: 13px; padding: 7px 10px; outline: none;
}
.select:focus, .input:focus { border-color: var(--accent); }
.input.num { width: 90px; }
.check { width: 16px; height: 16px; accent-color: var(--accent); }

.card {
  background: var(--panel); border: 1px solid var(--border); border-radius: 10px;
  padding: 16px; margin-bottom: 14px;
}
.form-title { font-size: 14px; margin: 0 0 12px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 20px; }
.field { display: flex; flex-direction: column; gap: 5px; }
.field.wide { grid-column: 1 / -1; }
.label { font-size: 11px; color: var(--muted); }
.scope-row { display: flex; gap: 8px; flex-wrap: wrap; }
.hint { font-size: 11px; color: var(--muted); }

.preview {
  margin-top: 14px; padding: 10px 14px; border-radius: 8px;
  background: rgba(139, 92, 246, 0.08); border: 1px solid rgba(139, 92, 246, 0.35);
  font-size: 13px;
}
.preview-label {
  font-size: 10px; font-weight: 700; color: var(--accent);
  margin-right: 8px; letter-spacing: 0.05em;
}
.form-actions { display: flex; gap: 8px; margin-top: 14px; }

.list-head { display: flex; align-items: center; justify-content: space-between; margin: 0 0 10px; }
.count { font-size: 13px; color: var(--muted); }
.count strong { color: var(--text); }
.grid { border-collapse: collapse; width: 100%; font-size: 13px; }
.grid th, .grid td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--border); }
.grid th { color: var(--muted); font-weight: 600; font-size: 12px; }
.grid .no { width: 48px; text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }
.grid tr.off td { opacity: 0.55; }
.name { font-weight: 600; }
.mono { font-family: ui-monospace, monospace; font-size: 12px; }
.scope-badge {
  font-size: 11px; padding: 1px 8px; border-radius: 999px;
  background: var(--panel-2); color: var(--text);
}
.scope-badge.global { color: var(--accent); background: rgba(139, 92, 246, 0.12); }
.cell-actions { display: flex; gap: 6px; }

.toggle {
  width: 34px; height: 18px; border-radius: 999px; border: 1px solid var(--border);
  background: var(--panel-2); cursor: pointer; position: relative; padding: 0;
}
.toggle .knob {
  position: absolute; top: 1px; left: 1px; width: 14px; height: 14px;
  border-radius: 50%; background: var(--muted); transition: left 0.15s, background 0.15s;
}
.toggle.on { background: rgba(139, 92, 246, 0.3); border-color: var(--accent); }
.toggle.on .knob { left: 17px; background: var(--accent); }
.toggle:disabled { cursor: not-allowed; opacity: 0.6; }
</style>
