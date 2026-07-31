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
import { useRouter } from 'vue-router';
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
import CollapsibleSection from './CollapsibleSection.vue';
import MultiSelectChecklist from './MultiSelectChecklist.vue';

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

// ---- 0039 — 필드 편집을 "수정→검토→저장" 초안(draft) 방식으로 전환 -----------
//   이전엔 값을 바꾸는 즉시 PATCH됐다(입력 실수·의도치 않은 저장 위험). 이제는 로컬 draft에만
//   반영하고, 변경분이 있을 때만 하단 저장 바가 나타나 한 번에 저장한다. 상태변경·전이·코멘트·
//   파일 액션은 그 자체가 독립된 확정 동작이라 기존대로 즉시 실행한다.
const savingField = ref<string | null>(null);
const fieldError = ref<string | null>(null);
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

interface Draft {
  assigneeName: string;
  dueDate: string;
  priority: string;
  progressRate: number;
  deliverableId: number | null;
  plannedStartDate: string;
  plannedEndDate: string;
  actualStartDate: string;
  actualEndDate: string;
  plannedEffort: number | null;   // 0044 §D — M/M(공수)
  weight: number;                 // 0044 §D — 진척 가중치(기본 1)
  taskIds: number[];
  deliverableIds: number[];
  issueIds: number[];
  meetingIds: number[];
  actionItemIds: number[];
}

function buildDraft(): Draft {
  return {
    assigneeName: currentAssignee.value,
    dueDate: dateValue(props.kind === 'issue' ? props.issue?.dueDate : props.kind === 'action' ? props.action?.dueDate : null),
    priority: props.issue?.priority ?? '',
    progressRate: props.task?.progress ?? 0,
    deliverableId: props.task?.deliverableId ?? null,
    plannedStartDate: props.task?.plannedStartDate ?? '',
    plannedEndDate: props.task?.plannedEndDate ?? '',
    actualStartDate: props.task?.actualStartDate ?? '',
    actualEndDate: props.task?.actualEndDate ?? '',
    plannedEffort: props.task?.plannedEffort ?? null,
    weight: props.task?.weight ?? 1,
    taskIds: [...(props.issue?.taskIds ?? props.action?.taskIds ?? [])],
    deliverableIds: [...(props.issue?.deliverableIds ?? props.action?.deliverableIds ?? [])],
    issueIds: [...(props.action?.issueIds ?? [])],
    meetingIds: [...(props.issue?.meetingIds ?? props.action?.meetingIds ?? [])],
    actionItemIds: [...(props.issue?.actionItemIds ?? [])],
  };
}

const baseline = ref<Draft>(buildDraft());
const draft = ref<Draft>(buildDraft());
watch(entityId, () => { baseline.value = buildDraft(); draft.value = buildDraft(); });

const isDirty = computed(() => JSON.stringify(draft.value) !== JSON.stringify(baseline.value));

function discardDraft() {
  draft.value = { ...baseline.value,
    taskIds: [...baseline.value.taskIds], deliverableIds: [...baseline.value.deliverableIds],
    issueIds: [...baseline.value.issueIds], meetingIds: [...baseline.value.meetingIds],
    actionItemIds: [...baseline.value.actionItemIds] };
  fieldError.value = null;
}

async function saveDraft() {
  const id = entityId.value;
  if (id == null || !isDirty.value) return;
  savingField.value = 'draft';
  fieldError.value = null;
  const d = draft.value, b = baseline.value;
  const body: Record<string, unknown> = {};
  const assigneeCol = props.kind === 'issue' ? 'owner_name' : 'assignee_name';
  if (d.assigneeName !== b.assigneeName && props.kind !== 'artifact') body[assigneeCol] = d.assigneeName || null;
  if (d.dueDate !== b.dueDate && (props.kind === 'issue' || props.kind === 'action')) body.due_date = d.dueDate || null;
  if (d.priority !== b.priority && props.kind === 'issue') body.priority = d.priority || null;
  if (props.kind === 'task') {
    if (d.progressRate !== b.progressRate) body.progress_rate = d.progressRate;
    if (d.deliverableId !== b.deliverableId) body.deliverable_id = d.deliverableId;
    if (d.plannedStartDate !== b.plannedStartDate) body.planned_start_date = d.plannedStartDate || null;
    if (d.plannedEndDate !== b.plannedEndDate) body.planned_end_date = d.plannedEndDate || null;
    if (d.actualStartDate !== b.actualStartDate) body.actual_start_date = d.actualStartDate || null;
    if (d.actualEndDate !== b.actualEndDate) body.actual_end_date = d.actualEndDate || null;
    if (d.plannedEffort !== b.plannedEffort) body.planned_effort = d.plannedEffort;   // 0044 §D M/M
    if (d.weight !== b.weight) body.weight = d.weight;                                // 0044 §D 가중치
  }
  if (props.kind === 'issue' || props.kind === 'action') {
    if (JSON.stringify(d.taskIds) !== JSON.stringify(b.taskIds)) body.task_ids = d.taskIds;
    if (JSON.stringify(d.deliverableIds) !== JSON.stringify(b.deliverableIds)) body.deliverable_ids = d.deliverableIds;
    if (JSON.stringify(d.meetingIds) !== JSON.stringify(b.meetingIds)) body.meeting_ids = d.meetingIds;
    if (props.kind === 'issue' && JSON.stringify(d.actionItemIds) !== JSON.stringify(b.actionItemIds)) {
      body.action_ids = d.actionItemIds;
    }
    if (props.kind === 'action' && JSON.stringify(d.issueIds) !== JSON.stringify(b.issueIds)) {
      body.issue_ids = d.issueIds;
    }
  }
  if (Object.keys(body).length === 0) { savingField.value = null; return; }
  try {
    if (props.kind === 'artifact') await dataClient.artifacts.update(id, { authorName: d.assigneeName || null });
    else if (props.kind === 'issue') await dataClient.issues.update(id, body);
    else if (props.kind === 'action') await dataClient.actionItems.update(id, body);
    else if (props.kind === 'task') await dataClient.tasks.update(id, body);
    baseline.value = { ...d, taskIds: [...d.taskIds], deliverableIds: [...d.deliverableIds],
      issueIds: [...d.issueIds], meetingIds: [...d.meetingIds], actionItemIds: [...d.actionItemIds] };
    emit('changed');
  } catch (e) {
    fieldError.value = e instanceof Error ? e.message : String(e);
  } finally {
    savingField.value = null;
  }
}

// 0038 — 프로젝트 내 담당 지정은 참여인력 중에서 선택(draft에만 반영 — 저장은 별도 버튼)
function onAssigneePick(name: string) {
  showAssigneePicker.value = false;
  draft.value.assigneeName = name || '';
}

// ---- 0039 — 관련항목 후보(이슈/액션 kind만 편집 가능) --------------------------
const relTasks = ref<Task[]>([]);
const relDeliverables = ref<Artifact[]>([]);
const relIssues = ref<Issue[]>([]);
const relMeetings = ref<import('../types').MeetingMinute[]>([]);
const relActionItems = ref<ActionItem[]>([]);
const relTaskOptions = computed(() => relTasks.value.map((t) => ({ id: t.id, label: t.name })));
const relDeliverableOptions = computed(() => relDeliverables.value.map((d) => ({ id: d.id, label: d.name })));
const relIssueOptions = computed(() => relIssues.value.map((i) => ({ id: i.id, label: i.title, sub: i.type })));
const relMeetingOptions = computed(() => relMeetings.value.map((m) => ({ id: m.id, label: m.title, sub: String(m.meetDate).split('T')[0] })));
const relActionOptions = computed(() => relActionItems.value.map((a) => ({ id: a.id, label: a.title })));

async function loadRelatedCandidates() {
  if (!apiMode.value || (props.kind !== 'issue' && props.kind !== 'action')) return;
  const pid = props.projectId;
  const [tasks, deliverables, issues, meetings, actions] = await Promise.all([
    dataClient.tasks.listByProject(pid).catch(() => []),
    dataClient.artifacts.listByProject(pid).catch(() => []),
    dataClient.issues.listByProject(pid).catch(() => []),
    dataClient.meetingMinutes.listByProject(pid).catch(() => []),
    dataClient.actionItems.listByProject(pid).catch(() => []),
  ]);
  relTasks.value = tasks; relDeliverables.value = deliverables; relIssues.value = issues;
  relMeetings.value = meetings; relActionItems.value = actions;
}
watch(() => [props.kind, props.projectId] as const, loadRelatedCandidates, { immediate: true });

// 태스크/산출물 상세의 관련항목은 읽기 전용(역방향 — 이 항목을 참조하는 이슈/액션/회의록 이름 표시용).
const relIssuesById = computed(() => new Map(relIssues.value.map((i) => [i.id, i])));
const relActionsById = computed(() => new Map(relActionItems.value.map((a) => [a.id, a])));
const relMeetingsById = computed(() => new Map(relMeetings.value.map((m) => [m.id, m])));
async function loadReverseNameCandidates() {
  if (!apiMode.value || (props.kind !== 'task' && props.kind !== 'artifact')) return;
  const pid = props.projectId;
  const [issues, actions, meetings] = await Promise.all([
    dataClient.issues.listByProject(pid).catch(() => []),
    dataClient.actionItems.listByProject(pid).catch(() => []),
    dataClient.meetingMinutes.listByProject(pid).catch(() => []),
  ]);
  relIssues.value = issues; relActionItems.value = actions; relMeetings.value = meetings;
}
watch(() => [props.kind, props.projectId] as const, loadReverseNameCandidates, { immediate: true });
const reverseIssueIds = computed(() => props.task?.issueIds ?? props.artifact?.issueIds ?? []);
const reverseActionIds = computed(() => props.task?.actionItemIds ?? props.artifact?.actionItemIds ?? []);
const reverseMeetingIds = computed(() => props.task?.meetingIds ?? props.artifact?.meetingIds ?? []);

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

// 0044 §D — 태스크 상세의 산출물 목록에서 산출물 상세로 이동(WBS 진입점 대체).
const router = useRouter();
function openDeliverable(id: number) {
  router.push(`/deliverables/${id}`);
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
// 0039 — 진척률이 산출물 승인비율로 자동 계산될 때 그 근거(승인 n/전체 N)를 화면에 밝힌다.
const approvedDeliverableCount = computed(() =>
  taskDeliverables.value.filter((d) => d.status === 'APPROVED').length);

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

    <!-- 0039 — 카드 1: 항목 정보(필드 + 관련항목 + 저장 바). 코멘트는 별도 카드로 분리해
         저장 버튼이 이 카드 하단에 자연스럽게 붙도록 한다. -->
    <div class="card">
    <!-- 필드 (도메인별) -->
    <dl class="fields">
      <template v-if="kind === 'issue'">
        <div><dt>유형</dt><dd>{{ issue?.type || '—' }}</dd></div>
        <div><dt>담당자</dt>
          <dd class="assignee-dd">
            <span>{{ draft.assigneeName || '—' }}</span>
            <button v-if="apiMode" class="mini-btn" type="button" @click="showAssigneePicker = true">참여인력</button>
          </dd>
        </div>
        <div><dt>발생일</dt><dd>{{ fmtDate(issue?.reportedDate) }}</dd></div>
        <div>
          <dt>{{ dueLabel }}</dt>
          <dd>
            <input v-if="apiMode" v-model="draft.dueDate" class="f-input" type="date" />
            <template v-else>{{ fmtDate(issue?.dueDate) }}</template>
          </dd>
        </div>
        <div>
          <dt>우선순위</dt>
          <dd>
            <select v-if="apiMode" v-model="draft.priority" class="f-input">
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
            <span>{{ draft.assigneeName || '—' }}</span>
            <button v-if="apiMode" class="mini-btn" type="button" @click="showAssigneePicker = true">참여인력</button>
          </dd>
        </div>
        <div>
          <dt>{{ dueLabel }}</dt>
          <dd>
            <input v-if="apiMode" v-model="draft.dueDate" class="f-input" type="date" />
            <template v-else>{{ fmtDate(action?.dueDate) }}</template>
          </dd>
        </div>
      </template>

      <template v-else-if="kind === 'artifact'">
        <div><dt>분류</dt><dd>{{ artifact?.category || '—' }}</dd></div>
        <div><dt>버전</dt><dd>{{ artifact?.version || '—' }}</dd></div>
        <div><dt>담당자</dt>
          <dd class="assignee-dd">
            <span>{{ draft.assigneeName || '—' }}</span>
            <button v-if="apiMode" class="mini-btn" type="button" @click="showAssigneePicker = true">참여인력</button>
          </dd>
        </div>
        <div><dt>마감일</dt><dd>{{ fmtDate(artifact?.dueDate) }}</dd></div>
        <div><dt>제출일</dt><dd>{{ artifact?.submitDate || '—' }}</dd></div>
      </template>

      <template v-else-if="kind === 'task'">
        <div><dt>상태</dt><dd>{{ TASK_STATUS_LABELS[status] ?? status }}</dd></div>
        <div><dt>진척률</dt>
          <dd>
            <input
              v-if="apiMode && taskDeliverables.length === 0" v-model.number="draft.progressRate"
              class="f-input narrow" type="number" min="0" max="100"
            />
            <template v-else>
              <b>{{ task?.progress ?? 0 }}%</b>
              <span class="hint-inline">
                산출물 승인 {{ approvedDeliverableCount }}/{{ taskDeliverables.length }} 기준 자동 계산
                — 직접 입력은 산출물이 없는 태스크에서만 가능합니다
              </span>
            </template>
          </dd>
        </div>
        <!-- 0038 — 실사용 산출물: 이 태스크의 후보(pms_deliverable.task_id) 중 택1 → pms_task.deliverable_id -->
        <div class="wide"><dt>사용 산출물</dt>
          <dd>
            <select
              class="select-in" v-model="draft.deliverableId"
              :disabled="!apiMode || taskDeliverables.length === 0"
            >
              <option :value="null">(선택 안 함)</option>
              <option v-for="d in taskDeliverables" :key="d.id" :value="d.id">{{ d.name }}</option>
            </select>
            <span v-if="taskDeliverables.length === 0" class="hint-inline">이 태스크에 산출물 후보가 없습니다</span>
          </dd>
        </div>
        <div><dt>담당자</dt>
          <dd class="assignee-dd">
            <span>{{ draft.assigneeName || '—' }}</span>
            <button v-if="apiMode" class="mini-btn" type="button" @click="showAssigneePicker = true">참여인력</button>
          </dd>
        </div>
        <!-- 0031: 태스크 일정 지정 — 계획/실적 시작·종료(백엔드 PATCH 화이트리스트 확장) -->
        <div class="wide"><dt>계획 기간</dt>
          <dd class="date-range">
            <input type="date" class="date-in" v-model="draft.plannedStartDate" :disabled="!apiMode" />
            <span class="tilde">~</span>
            <input type="date" class="date-in" v-model="draft.plannedEndDate" :disabled="!apiMode" />
          </dd>
        </div>
        <div class="wide"><dt>실적 기간</dt>
          <dd class="date-range">
            <input type="date" class="date-in" v-model="draft.actualStartDate" :disabled="!apiMode" />
            <span class="tilde">~</span>
            <input type="date" class="date-in" v-model="draft.actualEndDate" :disabled="!apiMode" />
          </dd>
        </div>
        <!-- 0044 §D — 태스크 M/M(공수)·진척 가중치 -->
        <div><dt>M/M (공수)</dt>
          <dd>
            <input
              v-model.number="draft.plannedEffort" class="f-input narrow" type="number"
              min="0" step="0.01" placeholder="—" :disabled="!apiMode"
            />
          </dd>
        </div>
        <div><dt>가중치</dt>
          <dd>
            <input
              v-model.number="draft.weight" class="f-input narrow" type="number"
              min="0" step="0.01" :disabled="!apiMode"
            />
            <span class="hint-inline">단계/전체 진척 롤업 비중 (기본 1)</span>
          </dd>
        </div>
      </template>
    </dl>

    <!-- 0044 §D — 태스크 산출물 목록: WBS에서 진입점을 없애고 여기서 확인·이동한다. -->
    <section v-if="kind === 'task'" class="task-deliv">
      <h3 class="td-title">산출물 <span class="td-count">{{ taskDeliverables.length }}</span></h3>
      <div v-if="taskDeliverables.length === 0" class="td-empty">
        이 태스크에 산출물이 없습니다 — 테일러링 전개 시 연결되거나 산출물 화면에서 추가합니다.
      </div>
      <table v-else class="td-grid">
        <thead><tr><th>산출물명</th><th>상태</th><th>버전</th><th>마감일</th><th>담당</th></tr></thead>
        <tbody>
          <tr
            v-for="d in taskDeliverables" :key="d.id"
            class="td-row" role="link" tabindex="0"
            @click="openDeliverable(d.id)" @keydown.enter="openDeliverable(d.id)"
          >
            <td class="td-name">{{ d.name }}<span v-if="d.id === draft.deliverableId" class="td-use">사용</span></td>
            <td><StatusBadge :status="d.status" /></td>
            <td class="muted">{{ d.version ? `v${d.version}` : '—' }}</td>
            <td class="muted">{{ fmtDate(d.dueDate) }}</td>
            <td class="muted">{{ d.author || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- 0039 — 산출물은 파일이 핵심 작업이라 dd 안의 작은 링크 버튼에서 전용 패널로 승격.
         템플릿 받기 → 작업 → 수정본 업로드(버전 증가) → 최신본 받기 흐름을 그대로 노출한다. -->
    <section v-if="kind === 'artifact'" class="file-panel">
      <div class="fp-head">
        <h3 class="fp-title">산출물 파일</h3>
        <span class="fp-current">
          <template v-if="artifact?.fileName">
            현재 파일: <b>{{ artifact.fileName }}</b>
            <template v-if="artifact?.version"> (v{{ artifact.version }})</template>
          </template>
          <template v-else>업로드된 파일이 없습니다 — 템플릿을 받아 작성 후 업로드하세요.</template>
        </span>
      </div>
      <div class="fp-actions">
        <button class="btn btn-primary fp-btn" type="button" :disabled="fileBusy" @click="fileInput?.click()">
          ⬆ 수정본 업로드
        </button>
        <button class="btn fp-btn" type="button" :disabled="fileBusy || !artifact?.fileName" @click="downloadCurrent">
          ⬇ 최신 파일 받기
        </button>
        <button class="btn fp-btn ghost" type="button" :disabled="fileBusy" @click="downloadTemplate">
          템플릿 받기
        </button>
        <input ref="fileInput" type="file" class="file-hidden" @change="onFilePicked" />
      </div>
      <p v-if="fileBusy" class="fp-msg">처리 중…</p>
      <p v-else-if="fileMsg" class="fp-msg ok">{{ fileMsg }}</p>
      <p v-else-if="fileErr" class="fp-msg err">{{ fileErr }}</p>
    </section>

    <!-- 상세내용(이슈=검토/액션=확인 코멘트) — 읽기 전용(백엔드 수정 계약 없음) -->
    <div v-if="kind === 'issue' || kind === 'action'" class="detail-field">
      <label class="f-label">{{ detailLabel }}</label>
      <div class="ro-text">{{ detailText || '—' }}</div>
    </div>

    <!-- 상태 변경 — 통일 드롭다운(현재 상태 → 전환 가능 상태 + 워크플로 보기).
         0039 — 관련항목보다 위(요청): 상태가 먼저 눈에 들어와야 한다. -->
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

    <!-- 0039 — 관련항목: 이슈/액션은 매핑 편집(draft), 태스크/산출물은 역방향 읽기전용 표시 -->
    <section v-if="apiMode && (kind === 'issue' || kind === 'action')" class="section rel-section">
      <h3 class="section-title">관련항목</h3>
      <CollapsibleSection title="관련 태스크" :count="draft.taskIds.length">
        <MultiSelectChecklist v-model="draft.taskIds" :items="relTaskOptions" search-placeholder="태스크 검색…" empty-text="전개된 태스크가 없습니다." />
      </CollapsibleSection>
      <CollapsibleSection title="관련 산출물" :count="draft.deliverableIds.length">
        <MultiSelectChecklist v-model="draft.deliverableIds" :items="relDeliverableOptions" search-placeholder="산출물 검색…" empty-text="등록된 산출물이 없습니다." />
      </CollapsibleSection>
      <CollapsibleSection v-if="kind === 'action'" title="관련 이슈/리스크" :count="draft.issueIds.length">
        <MultiSelectChecklist v-model="draft.issueIds" :items="relIssueOptions" search-placeholder="이슈/리스크 검색…" empty-text="등록된 이슈/리스크가 없습니다." />
      </CollapsibleSection>
      <CollapsibleSection title="관련 회의록" :count="draft.meetingIds.length">
        <MultiSelectChecklist v-model="draft.meetingIds" :items="relMeetingOptions" search-placeholder="회의록 검색…" empty-text="등록된 회의록이 없습니다." />
      </CollapsibleSection>
      <CollapsibleSection v-if="kind === 'issue'" title="관련 액션아이템" :count="draft.actionItemIds.length">
        <MultiSelectChecklist v-model="draft.actionItemIds" :items="relActionOptions" search-placeholder="액션아이템 검색…" empty-text="등록된 액션아이템이 없습니다." />
      </CollapsibleSection>
    </section>

    <section v-else-if="kind === 'task' || kind === 'artifact'" class="section rel-section">
      <h3 class="section-title">관련항목</h3>
      <div class="rel-ro">
        <div class="rel-ro-row">
          <span class="rel-ro-k">이슈/리스크</span>
          <template v-if="reverseIssueIds.length">
            <span v-for="rid in reverseIssueIds" :key="rid" class="chip">{{ relIssuesById.get(rid)?.title ?? ('#' + rid) }}</span>
          </template>
          <span v-else class="dim">없음</span>
        </div>
        <div class="rel-ro-row">
          <span class="rel-ro-k">액션아이템</span>
          <template v-if="reverseActionIds.length">
            <span v-for="rid in reverseActionIds" :key="rid" class="chip">{{ relActionsById.get(rid)?.title ?? ('#' + rid) }}</span>
          </template>
          <span v-else class="dim">없음</span>
        </div>
        <div class="rel-ro-row">
          <span class="rel-ro-k">회의록</span>
          <template v-if="reverseMeetingIds.length">
            <span v-for="rid in reverseMeetingIds" :key="rid" class="chip">{{ relMeetingsById.get(rid)?.title ?? ('#' + rid) }}</span>
          </template>
          <span v-else class="dim">없음</span>
        </div>
      </div>
    </section>

    <p v-if="fieldError" class="err">{{ fieldError }}</p>

    <!-- 0039 — 변경분이 있을 때만 나타나는 저장 바(수정→검토→저장) -->
    <div v-if="apiMode && isDirty" class="save-bar">
      <span class="save-hint">저장하지 않은 변경사항이 있습니다.</span>
      <button class="btn btn-sm" type="button" :disabled="savingField === 'draft'" @click="discardDraft">취소</button>
      <button class="btn btn-primary btn-sm" type="button" :disabled="savingField === 'draft'" @click="saveDraft">
        {{ savingField === 'draft' ? '저장 중…' : '저장' }}
      </button>
    </div>
    </div><!-- /카드 1 -->

    <!-- 첨부파일: 구 아마란스(원챔버) stub 제거(2026-07-09 자체완결 전환).
         산출물 파일은 위 '파일' 행(0038 FilePort)로 대체 — 그 외 엔티티 첨부는 후속(0018). -->

    <!-- 0039 — 카드 2: 코멘트(항목 정보 저장과 무관한 독립 영역) -->
    <section class="card section comment-card">
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

/* 0039 — 항목 정보 / 코멘트를 카드로 분리(저장 버튼이 정보 카드 하단에 붙도록) */
.card {
  display: flex; flex-direction: column; gap: 12px;
  background: var(--panel); border: 1px solid var(--border); border-radius: 10px;
  padding: 14px 16px;
}
.card > .section:first-child { border-top: 0; padding-top: 0; }
.comment-card { gap: 8px; }
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

/* 0039 — 산출물 파일 전용 패널(강조) */
.file-panel {
  display: flex; flex-direction: column; gap: 10px;
  border: 1px solid var(--accent); border-radius: 10px; padding: 12px 14px;
  background: rgba(139, 92, 246, 0.06);
}
.fp-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.fp-title { font-size: 14px; margin: 0; }
.fp-current { font-size: 12.5px; color: var(--muted); }
.fp-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.fp-btn { font-size: 13.5px; font-weight: 600; padding: 8px 14px; }
.fp-btn.ghost { color: var(--muted); }
.fp-msg { margin: 0; font-size: 12.5px; color: var(--muted); }
.fp-msg.ok { color: var(--green); }
.fp-msg.err { color: var(--red); }

.select-in {
  background: var(--panel-2, var(--panel)); border: 1px solid var(--border); border-radius: 6px;
  color: var(--text); font-size: 13px; padding: 5px 8px; font-family: inherit; max-width: 100%;
}
.hint-inline { font-size: 12px; color: var(--muted); margin-left: 6px; }
.f-input.narrow { max-width: 90px; }

/* 0044 §D — 태스크 산출물 목록 섹션 */
.task-deliv {
  margin: 14px 0; padding: 12px 14px;
  border: 1px solid var(--border); border-radius: 10px; background: var(--panel);
}
.td-title { font-size: 14.5px; margin: 0 0 10px; }
.td-count {
  font-size: 11.5px; font-weight: 700; color: var(--muted);
  background: var(--panel-2, var(--panel)); border: 1px solid var(--border);
  border-radius: 999px; padding: 0 8px; margin-left: 4px;
}
.td-empty { font-size: 13px; color: var(--muted); }
.td-grid { border-collapse: collapse; width: 100%; font-size: 13.5px; }
.td-grid th, .td-grid td { text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--border); }
.td-grid th { color: var(--muted); font-weight: 600; font-size: 12.5px; }
.td-row { cursor: pointer; }
.td-row:hover td { background: var(--panel-2, rgba(139, 92, 246, 0.06)); }
.td-name { font-weight: 600; }
.td-use {
  font-size: 11px; font-weight: 700; color: var(--accent);
  border: 1px solid var(--accent); border-radius: 999px; padding: 0 6px; margin-left: 6px;
}
.muted { color: var(--muted); }

/* 0039 — 관련항목 */
.rel-section { gap: 8px; }
.rel-ro { display: flex; flex-direction: column; gap: 8px; }
.rel-ro-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 13px; }
.rel-ro-k { color: var(--muted); font-size: 12px; flex-shrink: 0; min-width: 70px; }
.chip {
  font-size: 12px; padding: 2px 8px; border-radius: 999px;
  background: var(--panel); border: 1px solid var(--border); color: var(--text);
}
.dim { color: var(--muted); font-size: 12.5px; }

/* 0039 — 변경분 저장 바 */
.save-bar {
  position: sticky; bottom: 0; z-index: 5;
  display: flex; align-items: center; gap: 8px;
  background: var(--panel); border: 1px solid var(--accent); border-radius: 8px;
  padding: 8px 10px; margin-top: 4px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}
.save-hint { flex: 1; font-size: 12.5px; color: var(--muted); }
</style>
