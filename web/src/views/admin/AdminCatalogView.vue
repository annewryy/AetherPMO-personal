<script setup lang="ts">
// 0009 모듈 2 — 카탈로그 관리 (/app/admin/catalog)
// P1-3 트리 재사용(관리자 모드: 전 유형 선택·비활성 노드 포함) + 노드 추가/수정/
// 비활성 토글/삭제. 쓰기는 백엔드 전용 — 409(참조·코드 중복)/400(계층 규칙) 메시지를
// 백엔드 응답 그대로 표시(dataClient.apiSend가 message 패스스루).
import { ref, computed, onMounted } from 'vue';
import { dataClient } from '../../lib/dataClient';
import DocTemplatePickerModal from '../../components/DocTemplatePickerModal.vue';
import type { CatalogNode, CatalogNodeType, CatalogNodeInput, Workflow, DocTemplate } from '../../types';
import CatalogNodeItem from '../../components/CatalogNodeItem.vue';
import StateNotice from '../../components/StateNotice.vue';

const apiMode = computed(() => !!window.API_BASE);

const roots = ref<CatalogNode[]>([]);
const workflows = ref<Workflow[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
const actionError = ref<string | null>(null);

const expanded = ref<Record<number, boolean>>({});
const selectedId = ref<number | null>(null);

const NODE_TYPES: CatalogNodeType[] = ['PHASE', 'ACTIVITY', 'TASK', 'DELIVERABLE'];
const TYPE_LABELS: Record<string, string> = {
  PHASE: '분류(PHASE)', ACTIVITY: '액티비티', TASK: '태스크', DELIVERABLE: '산출물',
};
// 계층 규칙(백엔드도 검증 — 폼에선 기본값 제안용): 부모 유형 → 자식 유형
const CHILD_TYPE: Record<string, CatalogNodeType> = {
  ROOT: 'PHASE', PHASE: 'ACTIVITY', ACTIVITY: 'TASK', TASK: 'DELIVERABLE',
};

// 0034 — 트리 헤더 추가 버튼을 컨텍스트형으로: 선택한 상위 항목의 하위 유형을 추가.
//   미선택(또는 산출물 선택)이면 분류(PHASE) 추가.
const addParent = computed(() =>
  mode.value === 'edit' && selectedNode.value && CHILD_TYPE[selectedNode.value.nodeType]
    ? selectedNode.value : null);
const addLabel = computed(() =>
  addParent.value
    ? `하위 ${TYPE_LABELS[CHILD_TYPE[addParent.value.nodeType]]} 추가 — ${addParent.value.name}`
    : '분류(PHASE) 추가');

// 평면화(부모 선택 드롭다운·선택 노드 탐색용)
interface FlatNode { node: CatalogNode; depth: number; }
const flat = computed<FlatNode[]>(() => {
  const out: FlatNode[] = [];
  const walk = (nodes: CatalogNode[], depth: number) => {
    for (const n of nodes) { out.push({ node: n, depth }); walk(n.children, depth + 1); }
  };
  walk(roots.value, 0);
  return out;
});
const byId = computed(() => new Map(flat.value.map((f) => [f.node.id, f.node])));
const selectedNode = computed(() => (selectedId.value != null ? byId.value.get(selectedId.value) ?? null : null));

function toggle(id: number) {
  expanded.value[id] = !expanded.value[id];
}

// ---- 폼(생성/수정 겸용) -------------------------------------------------------
const mode = ref<'idle' | 'edit' | 'create'>('idle');
const saving = ref(false);
const form = ref({
  parentId: null as number | null,
  nodeType: 'PHASE' as CatalogNodeType,
  code: '',
  name: '',
  isOptional: false,
  sortOrder: 0,
  workflowId: null as number | null,
  isActive: true,
  // 0029 — 테일러링 표준 필드
  methodology: null as string | null,
  requiredSmall: null as boolean | null,
  requiredMedium: null as boolean | null,
  requiredLarge: null as boolean | null,
  docFormat: '',
  fileNameBase: '',
  docTemplateId: null as number | null,
});

const docTemplates = ref<DocTemplate[]>([]);

const METHODOLOGIES = ['OPMS', 'ODS', 'OMS', 'BIS'] as const;

function selectNode(n: CatalogNode) {
  selectedId.value = n.id;
  actionError.value = null;
  mode.value = 'edit';
  form.value = {
    parentId: n.parentId,
    nodeType: n.nodeType,
    code: n.code ?? '',
    name: n.name,
    isOptional: n.isOptional,
    sortOrder: n.sortOrder,
    workflowId: n.workflowId,
    isActive: n.isActive,
    methodology: n.methodology ?? null,
    requiredSmall: n.requiredSmall,
    requiredMedium: n.requiredMedium,
    requiredLarge: n.requiredLarge,
    docFormat: n.docFormat ?? '',
    fileNameBase: n.fileNameBase ?? '',
    docTemplateId: n.docTemplateId,
  };
}

function openCreate(parent: CatalogNode | null) {
  actionError.value = null;
  mode.value = 'create';
  selectedId.value = parent?.id ?? null;
  form.value = {
    parentId: parent?.id ?? null,
    nodeType: CHILD_TYPE[parent?.nodeType ?? 'ROOT'] ?? 'PHASE',
    code: '',
    name: '',
    isOptional: false,
    sortOrder: (parent?.children.length ?? roots.value.length) + 1,
    workflowId: null,
    isActive: true,
    methodology: parent?.methodology ?? null,
    requiredSmall: null,
    requiredMedium: null,
    requiredLarge: null,
    docFormat: '',
    fileNameBase: '',
    docTemplateId: null,
  };
}

function onParentChange() {
  const parent = form.value.parentId != null ? byId.value.get(form.value.parentId) : null;
  form.value.nodeType = CHILD_TYPE[parent?.nodeType ?? 'ROOT'] ?? 'PHASE';
}

function toInput(): CatalogNodeInput {
  return {
    parentId: form.value.parentId,
    nodeType: form.value.nodeType,
    code: form.value.code.trim() || null,
    name: form.value.name.trim(),
    isOptional: form.value.isOptional,
    sortOrder: form.value.sortOrder,
    workflowId: form.value.workflowId,
    isActive: form.value.isActive,
    methodology: form.value.methodology,
    requiredSmall: form.value.requiredSmall,
    requiredMedium: form.value.requiredMedium,
    requiredLarge: form.value.requiredLarge,
    docFormat: form.value.docFormat.trim() || null,
    fileNameBase: form.value.fileNameBase.trim() || null,
    docTemplateId: form.value.docTemplateId,
  };
}

// 0029 §C — 파일명 패턴 설정(요구 0004 §4). 관리자에서 조회·수정.
const filenamePattern = ref('');
const codePattern = ref('');
const codePatternSaved = ref(false);
const codePatternSaving = ref(false);
async function loadCodePattern() {
  try {
    const r = await dataClient.adminSettings.get('project.code.pattern');
    codePattern.value = r.value ?? '';
  } catch (e) {
    console.error('[admin] 코드 패턴 로드 실패:', e);
  }
}
async function saveCodePattern() {
  codePatternSaving.value = true;
  codePatternSaved.value = false;
  try {
    const r = await dataClient.adminSettings.put('project.code.pattern', codePattern.value);
    codePattern.value = r.value ?? '';
    codePatternSaved.value = true;
    window.setTimeout(() => { codePatternSaved.value = false; }, 2500);
  } catch (e) {
    alert(e instanceof Error ? e.message : String(e));
  } finally {
    codePatternSaving.value = false;
  }
}
// 패턴 미리보기(연도·순번 예시)
const codePreview = computed(() => {
  const y = new Date().getFullYear();
  return (codePattern.value || 'PRJ-{연도}-{순번}')
    .replace('{연도2}', String(y % 100).padStart(2, '0'))
    .replace('{연도}', String(y))
    .replace('{순번}', '001');
});
const patternSaved = ref(false);
const patternSaving = ref(false);
async function loadPattern() {
  try {
    const s2 = await dataClient.adminSettings.get('deliverable.filename.pattern');
    filenamePattern.value = s2.value ?? '';
  } catch (e) {
    console.error('[admin] 파일명 패턴 로드 실패:', e);
  }
}
async function savePattern() {
  patternSaving.value = true;
  patternSaved.value = false;
  try {
    const s2 = await dataClient.adminSettings.put('deliverable.filename.pattern', filenamePattern.value);
    filenamePattern.value = s2.value ?? '';
    patternSaved.value = true;
    window.setTimeout(() => { patternSaved.value = false; }, 2500);
  } catch (e) {
    alert(e instanceof Error ? e.message : String(e));
  } finally {
    patternSaving.value = false;
  }
}

async function save() {
  if (!form.value.name.trim()) {
    actionError.value = '이름을 입력하세요.';
    return;
  }
  saving.value = true;
  actionError.value = null;
  try {
    if (mode.value === 'create') {
      const created = await dataClient.catalogAdmin.createNode(toInput());
      await reload();
      if (created?.id != null) selectedId.value = created.id;
      mode.value = 'idle';
    } else if (mode.value === 'edit' && selectedId.value != null) {
      await dataClient.catalogAdmin.updateNode(selectedId.value, toInput());
      await reload();
    }
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : String(e); // 409/400 메시지 그대로
  } finally {
    saving.value = false;
  }
}

async function toggleActive(n: CatalogNode) {
  actionError.value = null;
  try {
    await dataClient.catalogAdmin.updateNode(n.id, { isActive: !n.isActive });
    await reload();
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : String(e);
  }
}

async function removeNode(n: CatalogNode) {
  if (!window.confirm(`"${n.name}" 노드를 삭제할까요?\n(프로젝트 참조가 있으면 백엔드가 거부합니다 — 비활성을 권장)`)) return;
  actionError.value = null;
  try {
    await dataClient.catalogAdmin.removeNode(n.id);
    selectedId.value = null;
    mode.value = 'idle';
    await reload();
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : String(e); // 409 + 참조 수 안내 그대로
  }
}

async function reload() {
  roots.value = await dataClient.catalog.tree({ includeInactive: true });
}

onMounted(async () => {
  try {
    [roots.value, workflows.value] = await Promise.all([
      dataClient.catalog.tree({ includeInactive: true }),
      dataClient.workflows.list(),
    ]);
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
  if (apiMode.value) {
    void loadPattern();
    void loadCodePattern();
    dataClient.docTemplates.list().then((v) => { docTemplates.value = v; })
      .catch((e) => console.error('[admin] 양식 목록 로드 실패:', e));
  }
});

// ---- 0038 — 기본 양식 검색 모달(선택·미리보기·다운로드) ----
const showTplPicker = ref(false);
const tplLabel = computed(() => {
  if (form.value.docTemplateId == null) return null;
  const t = docTemplates.value.find((x) => x.id === form.value.docTemplateId);
  return t ? `T-${t.id} · ${t.name}` : `T-${form.value.docTemplateId}`;
});
function onTplSelect(t: { id: number }) {
  form.value.docTemplateId = t.id;
  showTplPicker.value = false;
}
</script>

<template>
  <div>
    <h2 class="module-title">테일러링 관리</h2>
    <p class="sub">
      방법론 테일러링 표준(pms_catalog_node) 편집 — 비활성 노드는 신규 테일러링·조회 화면에서 제외되고,
      기존 프로젝트의 전개분은 유지됩니다(소프트 비활성).
    </p>

    <div v-if="!apiMode" class="gate-notice">
      노드 추가·수정·비활성·삭제는 백엔드(API_BASE) 연결 후 가능합니다 — 현재는 트리 조회만.
    </div>
    <div v-if="actionError" class="error-notice">{{ actionError }}</div>

    <!-- 0029 §C — 표준 파일명 패턴(코드 체계 커스터마이징, 요구 0004 §4) -->
    <div v-if="apiMode" class="pattern-box">
      <label class="pattern-label">표준 파일명 패턴
        <span class="pattern-hint">토큰: {프로젝트코드} {단계} {활동} {작업} {산출물} {산출물명} {버전} {확장자}</span>
      </label>
      <div class="pattern-row">
        <input v-model="filenamePattern" class="input pattern-input" type="text" :disabled="patternSaving" />
        <button class="btn btn-sm" :disabled="patternSaving || !filenamePattern.trim()" @click="savePattern">
          {{ patternSaving ? '저장 중…' : '패턴 저장' }}
        </button>
        <span v-if="patternSaved" class="pattern-ok">저장됨</span>
      </div>
      <label class="pattern-label">프로젝트 코드 패턴
        <span class="pattern-hint">토큰: {연도} {연도2} {순번}(필수) — 예: OKC{연도2}-{순번} → 미리보기 <code>{{ codePreview }}</code>{{ '' }} (입찰은 -B 자동 부착)</span>
      </label>
      <div class="pattern-row">
        <input v-model="codePattern" class="input pattern-input" type="text" :disabled="codePatternSaving" />
        <button class="btn btn-sm" :disabled="codePatternSaving || !codePattern.trim()" @click="saveCodePattern">
          {{ codePatternSaving ? '저장 중…' : '패턴 저장' }}
        </button>
        <span v-if="codePatternSaved" class="pattern-ok">저장됨</span>
      </div>
    </div>

    <StateNotice
      :loading="loading" :error="loadError"
      :empty="!loading && !loadError && roots.length === 0"
      empty-text="테일러링 데이터가 없습니다 — 데이터 소스 연결 후 표시됩니다."
    />

    <div v-if="!loading && roots.length > 0" class="layout">
      <section class="tree-panel">
        <div class="tree-head">
          <span class="tree-title">전체 트리 (비활성 포함)</span>
          <button class="btn btn-sm btn-primary" :disabled="!apiMode" :title="addLabel" @click="openCreate(addParent)">
            + {{ addLabel }}
          </button>
        </div>
        <ul class="tree">
          <CatalogNodeItem
            v-for="n in roots" :key="n.id"
            :node="n" :expanded="expanded" :toggle="toggle"
            :selected-id="selectedId" :highlight-id="null" any-selectable
            @select="selectNode"
          />
        </ul>
      </section>

      <section class="edit-panel">
        <!-- 선택 노드 요약 + 동작 -->
        <template v-if="mode === 'idle'">
          <div class="empty">
            트리에서 노드를 선택하면 수정 폼이 열립니다.<br />
            트리 상단 추가 버튼이 선택한 항목에 따라 바뀝니다 — 분류→하위 활동, 활동→태스크, 태스크→산출물. 분류를 추가하려면 폼을 닫아 선택을 해제하세요.
          </div>
        </template>

        <template v-else>
          <h3 class="form-title">
            {{ mode === 'create' ? '노드 추가' : `노드 수정 — ${selectedNode?.name ?? ''}` }}
          </h3>
          <div class="form-grid">
            <label class="field wide">
              <span class="label">부모 노드</span>
              <select v-model="form.parentId" class="select" :disabled="mode === 'edit'" @change="onParentChange">
                <option :value="null">(루트 — 분류 레벨)</option>
                <option v-for="f in flat" :key="f.node.id" :value="f.node.id">
                  {{ ' '.repeat(f.depth * 2) }}{{ f.node.name }} [{{ f.node.nodeType }}]
                </option>
              </select>
            </label>
            <label class="field">
              <span class="label">유형 (계층 규칙은 백엔드 검증)</span>
              <select v-model="form.nodeType" class="select">
                <option v-for="t in NODE_TYPES" :key="t" :value="t">{{ TYPE_LABELS[t] }}</option>
              </select>
            </label>
            <label class="field">
              <span class="label">코드 (중복 시 저장 거부)</span>
              <input v-model="form.code" type="text" class="input" placeholder="예: OP-1-30" />
            </label>
            <label class="field wide">
              <span class="label">이름</span>
              <input v-model="form.name" type="text" class="input" />
            </label>
            <label class="field">
              <span class="label">정렬 순서</span>
              <input v-model.number="form.sortOrder" type="number" class="input num" />
            </label>
            <label class="field">
              <span class="label">필수 여부</span>
              <select v-model="form.isOptional" class="select">
                <option :value="false">필수</option>
                <option :value="true">선택</option>
              </select>
            </label>
            <label class="field wide">
              <span class="label">워크플로 연결</span>
              <select v-model="form.workflowId" class="select">
                <option :value="null">(연결 안 함)</option>
                <option v-for="w in workflows" :key="w.id" :value="w.id">{{ w.name }}</option>
              </select>
            </label>
            <label class="field">
              <span class="label">활성</span>
              <input v-model="form.isActive" type="checkbox" class="check" />
            </label>
            <label class="field">
              <span class="label">방법론</span>
              <select v-model="form.methodology" class="select">
                <option :value="null">커스텀(없음)</option>
                <option v-for="m in METHODOLOGIES" :key="m" :value="m">{{ m }}</option>
              </select>
            </label>
            <template v-if="form.nodeType === 'DELIVERABLE'">
              <label class="field">
                <span class="label">규모별 필수</span>
                <span class="req-checks">
                  <label class="chk"><input type="checkbox" :checked="form.requiredSmall === true" @change="form.requiredSmall = ($event.target as HTMLInputElement).checked" /> 소</label>
                  <label class="chk"><input type="checkbox" :checked="form.requiredMedium === true" @change="form.requiredMedium = ($event.target as HTMLInputElement).checked" /> 중</label>
                  <label class="chk"><input type="checkbox" :checked="form.requiredLarge === true" @change="form.requiredLarge = ($event.target as HTMLInputElement).checked" /> 대</label>
                </span>
              </label>
              <label class="field">
                <span class="label">문서형식</span>
                <input v-model="form.docFormat" type="text" class="input" placeholder=".hwpx" />
              </label>
              <!-- 0038 — 기본 양식: 검색 모달(미리보기·파일 다운로드)로 선택 -->
              <div class="field wide">
                <span class="label">기본 양식 <span class="hint">— 검색해서 선택, 파일은 미리보기·다운로드로 확인</span></span>
                <div class="tpl-row">
                  <span v-if="tplLabel" class="tpl-chip">{{ tplLabel }}</span>
                  <span v-else class="tpl-none">선택 안 함</span>
                  <button class="btn btn-sm" type="button" @click="showTplPicker = true">양식 검색</button>
                  <button v-if="form.docTemplateId != null" class="btn btn-sm" type="button" @click="form.docTemplateId = null">해제</button>
                </div>
              </div>
              <label class="field wide">
                <span class="label">표준 파일명(베이스)</span>
                <input v-model="form.fileNameBase" type="text" class="input" placeholder="예: 프로세스 테일러링 가이드" />
              </label>
            </template>
          </div>
          <div class="form-actions">
            <button class="btn btn-primary" :disabled="!apiMode || saving" @click="save">
              {{ saving ? '저장 중…' : '저장' }}
            </button>
            <button class="btn" @click="mode = 'idle'">닫기</button>
          </div>
        </template>

        <template v-if="mode === 'edit' && selectedNode">
          <div class="node-ops">
            <button class="btn btn-sm" :disabled="!apiMode" @click="toggleActive(selectedNode)">
              {{ selectedNode.isActive ? '비활성화' : '활성화' }}
            </button>
            <button class="btn btn-sm btn-danger" :disabled="!apiMode" @click="removeNode(selectedNode)">
              삭제 (참조 0건일 때만)
            </button>
          </div>
        </template>
      </section>
    </div>
  </div>

  <DocTemplatePickerModal
    v-if="showTplPicker"
    :selected-id="form.docTemplateId"
    @select="onTplSelect"
    @close="showTplPicker = false"
  />
</template>

<style scoped>
.module-title { font-size: 17px; margin: 0 0 4px; }
.sub { color: var(--muted); font-size: 13px; margin: 0 0 14px; }
.gate-notice {
  padding: 9px 14px; margin-bottom: 12px; border-radius: 8px;
  background: var(--panel); border: 1px dashed var(--border);
  color: var(--muted); font-size: 13px;
}
.error-notice {
  padding: 9px 14px; margin-bottom: 12px; border-radius: 8px;
  background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.4);
  color: var(--red); font-size: 13px; white-space: pre-line;
}

.layout { display: flex; gap: 14px; align-items: flex-start; }
.tree-panel {
  flex: 1.1; min-width: 0;
  background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 12px;
}
.tree-head { display: flex; align-items: center; justify-content: space-between; padding: 2px 8px 10px; border-bottom: 1px solid var(--border); margin-bottom: 8px; }
.tree-title { font-size: 13px; color: var(--muted); font-weight: 600; }
.tree { margin: 0; padding: 0; }

.edit-panel {
  flex: 1; min-width: 0;
  background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 16px;
}
.empty { color: var(--muted); font-size: 14px; text-align: center; padding: 40px 12px; line-height: 1.7; }
.form-title { font-size: 15px; margin: 0 0 12px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; }
.field { display: flex; flex-direction: column; gap: 5px; }
.field.wide { grid-column: 1 / -1; }
.label { font-size: 12px; color: var(--muted); }
.select, .input {
  background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); font-size: 14px; padding: 7px 10px; outline: none;
}
.select:focus, .input:focus { border-color: var(--accent); }
.input.num { width: 90px; }
.check { width: 16px; height: 16px; accent-color: var(--accent); }
.form-actions { display: flex; gap: 8px; margin-top: 14px; }
.node-ops { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border); }
.pattern-box {
  background: var(--panel); border: 1px solid var(--border); border-radius: 10px;
  padding: 12px 16px; margin-bottom: 14px; display: flex; flex-direction: column; gap: 8px;
}
.pattern-label { font-size: 13px; font-weight: 600; }
.pattern-hint { font-weight: 400; color: var(--muted); font-size: 12px; margin-left: 8px; }
.pattern-row { display: flex; gap: 8px; align-items: center; }
.pattern-input { flex: 1; font-family: ui-monospace, monospace; }
.pattern-ok { color: var(--green); font-size: 12.5px; }
.req-checks { display: flex; gap: 10px; }
.req-checks .chk { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; }
.hint { font-weight: 400; color: var(--muted); font-size: 11px; }
.title-add { margin-left: 10px; vertical-align: middle; }
.tree-actions { display: inline-flex; gap: 6px; align-items: center; }

/* 0038 — 폼 정렬 보정(라벨 1줄 고정) + 기본 양식 선택 UI */
.field > .label { min-height: 18px; display: flex; align-items: baseline; gap: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.field .check { align-self: flex-start; margin-top: 6px; }
.req-checks { display: flex; gap: 12px; align-items: center; min-height: 34px; }
.tpl-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-height: 34px; }
.tpl-chip {
  font-size: 12.5px; padding: 4px 10px; border-radius: 999px;
  border: 1px solid var(--accent); color: var(--accent); font-weight: 600;
}
.tpl-none { font-size: 13px; color: var(--muted); }
</style>
