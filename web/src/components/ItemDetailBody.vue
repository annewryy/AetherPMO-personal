<script setup lang="ts">
// 배치23 B안 — 공용 아이템 상세 본문(드로어·상세 페이지 공용).
// DetailPanel(우측 드로어)에서 알맹이를 추출한 것 — 중복 구현 금지, 두 곳이 이 본문을 재사용한다.
//  - 헤더: kind 칩 + displayCode + 제목 + 현재 상태 뱃지
//  - 필드: 도메인별 세트, 인라인 PATCH(쓰기 게이트)
//  - 상태 변경: 통일 드롭다운(StatusMenu). 이슈/액션/태스크=사다리 PATCH / 산출물=워크플로 엔진. + 워크플로 보기
//  - 첨부: 아마란스 위임 stub / 하단: 코멘트 스레드
// 쓰기는 전부 백엔드(API_BASE) 전용. 폴백에선 편집 컨트롤 비활성 + 안내. 오류는 서버 {message} 그대로.
// 드로어의 닫기(✕) 버튼·aside 래퍼는 이 본문에 없다(호출측 chrome). 필드/상태 변경 후 'changed' emit.
import { ref, computed, watch } from 'vue';
import { dataClient } from '../lib/dataClient';
import { fullDisplayCode } from '../lib/displayCode';
import type {
  Issue, ActionItem, Artifact, Task, CommentEntityType, TransitionEntity,
  AvailableTransition,
} from '../types';
import StatusBadge from './StatusBadge.vue';
import CommentThread from './CommentThread.vue';
import CommentModal from './CommentModal.vue';
import ProjectMemberPickerModal from './ProjectMemberPickerModal.vue';
import StatusMenu, { type MenuTarget } from './StatusMenu.vue';
import WorkflowViewModal, { type WfState, type WfEdge } from './WorkflowViewModal.vue';

// 도메인별 대상(하나만 채워짐). kind로 분기.
export type DetailKind = 'issue' | 'action' | 'artifact' | 'task';

const props = defineProps<{
  kind: DetailKind;
  issue?: Issue | null;
  action?: ActionItem | null;
  artifact?: Artifact | null;
  task?: Task | null;
  projectId: number;
  projectCode?: string | null;       // 전역 문맥(프로젝트 밖)에서 코드 조합 렌더
  highlightCommentId?: number | null; // 알림 클릭 시 코멘트 강조
}>();

const emit = defineEmits<{
  (e: 'changed'): void;              // 필드/상태 변경 후 부모 재조회 신호
}>();

const apiMode = computed(() => !!window.API_BASE);

const COMMENT_TYPE: Record<DetailKind, CommentEntityType> = {
  issue: 'ISSUE', action: 'ACTION_ITEM', artifact: 'DELIVERABLE', task: 'TASK',
};
const KIND_LABEL: Record<DetailKind, string> = {
  issue: '이슈/리스크', action: '액션아이템', artifact: '산출물', task: '태스크',
};

// 현재 대상 id·제목·상태·표시코드 (kind로 안전 접근)
const entityId = computed(() => {
  switch (props.kind) {
    case 'issue': return props.issue?.id ?? null;
    case 'action': return props.action?.id ?? null;
    case 'artifact': return props.artifact?.id ?? null;
    case 'task': return props.task?.id ?? null;
  }
});
const heading = computed(() => {
  switch (props.kind) {
    case 'issue': return props.issue?.title ?? '';
    case 'action': return props.action?.title ?? '';
    case 'artifact': return props.artifact?.name ?? '';
    case 'task': return props.task?.name ?? '';
  }
});
const status = computed(() => {
  switch (props.kind) {
    case 'issue': return props.issue?.status ?? '';
    case 'action': return props.action?.status ?? '';
    case 'artifact': return props.artifact?.status ?? '';
    case 'task': return props.task?.status ?? '';
  }
});
const displayCode = computed(() => {
  const dc = props.kind === 'issue' ? props.issue?.displayCode
    : props.kind === 'action' ? props.action?.displayCode
    : props.kind === 'artifact' ? props.artifact?.displayCode
    : props.task?.displayCode;
  return fullDisplayCode(props.projectCode, dc);
});

// 산출물만 워크플로 엔진 전이 사용(seed 워크플로 '산출물 승인'). 태스크는 엔진 워크플로가 없어
//   고정 상태셋(TODO~DONE, PATCH 허용)을 사다리로 처리 → 이슈/액션과 동일 경로.
const transitionEntity = computed<TransitionEntity | null>(() =>
  props.kind === 'artifact' ? 'deliverables' : null,
);

// 상태 사다리(엔진 미사용 도메인) — 현재 상태에서 이동 가능한 상태.
const ISSUE_LADDER: Record<string, string[]> = {
  '발생': ['조치중'],
  '조치중': ['완료'],
  '완료': ['조치중'],   // 재오픈
};
const ACTION_LADDER: Record<string, string[]> = {
  '대기': ['진행'],
  '진행': ['완료'],
  '완료': ['진행'],     // 재오픈
};
// 태스크 상태 흐름(코드). 백엔드 PATCH가 5종 허용 → 합리적 흐름으로 노출.
const TASK_LADDER: Record<string, string[]> = {
  'TODO': ['IN_PROGRESS'],
  'IN_PROGRESS': ['REVIEW', 'DONE'],
  'REVIEW': ['DONE', 'REJECTED', 'IN_PROGRESS'],
  'REJECTED': ['IN_PROGRESS'],
  'DONE': ['IN_PROGRESS'],  // 재오픈
};
// kind별 사다리(산출물은 null → 엔진).
function ladderFor(): Record<string, string[]> | null {
  if (props.kind === 'issue') return ISSUE_LADDER;
  if (props.kind === 'action') return ACTION_LADDER;
  if (props.kind === 'task') return TASK_LADDER;
  return null;
}

// ---- 필드 인라인 PATCH -------------------------------------------------------
const savingField = ref<string | null>(null);
const fieldError = ref<string | null>(null);

async function patch(patchBody: Record<string, unknown>, fieldKey: string) {
  const id = entityId.value;
  if (id == null) return;
  savingField.value = fieldKey;
  fieldError.value = null;
  try {
    if (props.kind === 'issue') await dataClient.issues.update(id, patchBody);
    else if (props.kind === 'action') await dataClient.actionItems.update(id, patchBody);
    else if (props.kind === 'task') await dataClient.tasks.update(id, patchBody);
    // 산출물은 상태 외 필드 인라인 편집 대상 없음(현 계약) — 상태는 전이로 처리
    emit('changed');
  } catch (e) {
    fieldError.value = e instanceof Error ? e.message : String(e);
  } finally {
    savingField.value = null;
  }
}

// ---- 담당자 인라인 편집(조직도 선택) ------------------------------------------
//   이슈=owner_name · 액션=assignee_name · 태스크=assignee_name · 산출물=author_name.
//   아마란스 인력은 계정(uuid) 없음 → 이름으로 저장.
const showAssigneePicker = ref(false);
const currentAssignee = computed(() => {
  switch (props.kind) {
    case 'issue': return props.issue?.owner ?? '';
    case 'action': return props.action?.assignee ?? '';
    case 'task': return props.task?.assignee ?? '';
    case 'artifact': return props.artifact?.author ?? '';
  }
  return '';
});
async function saveAssignee(name: string | null) {
  const id = entityId.value;
  if (id == null) return;
  savingField.value = 'assignee';
  fieldError.value = null;
  try {
    const v = name && name.trim() ? name.trim() : null;
    if (props.kind === 'issue') await dataClient.issues.update(id, { owner_name: v });
    else if (props.kind === 'action') await dataClient.actionItems.update(id, { assignee_name: v });
    else if (props.kind === 'task') await dataClient.tasks.update(id, { assignee_name: v });
    else if (props.kind === 'artifact') await dataClient.artifacts.update(id, { authorName: v });
    emit('changed');
  } catch (e) {
    fieldError.value = e instanceof Error ? e.message : String(e);
  } finally {
    savingField.value = null;
  }
}
// 0038 — 프로젝트 내 담당 지정은 참여인력 중에서 선택
function onAssigneePick(name: string) {
  showAssigneePicker.value = false;
  void saveAssignee(name || null);
}

// due_date (이슈=목표해결일 / 액션=마감일)
function onDueDate(ev: Event) {
  const v = (ev.target as HTMLInputElement).value || null;
  patch({ due_date: v }, 'due');
}
// 이슈 우선순위 — 백엔드 화이트리스트(상/중/하, work-surface.ts ISSUE_PRIORITIES)
function onPriority(ev: Event) {
  const v = (ev.target as HTMLSelectElement).value;
  if (props.kind === 'issue' && v === props.issue?.priority) return;
  patch({ priority: v || null }, 'priority');
}

// 상세내용(이슈=검토 코멘트 / 액션=확인 코멘트) — 읽기 전용.
//  백엔드 PATCH 화이트리스트(work-surface.ts)에 review_comment/confirm_comment가 없어
//  수정 경로가 없다(불변 계약: 계약에 없는 필드를 보내지 않는다). 표시만 한다.
const detailText = computed(() =>
  props.kind === 'issue' ? (props.issue?.reviewComment ?? '')
    : props.kind === 'action' ? (props.action?.confirmComment ?? '') : '',
);
const detailLabel = computed(() =>
  props.kind === 'issue' ? '검토 코멘트' : '확인 코멘트',
);
const dueLabel = computed(() => (props.kind === 'issue' ? '목표해결일' : '마감일'));

// 이슈 우선순위 옵션(계약값) + 현재 저장값이 목록 밖이면 그대로 노출(예: 과도기 데이터 '높음')
const priorityOptions = computed<string[]>(() => {
  const base = [...PRIORITIES];
  const cur = props.issue?.priority;
  if (cur && !base.includes(cur)) base.push(cur);
  return base;
});

// ---- 이슈/액션 상태 사다리 전이(사유 코멘트 선택) -----------------------------
const statusModal = ref<{ to: string } | null>(null);
const statusSaving = ref(false);
const statusModalError = ref<string | null>(null);

function askStatus(to: string) {
  statusModalError.value = null;
  statusModal.value = { to };
}
async function submitStatus(comment: string) {
  const id = entityId.value;
  if (!statusModal.value || id == null) return;
  const to = statusModal.value.to;
  statusSaving.value = true;
  statusModalError.value = null;
  const body: Record<string, unknown> = { status: to };
  if (comment) body.comment = comment;
  try {
    if (props.kind === 'issue') await dataClient.issues.update(id, body);
    else if (props.kind === 'action') await dataClient.actionItems.update(id, body);
    else if (props.kind === 'task') await dataClient.tasks.update(id, body);
    statusModal.value = null;
    emit('changed');
  } catch (e) {
    statusModalError.value = e instanceof Error ? e.message : String(e);
  } finally {
    statusSaving.value = false;
  }
}

// ---- 통일 상태 전이(드롭다운) -------------------------------------------------
// 산출물만 워크플로 엔진 가용 전이를 로드. 이슈/액션/태스크는 사다리(ladderFor).
const engineTransitions = ref<AvailableTransition[]>([]);
async function loadEngine() {
  if (!apiMode.value || !transitionEntity.value || entityId.value == null) { engineTransitions.value = []; return; }
  try {
    engineTransitions.value = await dataClient.transitions.list(transitionEntity.value, entityId.value);
  } catch { engineTransitions.value = []; }
}
watch([transitionEntity, entityId], loadEngine, { immediate: true });

const statusTargets = computed<MenuTarget[]>(() => {
  const ladder = ladderFor();
  if (ladder) {
    return (ladder[status.value] ?? []).map((to) => ({
      toStatus: to,
      name: props.kind === 'task' ? (TASK_STATUS_LABELS[to] ?? to) : undefined,
      allowed: true,
    }));
  }
  // 산출물 — 워크플로 엔진 가용 전이(비활성 포함, 사유 표기).
  return engineTransitions.value.map((t) => ({
    toStatus: t.toStatus,
    name: t.name,
    allowed: t.allowed,
    commentRequired: t.commentRequired,
    reason: t.failedConditions.map((f) => f.errorMessage).filter(Boolean).join(' · '),
    transitionId: t.transitionId,
  }));
});

// 엔진 전이 실행(태스크/산출물) — 코멘트 모달 경유.
const engineActive = ref<MenuTarget | null>(null);
const engineSaving = ref(false);
const engineError = ref<string | null>(null);
async function submitEngine(comment: string) {
  const id = entityId.value;
  if (!engineActive.value || id == null || !transitionEntity.value || engineActive.value.transitionId == null) return;
  engineSaving.value = true;
  engineError.value = null;
  try {
    await dataClient.transitions.execute(transitionEntity.value, id, engineActive.value.transitionId, comment);
    engineActive.value = null;
    await loadEngine();
    emit('changed');
  } catch (e) {
    engineError.value = e instanceof Error ? e.message : String(e);
  } finally {
    engineSaving.value = false;
  }
}

// 드롭다운에서 상태 선택 → 사다리(이슈/액션/태스크)는 PATCH, 산출물은 엔진 전이.
function onStatusSelect(t: MenuTarget) {
  if (props.kind === 'artifact') { engineActive.value = t; engineError.value = null; }
  else askStatus(t.toStatus);
}

// ---- 워크플로 보기 ------------------------------------------------------------
const showWorkflow = ref(false);
const wfData = ref<{ title: string; description: string | null; states: WfState[]; edges: WfEdge[] } | null>(null);
async function openWorkflow() {
  showWorkflow.value = true;
  const cur = status.value;
  const ladder = ladderFor();
  if (ladder) {
    const isTask = props.kind === 'task';
    const label = (n: string) => (isTask ? (TASK_STATUS_LABELS[n] ?? n) : n);
    const all = new Set<string>(Object.keys(ladder));
    Object.values(ladder).forEach((arr) => arr.forEach((s) => all.add(s)));
    const list = [...all];
    wfData.value = {
      title: KIND_LABEL[props.kind] + ' 상태 흐름',
      description: isTask
        ? '태스크 상태 흐름입니다(TODO → 진행중 → 검토중 → 완료, 재오픈 가능).'
        : '고정 상태 흐름입니다(발생/대기 → 진행 → 완료, 완료에서 재오픈).',
      states: list.map((n) => ({ name: label(n), isCurrent: n === cur })),
      edges: list.flatMap((from) => (ladder[from] ?? []).map((to) => ({
        from: label(from), to: label(to), fromCurrent: from === cur,
      }))),
    };
    return;
  }
  // 태스크/산출물 — 기본 워크플로 정의.
  try {
    const wfs = await dataClient.workflows.list();
    const wf = wfs.find((w) => w.isDefault) ?? wfs[0];
    if (!wf) { wfData.value = { title: '워크플로', description: '정의 없음', states: [], edges: [] }; return; }
    const byId = new Map(wf.statuses.map((s) => [s.id, s]));
    const matches = (s: { code: string | null; name: string }) => s.code === cur || s.name === cur;
    wfData.value = {
      title: wf.name,
      description: wf.description,
      states: wf.statuses.map((s) => ({
        name: s.name, category: s.category, isCurrent: matches(s), isInitial: s.isInitial, isFinal: s.isFinal,
      })),
      edges: wf.transitions.map((t) => {
        const from = byId.get(t.fromStatusId);
        const to = byId.get(t.toStatusId);
        return { from: from?.name ?? '?', to: to?.name ?? '?', name: t.name, fromCurrent: !!from && matches(from) };
      }),
    };
  } catch {
    wfData.value = { title: '워크플로', description: '불러오지 못했습니다.', states: [], edges: [] };
  }
}

// 리스크→이슈 전환(이슈 도메인 한정)
const isRisk = computed(() => props.kind === 'issue' && (props.issue?.type || '').includes('리스크'));
const convertOpen = ref(false);
const converting = ref(false);
const convertError = ref<string | null>(null);
async function submitConvert(comment: string) {
  const id = props.issue?.id;
  if (id == null) return;
  converting.value = true;
  convertError.value = null;
  try {
    await dataClient.issues.convertToIssue(id, comment || undefined);
    convertOpen.value = false;
    emit('changed');
  } catch (e) {
    convertError.value = e instanceof Error ? e.message : String(e);
  } finally {
    converting.value = false;
  }
}

function fmtDate(v: string | null | undefined): string {
  return v ? String(v).split('T')[0] : '—';
}
function dateValue(v: string | null | undefined): string {
  return v ? String(v).split('T')[0] : '';
}

const PRIORITIES = ['상', '중', '하'];
const TASK_STATUS_LABELS: Record<string, string> = {
  TODO: '대기', IN_PROGRESS: '진행중', REVIEW: '검토중', REJECTED: '반려', DONE: '완료',
};

// ---- 0038 — 태스크 실사용 산출물 후보(이 태스크 소속 산출물) ----
const taskDeliverables = ref<Artifact[]>([]);
watch(
  () => [props.kind, props.task?.id, props.projectId] as const,
  async ([kind, taskId, projectId]) => {
    if (kind !== 'task' || taskId == null || !projectId || !apiMode.value) { taskDeliverables.value = []; return; }
    try {
      const all = await dataClient.artifacts.listByProject(projectId);
      taskDeliverables.value = all.filter((a) => a.taskId === taskId);
    } catch { taskDeliverables.value = []; }
  },
  { immediate: true },
);

// ---- 0038 — 산출물 파일 액션(템플릿/수정본) ----
const fileInput = ref<HTMLInputElement | null>(null);
const fileBusy = ref(false);
const fileMsg = ref('');
const fileErr = ref('');
async function fileAction(fn: () => Promise<void>, okMsg?: string) {
  fileBusy.value = true;
  fileMsg.value = '';
  fileErr.value = '';
  try {
    await fn();
    if (okMsg) fileMsg.value = okMsg;
  } catch (e) {
    fileErr.value = e instanceof Error ? e.message : String(e);
  } finally {
    fileBusy.value = false;
  }
}
function downloadTemplate() {
  const id = props.artifact?.id;
  if (id == null) return;
  void fileAction(() => dataClient.files.download(`/api/deliverables/${id}/template-file`));
}
function downloadCurrent() {
  const id = props.artifact?.id;
  if (id == null) return;
  void fileAction(() => dataClient.files.download(`/api/deliverables/${id}/file`));
}
function onFilePicked(e: Event) {
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0];
  const id = props.artifact?.id;
  input.value = '';
  if (!f || id == null) return;
  void fileAction(async () => {
    const r = (await dataClient.files.upload(`/api/deliverables/${id}/file`, f)) as { versionNo?: number };
    fileMsg.value = `업로드 완료 (v${r.versionNo ?? '?'})`;
  });
}
</script>

<template>
  <div class="item-body">
    <div class="ib-head">
      <span class="kind-chip" :class="'k-' + kind">{{ KIND_LABEL[kind] }}</span>
      <span v-if="displayCode" class="dcode">{{ displayCode }}</span>
    </div>

    <h2 class="ib-title">{{ heading }}</h2>
    <div class="ib-status-row">
      <StatusBadge v-if="kind === 'artifact'" :status="status" />
      <span v-else class="plain-status">{{ status || '—' }}</span>
    </div>

    <!-- 필드 (도메인별) -->
    <dl class="fields">
      <template v-if="kind === 'issue'">
        <div><dt>유형</dt><dd>{{ issue?.type || '—' }}</dd></div>
        <div><dt>담당자</dt>
          <dd class="assignee-dd">
            <span>{{ currentAssignee || '—' }}</span>
            <button v-if="apiMode" class="mini-btn" type="button" :disabled="savingField === 'assignee'" @click="showAssigneePicker = true">참여인력</button>
          </dd>
        </div>
        <div><dt>발생일</dt><dd>{{ fmtDate(issue?.reportedDate) }}</dd></div>
        <div>
          <dt>{{ dueLabel }}</dt>
          <dd>
            <input v-if="apiMode" class="f-input" type="date" :value="dateValue(issue?.dueDate)"
              :disabled="savingField === 'due'" @change="onDueDate" />
            <template v-else>{{ fmtDate(issue?.dueDate) }}</template>
          </dd>
        </div>
        <div>
          <dt>우선순위</dt>
          <dd>
            <select v-if="apiMode" class="f-input" :value="issue?.priority || ''"
              :disabled="savingField === 'priority'" @change="onPriority">
              <option value="">—</option>
              <option v-for="p in priorityOptions" :key="p" :value="p">{{ p }}</option>
            </select>
            <template v-else>{{ issue?.priority || '—' }}</template>
          </dd>
        </div>
      </template>

      <template v-else-if="kind === 'action'">
        <div><dt>담당자</dt>
          <dd class="assignee-dd">
            <span>{{ currentAssignee || '—' }}</span>
            <button v-if="apiMode" class="mini-btn" type="button" :disabled="savingField === 'assignee'" @click="showAssigneePicker = true">참여인력</button>
          </dd>
        </div>
        <div>
          <dt>{{ dueLabel }}</dt>
          <dd>
            <input v-if="apiMode" class="f-input" type="date" :value="dateValue(action?.dueDate)"
              :disabled="savingField === 'due'" @change="onDueDate" />
            <template v-else>{{ fmtDate(action?.dueDate) }}</template>
          </dd>
        </div>
      </template>

      <template v-else-if="kind === 'artifact'">
        <div><dt>분류</dt><dd>{{ artifact?.category || '—' }}</dd></div>
        <div><dt>버전</dt><dd>{{ artifact?.version || '—' }}</dd></div>
        <div><dt>담당자</dt>
          <dd class="assignee-dd">
            <span>{{ currentAssignee || '—' }}</span>
            <button v-if="apiMode" class="mini-btn" type="button" :disabled="savingField === 'assignee'" @click="showAssigneePicker = true">참여인력</button>
          </dd>
        </div>
        <div><dt>마감일</dt><dd>{{ fmtDate(artifact?.dueDate) }}</dd></div>
        <div><dt>제출일</dt><dd>{{ artifact?.submitDate || '—' }}</dd></div>
        <!-- 0038 — 산출물 파일: 템플릿 기반 착수(다운로드) → 수정본 업로드(버전 증가) → 최신본 다운로드 -->
        <div class="wide"><dt>파일</dt>
          <dd class="file-actions">
            <button class="mini-btn" type="button" :disabled="fileBusy" @click="downloadTemplate">템플릿 다운로드</button>
            <button class="mini-btn" type="button" :disabled="fileBusy" @click="fileInput?.click()">수정본 업로드</button>
            <button class="mini-btn" type="button" :disabled="fileBusy" @click="downloadCurrent">최신 파일</button>
            <input ref="fileInput" type="file" class="file-hidden" @change="onFilePicked" />
            <span v-if="fileMsg" class="file-ok">{{ fileMsg }}</span>
            <span v-if="fileErr" class="file-err">{{ fileErr }}</span>
          </dd>
        </div>
      </template>

      <template v-else-if="kind === 'task'">
        <div><dt>상태</dt><dd>{{ TASK_STATUS_LABELS[status] ?? status }}</dd></div>
        <div><dt>진척률</dt><dd>{{ task?.progress ?? 0 }}%</dd></div>
        <!-- 0038 — 실사용 산출물: 이 태스크의 후보(pms_deliverable.task_id) 중 택1 → pms_task.deliverable_id -->
        <div class="wide"><dt>사용 산출물</dt>
          <dd>
            <select
              class="select-in" :value="task?.deliverableId ?? ''"
              :disabled="!apiMode || savingField === 'deliverable' || taskDeliverables.length === 0"
              @change="patch({ deliverable_id: ($event.target as HTMLSelectElement).value ? Number(($event.target as HTMLSelectElement).value) : null }, 'deliverable')"
            >
              <option value="">(선택 안 함)</option>
              <option v-for="d in taskDeliverables" :key="d.id" :value="d.id">{{ d.name }}</option>
            </select>
            <span v-if="taskDeliverables.length === 0" class="hint-inline">이 태스크에 산출물 후보가 없습니다</span>
          </dd>
        </div>
        <div><dt>담당자</dt>
          <dd class="assignee-dd">
            <span>{{ currentAssignee || '—' }}</span>
            <button v-if="apiMode" class="mini-btn" type="button" :disabled="savingField === 'assignee'" @click="showAssigneePicker = true">참여인력</button>
          </dd>
        </div>
        <!-- 0031: 태스크 일정 지정 — 계획/실적 시작·종료(백엔드 PATCH 화이트리스트 확장) -->
        <div class="wide"><dt>계획 기간</dt>
          <dd class="date-range">
            <input type="date" class="date-in" :value="task?.plannedStartDate ?? ''"
                   :disabled="!apiMode || savingField === 'planned'"
                   @change="patch({ planned_start_date: ($event.target as HTMLInputElement).value || null }, 'planned')" />
            <span class="tilde">~</span>
            <input type="date" class="date-in" :value="task?.plannedEndDate ?? ''"
                   :disabled="!apiMode || savingField === 'planned'"
                   @change="patch({ planned_end_date: ($event.target as HTMLInputElement).value || null }, 'planned')" />
          </dd>
        </div>
        <div class="wide"><dt>실적 기간</dt>
          <dd class="date-range">
            <input type="date" class="date-in" :value="task?.actualStartDate ?? ''"
                   :disabled="!apiMode || savingField === 'actual'"
                   @change="patch({ actual_start_date: ($event.target as HTMLInputElement).value || null }, 'actual')" />
            <span class="tilde">~</span>
            <input type="date" class="date-in" :value="task?.actualEndDate ?? ''"
                   :disabled="!apiMode || savingField === 'actual'"
                   @change="patch({ actual_end_date: ($event.target as HTMLInputElement).value || null }, 'actual')" />
          </dd>
        </div>
      </template>
    </dl>

    <!-- 상세내용(이슈=검토/액션=확인 코멘트) — 읽기 전용(백엔드 수정 계약 없음) -->
    <div v-if="kind === 'issue' || kind === 'action'" class="detail-field">
      <label class="f-label">{{ detailLabel }}</label>
      <div class="ro-text">{{ detailText || '—' }}</div>
    </div>

    <p v-if="fieldError" class="err">{{ fieldError }}</p>

    <!-- 상태 변경 — 통일 드롭다운(현재 상태 → 전환 가능 상태 + 워크플로 보기) -->
    <section class="section">
      <h3 class="section-title">상태 변경</h3>
      <StatusMenu
        :current-status="status"
        :targets="statusTargets"
        :disabled="!apiMode"
        gate-message="상태 변경은 백엔드(API_BASE) 연결 후 활성화"
        @select="onStatusSelect"
        @view-workflow="openWorkflow"
      />
      <div v-if="apiMode && isRisk" class="convert-row">
        <button class="btn btn-sm" title="리스크를 이슈로 전환 (0008 수동 전환)"
          @click="convertOpen = true">이슈로 전환</button>
      </div>
      <p v-if="engineError" class="err">{{ engineError }}</p>
    </section>

    <!-- 첨부파일: 구 아마란스(원챔버) stub 제거(2026-07-09 자체완결 전환).
         산출물 파일은 위 '파일' 행(0038 FilePort)로 대체 — 그 외 엔티티 첨부는 후속(0018). -->

    <!-- 코멘트 스레드 -->
    <section class="section">
      <h3 class="section-title">코멘트</h3>
      <CommentThread
        v-if="entityId != null"
        :entity-type="COMMENT_TYPE[kind]" :entity-id="entityId"
        :project-id="projectId" :highlight-comment-id="highlightCommentId"
      />
    </section>

    <!-- 상태 변경 사유 코멘트(이슈/액션 사다리) -->
    <CommentModal
      v-if="statusModal"
      :title="`상태 변경 → ${statusModal.to}`"
      :message="`${status} → ${statusModal.to} (사유 코멘트는 선택)`"
      :required="false" submit-label="상태 변경"
      :submitting="statusSaving" :error="statusModalError"
      @submit="submitStatus" @close="statusModal = null"
    />
    <!-- 리스크→이슈 전환 확인 -->
    <CommentModal
      v-if="convertOpen"
      :title="`이슈로 전환: ${issue?.title}`"
      message="이 리스크를 이슈로 전환합니다(0008 수동 전환)."
      :required="false" submit-label="이슈로 전환"
      :submitting="converting" :error="convertError"
      @submit="submitConvert" @close="convertOpen = false"
    />

    <!-- 담당자 조직도 선택 -->
    <ProjectMemberPickerModal
      v-if="showAssigneePicker"
      :project-id="projectId" :current="currentAssignee || null"
      @select="onAssigneePick"
      @clear="onAssigneePick('')"
      @close="showAssigneePicker = false"
    />

    <!-- 태스크/산출물 워크플로 전이 실행(사유 코멘트) -->
    <CommentModal
      v-if="engineActive"
      :title="`전이: ${engineActive.name || engineActive.toStatus}`"
      :message="`${status} → ${engineActive.toStatus} 전이를 실행합니다.`"
      :required="!!engineActive.commentRequired"
      submit-label="전이 실행"
      :submitting="engineSaving" :error="engineError"
      @submit="submitEngine" @close="engineActive = null"
    />

    <!-- 워크플로 보기 -->
    <WorkflowViewModal
      v-if="showWorkflow && wfData"
      :title="wfData.title" :description="wfData.description"
      :states="wfData.states" :edges="wfData.edges"
      @close="showWorkflow = false"
    />
  </div>
</template>

<style scoped>
.item-body { display: flex; flex-direction: column; gap: 12px; }
.assignee-dd { display: flex; align-items: center; gap: 8px; }
.mini-btn {
  border: 1px solid var(--accent); background: transparent; color: var(--accent);
  font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 6px; cursor: pointer;
}
.mini-btn:hover:not(:disabled) { background: rgba(99, 102, 241, 0.12); }
.mini-btn:disabled { opacity: 0.5; cursor: default; }
.ib-head { display: flex; align-items: center; gap: 8px; }
.kind-chip {
  font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px;
  background: var(--panel-2); color: var(--muted);
}
.k-issue { color: var(--red); background: rgba(239, 68, 68, 0.12); }
.k-action { color: var(--blue); background: rgba(59, 130, 246, 0.12); }
.k-artifact { color: var(--yellow); background: rgba(251, 191, 36, 0.12); }
.k-task { color: var(--green); background: rgba(52, 211, 153, 0.12); }
.dcode { font-family: ui-monospace, monospace; font-size: 12px; color: var(--muted); }
.ib-title { font-size: 18px; margin: 0; word-break: break-word; }
.ib-status-row { display: flex; align-items: center; gap: 8px; }
.plain-status {
  font-size: 13px; font-weight: 600; padding: 2px 10px; border-radius: 999px;
  background: var(--panel-2); color: var(--muted);
}

.fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 18px; margin: 0; }
.fields > div { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.fields .wide { grid-column: 1 / -1; }
.fields dt { font-size: 12px; color: var(--muted); }
.fields dd { margin: 0; font-size: 14px; }

.detail-field { display: flex; flex-direction: column; gap: 4px; }
.f-label { font-size: 12px; color: var(--muted); }
.f-input {
  background: var(--panel-2); border: 1px solid var(--border); border-radius: 6px;
  color: var(--text); font-size: 14px; padding: 5px 8px; font-family: inherit; outline: none;
  max-width: 100%; box-sizing: border-box;
}
.f-input:focus { border-color: var(--accent); }
.ro-text { font-size: 14px; color: var(--text); white-space: pre-wrap; }

.section {
  display: flex; flex-direction: column; gap: 8px;
  border-top: 1px solid var(--border); padding-top: 12px;
}
.section-title { font-size: 14px; margin: 0; color: var(--text); }
.ladder { display: flex; flex-wrap: wrap; gap: 6px; }
.convert-row { margin-top: 4px; }
.gate, .dim { font-size: 13px; color: var(--muted); }
.attach-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.pending { font-size: 13px; color: var(--muted); font-style: italic; }
.err { color: var(--red); font-size: 13px; margin: 0; }
.date-range { display: flex; align-items: center; gap: 6px; }
.date-in {
  background: var(--bg); border: 1px solid var(--border); border-radius: 6px;
  color: var(--text); font-size: 12.5px; padding: 4px 8px; outline: none; font-family: inherit;
}
.date-in:focus { border-color: var(--accent); }
.tilde { color: var(--muted); }

/* 0038 — 산출물 파일 액션 */
.file-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.file-hidden { display: none; }
.file-ok { font-size: 12px; color: var(--green); }
.file-err { font-size: 12px; color: var(--red); }

.select-in {
  background: var(--panel-2, var(--panel)); border: 1px solid var(--border); border-radius: 6px;
  color: var(--text); font-size: 13px; padding: 5px 8px; font-family: inherit; max-width: 100%;
}
.hint-inline { font-size: 12px; color: var(--muted); margin-left: 6px; }
</style>
