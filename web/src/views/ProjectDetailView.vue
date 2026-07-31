<script setup lang="ts">
// P1-2 프로젝트 상세 (/app/projects/:id) — 탭 구성은 단계(stage)별 분기.
// 공통: 개요(컨소시엄 요약 포함) | 활동로그
// BIDDING: 제안 태스크(태스크→산출물 트리) | 컨소시엄(상세) | VRB
// EXECUTION(·COMPLETED): 산출물 | 회의록 | 이슈/리스크 | 액션아이템 | 공문
// ?tab= 딥링크 유지(현재 단계에 없는 탭이면 개요로).
//
// 0012 재설계: 인라인 테이블 편집(셀 안 상태 드롭다운·날짜칸·진척률 입력)을 제거하고
// 목록 행 제목/명 클릭 → 우측 사이드 상세 패널(DetailPanel)로 통일한다(카탈로그 마스터-디테일).
// 필드 인라인 PATCH·상태 전이·사유 코멘트·코멘트 스레드는 전부 패널 안에서 처리한다.
// ?panel=<kind>:<id> 딥링크로 알림 클릭 시 특정 대상 패널을 연다(?comment=<id>로 코멘트 강조).
import { ref, computed, watch, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { dataClient } from '../lib/dataClient';
import { setCurrentProjectStage } from '../lib/currentProjectStage';
import type {
  Project, Issue, ActionItem, Artifact, MeetingMinute, VrbInfo, OfficialDoc, Activity, Task,
  ProjectProgress, ProjectWbs, ProjectMemberDetail,
} from '../types';
import { employmentTypeLabel } from '../lib/personLabels';
import StageBadge from '../components/StageBadge.vue';
import ProgressBar from '../components/ProgressBar.vue';
import StatusBadge from '../components/StatusBadge.vue';
import StateNotice from '../components/StateNotice.vue';
import SideDrawer from '../components/SideDrawer.vue';
import DetailPanel, { type DetailKind } from '../components/DetailPanel.vue';
import IssueFormModal from '../components/IssueFormModal.vue';
import ActionItemFormModal from '../components/ActionItemFormModal.vue';
import MeetingMinuteFormModal from '../components/MeetingMinuteFormModal.vue';
import MeetingDetailPanel from '../components/MeetingDetailPanel.vue';
import ConsortiumMemberFormModal from '../components/ConsortiumMemberFormModal.vue';
import ModalShell from '../components/ModalShell.vue';
import VrbFormModal from '../components/VrbFormModal.vue';
import WbsSchedule from '../components/WbsSchedule.vue';
import WbsGantt from '../components/WbsGantt.vue';
import ProjectFormModal from '../components/ProjectFormModal.vue';
import ProjectMembers from '../components/ProjectMembers.vue';
import ExecConvertWizard from '../components/ExecConvertWizard.vue';

const props = defineProps<{ id: string }>();
const route = useRoute();
const router = useRouter();

const projectId = computed(() => Number(props.id));

const project = ref<Project | null>(null);
const loading = ref(true);
const loadError = ref<string | null>(null);
const sourceProject = ref<Project | null>(null);

// ---- 단계별 탭 구성 -----------------------------------------------------------
type TabKey =
  | 'overview' | 'activity'                                    // 공통
  | 'members'                                                   // 배치21 참여인력(공통)
  | 'tasks' | 'consortium' | 'vrb'                             // BIDDING
  | 'wbs' | 'gantt'                                             // 배치20 WBS/일정 · 0031 간트차트
  | 'artifacts' | 'meeting-minutes' | 'issues' | 'action-items' | 'official-docs'; // EXECUTION

// 사업상태 영문 코드 → 한글(ProjectListView와 동일 매핑). 한글이 그대로 저장된 데이터는 통과.
const PROJECT_STATUS_LABELS: Record<string, string> = {
  Bidding: '입찰', 'In Progress': '진행중', Delay: '지연', 'On Hold': '보류', Completed: '완료',
};
const projectStatusLabel = (s: string | null | undefined) => (s ? (PROJECT_STATUS_LABELS[s] ?? s) : '—');

const TAB_LABELS: Record<TabKey, string> = {
  overview: '개요', activity: '활동로그',
  members: '참여인력',
  tasks: '제안 태스크', consortium: '컨소시엄', vrb: 'VRB',
  wbs: 'WBS/일정', gantt: '간트차트',
  artifacts: '산출물', 'meeting-minutes': '회의록', issues: '이슈/리스크',
  'action-items': '액션아이템', 'official-docs': '공문',
};

const tabs = computed<TabKey[]>(() => {
  if (!project.value) return [];
  // WBS/일정: 실행 단계 핵심. BIDDING(제안 일정)에서도 노출.
  // 참여인력: 입찰·실행 공통(유경님 요구 §1).
  const stageTabs: TabKey[] =
    project.value.stage === 'BIDDING'
      ? ['tasks', 'wbs', 'gantt', 'consortium', 'vrb', 'members']
      : ['wbs', 'gantt', 'artifacts', 'meeting-minutes', 'issues', 'action-items', 'official-docs', 'members'];
  return ['overview', ...stageTabs, 'activity'];
});

const activeTab = computed<TabKey>(() => {
  const t = String(route.query.tab ?? '') as TabKey;
  return tabs.value.includes(t) ? t : 'overview';
});

function selectTab(key: TabKey) {
  router.replace({ query: { ...route.query, tab: key === 'overview' ? undefined : key } });
}

// ---- 탭 데이터 (탭 최초 활성화 시 지연 로드) ----------------------------------
const issues = ref<Issue[]>([]);
const actionItems = ref<ActionItem[]>([]);
const artifacts = ref<Artifact[]>([]);
const meetings = ref<MeetingMinute[]>([]);
const vrb = ref<VrbInfo | null>(null);
const officialDocs = ref<OfficialDoc[]>([]);
const activities = ref<Activity[]>([]);
const tasks = ref<Task[]>([]);
const wbs = ref<ProjectWbs | null>(null);
const tabLoading = ref(false);
const loadedTabs = new Set<TabKey>();

async function loadTab(key: TabKey) {
  if (loadedTabs.has(key) || !Number.isFinite(projectId.value)) return;
  loadedTabs.add(key);
  const pid = projectId.value;
  if (key === 'overview' || key === 'tasks') loadProgress();
  if (key === 'overview') { void loadOverviewSections(pid); return; }
  // members는 컴포넌트가 자체 로드(GET /members) — 여기서는 지연로드 대상 아님.
  if (key === 'consortium') void loadConsortium();
  const needsLoad = !['consortium', 'members'].includes(key);
  if (!needsLoad) return;
  tabLoading.value = true;
  try {
    switch (key) {
      case 'issues': issues.value = await dataClient.issues.listByProject(pid); break;
      case 'action-items': actionItems.value = await dataClient.actionItems.listByProject(pid); break;
      case 'artifacts': artifacts.value = await dataClient.artifacts.listByProject(pid); break;
      case 'meeting-minutes': meetings.value = await dataClient.meetingMinutes.listByProject(pid); break;
      case 'vrb': vrb.value = await dataClient.vrb.getByProject(pid); break;
      case 'official-docs': officialDocs.value = await dataClient.officialDocs.listByProject(pid); break;
      case 'activity': activities.value = await dataClient.activities.listByProject(pid); break;
      case 'wbs': wbs.value = await dataClient.projects.wbs(pid); break;
      case 'gantt': if (!wbs.value) wbs.value = await dataClient.projects.wbs(pid); break;
      case 'tasks': {
        [tasks.value, artifacts.value] = await Promise.all([
          dataClient.tasks.listByProject(pid),
          dataClient.artifacts.listByProject(pid),
        ]);
        break;
      }
    }
  } catch (e) {
    console.error(`[detail] 탭(${key}) 로드 실패:`, e);
  } finally {
    tabLoading.value = false;
  }
}

// ---- 제안 태스크 트리 (태스크 아래 산출물) ------------------------------------
interface TaskTreeRow {
  kind: 'task' | 'deliverable';
  depth: number;
  task?: Task;
  artifact?: Artifact;
}

const taskTreeRows = computed<TaskTreeRow[]>(() => {
  const byParent = new Map<number | null, Task[]>();
  for (const t of tasks.value) {
    const list = byParent.get(t.parentId) ?? [];
    list.push(t);
    byParent.set(t.parentId, list);
  }
  const bySort = (a: Task, b: Task) => a.sortOrder - b.sortOrder || a.id - b.id;
  const artifactsByTask = new Map<number, Artifact[]>();
  for (const a of artifacts.value) {
    if (a.taskId == null) continue;
    const list = artifactsByTask.get(a.taskId) ?? [];
    list.push(a);
    artifactsByTask.set(a.taskId, list);
  }
  const rows: TaskTreeRow[] = [];
  const walk = (parentId: number | null, depth: number) => {
    for (const t of (byParent.get(parentId) ?? []).sort(bySort)) {
      rows.push({ kind: 'task', depth, task: t });
      for (const a of artifactsByTask.get(t.id) ?? []) {
        rows.push({ kind: 'deliverable', depth: depth + 1, artifact: a });
      }
      walk(t.id, depth + 1);
    }
  };
  walk(null, 0);
  return rows;
});

const TASK_STATUS_LABELS: Record<string, string> = {
  TODO: '대기', IN_PROGRESS: '진행중', REVIEW: '검토중', REJECTED: '반려', DONE: '완료',
};

const apiMode = computed(() => !!window.API_BASE);

// ---- 상세 패널(사이드 드로어) — 인라인 편집을 대체 -----------------------------
// panelTarget: 열린 대상(도메인+id). ?panel=<kind>:<id> 딥링크로도 열린다.
interface PanelTarget { kind: DetailKind; id: number; }
const panelTarget = ref<PanelTarget | null>(null);
// 알림 클릭 시 강조할 코멘트 id(?comment=)
const highlightCommentId = computed(() => {
  const c = Number(route.query.comment);
  return Number.isFinite(c) && c > 0 ? c : null;
});

function openPanel(kind: DetailKind, id: number) {
  openMeetingId.value = null;
  panelTarget.value = { kind, id };
}
function closePanel() {
  panelTarget.value = null;
  // 딥링크 쿼리 정리(panel/comment 제거)
  if (route.query.panel || route.query.comment) {
    const q = { ...route.query };
    delete q.panel; delete q.comment;
    router.replace({ query: q });
  }
}

// 0039 — 회의록 상세 패널(별도 구조라 DetailKind에는 포함하지 않고 독립 상태로 관리).
const openMeetingId = ref<number | null>(null);
function openMeeting(id: number) {
  panelTarget.value = null;
  openMeetingId.value = id;
}
function closeMeetingPanel() {
  openMeetingId.value = null;
  if (route.query.meeting) {
    const q = { ...route.query };
    delete q.meeting;
    router.replace({ query: q });
  }
}
async function onMeetingChanged() {
  await reloadMeetings();
}

// 딥링크(?panel=kind:id) → 패널 열기. 탭도 대상 도메인으로 맞춘다.
const PANEL_TAB: Record<DetailKind, TabKey> = {
  issue: 'issues', action: 'action-items', artifact: 'artifacts', task: 'tasks',
};
function applyPanelQuery() {
  const raw = String(route.query.panel ?? '');
  const m = raw.match(/^(issue|action|artifact|task):(\d+)$/);
  if (!m) { if (!route.query.panel) panelTarget.value = null; return; }
  const kind = m[1] as DetailKind;
  const id = Number(m[2]);
  panelTarget.value = { kind, id };
  // 해당 탭 데이터가 로드되도록 탭 전환(딥링크 진입)
  const tab = PANEL_TAB[kind];
  if (tabs.value.includes(tab)) loadTab(tab);
}

// 선택 대상 객체(로드된 목록에서 조회 — 없으면 패널이 열려도 대상 미발견 안내)
const panelIssue = computed(() => panelTarget.value?.kind === 'issue' ? issues.value.find((i) => i.id === panelTarget.value!.id) ?? null : null);
const panelAction = computed(() => panelTarget.value?.kind === 'action' ? actionItems.value.find((a) => a.id === panelTarget.value!.id) ?? null : null);
const panelArtifact = computed(() => panelTarget.value?.kind === 'artifact' ? artifacts.value.find((a) => a.id === panelTarget.value!.id) ?? null : null);
const panelTask = computed(() => panelTarget.value?.kind === 'task' ? tasks.value.find((t) => t.id === panelTarget.value!.id) ?? null : null);

// 패널 안에서 변경 발생 → 해당 도메인 재조회(목록·패널 값 동기화)
async function onPanelChanged() {
  const k = panelTarget.value?.kind;
  if (k === 'issue') await reloadIssues();
  else if (k === 'action') await reloadActions();
  else if (k === 'artifact') await reloadArtifacts();
  else if (k === 'task') await reloadTasks();
}

// ---- 0027 개요 탭 6섹션 (레거시 사업개요 파리티) --------------------------------
// 개요 진입 시 참여인력·WBS(주요일정)·활동로그(최근활동)·목록 카운트(현황 요약)를 병렬 로드.
// 각 로드는 독립 실패 허용(한 섹션 실패가 개요 전체를 막지 않음).
const members = ref<ProjectMemberDetail[]>([]);
const includeExcludedMembers = ref(false);
const overviewLoaded = ref(false);

async function loadOverviewSections(pid: number) {
  if (overviewLoaded.value) return;
  overviewLoaded.value = true;
  await Promise.all([
    dataClient.projectMembers.listDetail(pid).then((v) => { members.value = v; }).catch((e) => console.error('[overview] 참여인력:', e)),
    dataClient.projects.wbs(pid).then((v) => { wbs.value = v; }).catch((e) => console.error('[overview] WBS:', e)),
    dataClient.activities.listByProject(pid).then((v) => { activities.value = v; }).catch((e) => console.error('[overview] 활동:', e)),
    dataClient.artifacts.listByProject(pid).then((v) => { artifacts.value = v; }).catch((e) => console.error('[overview] 산출물:', e)),
    dataClient.meetingMinutes.listByProject(pid).then((v) => { meetings.value = v; }).catch((e) => console.error('[overview] 회의록:', e)),
    dataClient.issues.listByProject(pid).then((v) => { issues.value = v; }).catch((e) => console.error('[overview] 이슈:', e)),
    dataClient.actionItems.listByProject(pid).then((v) => { actionItems.value = v; }).catch((e) => console.error('[overview] 액션:', e)),
    dataClient.officialDocs.listByProject(pid).then((v) => { officialDocs.value = v; }).catch((e) => console.error('[overview] 공문:', e)),
  ]);
}

const activeMembers = computed(() => members.value.filter((m) => m.isActive !== false));
const shownMembers = computed(() =>
  includeExcludedMembers.value ? members.value : activeMembers.value);

/** 주요일정 — WBS PHASE 타임라인(이름·기간·진척률). */
const phaseTimeline = computed(() =>
  (wbs.value?.phases ?? []).map((ph) => ({
    nodeId: ph.nodeId,
    name: ph.name,
    start: ph.plannedStartDate,
    end: ph.plannedEndDate,
    rate: ph.actualRate,
    state: ph.actualRate >= 100 ? 'done' : ph.actualRate > 0 ? 'doing' : 'todo',
  })));

const recentActivities = computed(() => activitiesSorted.value.slice(0, 4));

/** 현황 요약(구 연관정보) — 건수 + 이동 탭(현 단계에 없는 탭은 숨김). */
const relatedRows = computed(() => {
  if (!project.value) return [];
  const bidding = project.value.stage === 'BIDDING';
  const rows: { label: string; count: number; tab: TabKey }[] = [
    { label: bidding ? '제안준비서류' : '산출물', count: artifacts.value.length, tab: bidding ? 'tasks' : 'artifacts' },
    { label: '회의록', count: meetings.value.length, tab: 'meeting-minutes' },
    { label: '이슈/리스크', count: issues.value.length, tab: 'issues' },
    { label: '액션아이템', count: actionItems.value.length, tab: 'action-items' },
    { label: '공문', count: officialDocs.value.length, tab: 'official-docs' },
  ];
  return rows.filter((r) => tabs.value.includes(r.tab));
});

// 비고(remarks) 인라인 저장 — 레거시 기본정보 카드의 상태 메모.
const remarksDraft = ref('');
const remarksSaving = ref(false);
watch(project, (p) => { remarksDraft.value = p?.remarks ?? ''; }, { immediate: true });
async function saveRemarks() {
  if (!project.value) return;
  remarksSaving.value = true;
  try {
    project.value = await dataClient.projects.update(project.value.id, { remarks: remarksDraft.value });
  } catch (e) {
    alert(e instanceof Error ? e.message : String(e));
  } finally {
    remarksSaving.value = false;
  }
}

// 담당조직 정보(입찰 전용) — 표시 + 인라인 수정 토글.
const OWNER_FIELDS = [
  { key: 'salesOwner', label: '영업 담당자' },
  { key: 'proposalOwner', label: '제안전략팀 담당자' },
  { key: 'proposalPm', label: '제안PM' },
  { key: 'businessManager', label: '사업관리 담당자' },
  { key: 'contractOwner', label: '계약 담당자' },
  { key: 'legalOwner', label: '법무 담당자' },
] as const;
type OwnerKey = typeof OWNER_FIELDS[number]['key'];
const ownersEditing = ref(false);
const ownersDraft = ref<Record<OwnerKey, string>>({} as Record<OwnerKey, string>);
const ownersSaving = ref(false);
function startOwnersEdit() {
  const p = project.value;
  const d = {} as Record<OwnerKey, string>;
  for (const f of OWNER_FIELDS) d[f.key] = (p?.[f.key] ?? '') as string;
  ownersDraft.value = d;
  ownersEditing.value = true;
}
async function saveOwners() {
  if (!project.value) return;
  ownersSaving.value = true;
  try {
    const patch: Record<string, string> = {};
    for (const f of OWNER_FIELDS) patch[f.key] = ownersDraft.value[f.key] ?? '';
    project.value = await dataClient.projects.update(project.value.id, patch);
    ownersEditing.value = false;
  } catch (e) {
    alert(e instanceof Error ? e.message : String(e));
  } finally {
    ownersSaving.value = false;
  }
}

/** D-Day(입찰 헤더) — 제안서 제출마감일 기준. */
const dday = computed(() => {
  const p = project.value;
  if (!p || p.stage !== 'BIDDING') return null;
  if (!p.proposalDeadline) return { label: '마감일 미정', cls: 'dday-none' };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(`${p.proposalDeadline}T00:00:00`).getTime() - today.getTime()) / 86400000);
  if (diff === 0) return { label: 'D-Day', cls: 'dday-hot' };
  if (diff > 0) return { label: `D-${diff}`, cls: diff <= 7 ? 'dday-hot' : 'dday-norm' };
  return { label: `D+${-diff}`, cls: 'dday-over' };
});

function initial(name: string | null): string {
  return (name ?? '?').trim().charAt(0) || '?';
}

// ---- 계산 진척률(B-8) ---------------------------------------------------------
const progress = ref<ProjectProgress | null>(null);
const progressLoaded = ref(false);

async function loadProgress() {
  if (progressLoaded.value || !Number.isFinite(projectId.value)) return;
  progressLoaded.value = true;
  try {
    progress.value = await dataClient.progress.getByProject(projectId.value);
  } catch (e) {
    console.error('[detail] 진척률 로드 실패:', e);
    progress.value = null;
  }
}

// 0039 — VRB 심의 정보 수정(프로젝트당 1건, PUT upsert)
const showVrbForm = ref(false);
function onVrbSaved(saved: import('../types').VrbInfo) {
  showVrbForm.value = false;
  vrb.value = saved;
}

// 0039 — 컨소시엄 구성원 CRUD. 응답에 목록+합계가 함께 온다.
const consortiumMembers = ref<import('../types').ConsortiumMember[]>([]);
const consortiumTotal = ref(0);
const consortiumBalanced = ref(true);
const consortiumError = ref<string | null>(null);
const consortiumForm = ref<{ member: import('../types').ConsortiumMember | null } | null>(null);

function applyConsortium(p: import('../types').ConsortiumPayload) {
  consortiumMembers.value = p.members;
  consortiumTotal.value = p.shareTotal;
  consortiumBalanced.value = p.shareBalanced;
}
async function loadConsortium() {
  if (!apiMode.value) { consortiumMembers.value = project.value?.consortiumMembers ?? []; return; }
  consortiumError.value = null;
  try {
    applyConsortium(await dataClient.consortium.listByProject(projectId.value));
  } catch (e) {
    consortiumError.value = e instanceof Error ? e.message : String(e);
  }
}
function openConsortiumForm(member: import('../types').ConsortiumMember | null) {
  consortiumForm.value = { member };
}
function onConsortiumSaved(p: import('../types').ConsortiumPayload) {
  consortiumForm.value = null;
  applyConsortium(p);
}
async function removeConsortiumMember(c: import('../types').ConsortiumMember) {
  if (c.id == null) return;
  if (!window.confirm(`"${c.companyName}"을(를) 컨소시엄에서 삭제할까요?`)) return;
  consortiumError.value = null;
  try {
    applyConsortium(await dataClient.consortium.remove(projectId.value, c.id));
  } catch (e) {
    consortiumError.value = e instanceof Error ? e.message : String(e);
  }
}
/** 수정 대상 본인 지분을 제외한 합계(모달의 "저장 후 총 지분율" 계산용) */
const consortiumOthersTotal = computed(() => {
  const editing = consortiumForm.value?.member;
  const others = editing
    ? consortiumMembers.value.filter((m) => m.id !== editing.id)
    : consortiumMembers.value;
  return Math.round(others.reduce((sum, m) => sum + (m.shareRate ?? 0), 0) * 100) / 100;
});

async function reloadIssues() { issues.value = await dataClient.issues.listByProject(projectId.value); }
async function reloadActions() { actionItems.value = await dataClient.actionItems.listByProject(projectId.value); }
async function reloadArtifacts() { artifacts.value = await dataClient.artifacts.listByProject(projectId.value); }
async function reloadTasks() { tasks.value = await dataClient.tasks.listByProject(projectId.value); }
async function reloadMeetings() { meetings.value = await dataClient.meetingMinutes.listByProject(projectId.value); }

function taskHasDeliverable(taskId: number): boolean {
  return artifacts.value.some((a) => a.taskId === taskId);
}

// ---- 등록 폼 모달(B-7) --------------------------------------------------------
const showIssueForm = ref(false);
const showActionForm = ref(false);
const showMeetingForm = ref(false);
async function onIssueCreated() { showIssueForm.value = false; await reloadIssues(); }
async function onActionCreated() { showActionForm.value = false; await reloadActions(); }
async function onMeetingCreated() { showMeetingForm.value = false; await reloadMeetings(); }

// ---- 0033 개정: 입찰 → 수행 전환 마법사(정보 보완 + 테일러링 선택) -------------
const showConvertWizard = ref(false);
function onConverted(created: Project) {
  showConvertWizard.value = false;
  router.push(`/projects/${created.id}`);
}

// ---- 0039: 입찰 결과 확정(상태 전환) ------------------------------------------
//   수주 → 기존 수행 전환 마법사(수행 프로젝트 생성). 전환 완료 시 백엔드가 원본 입찰을
//          bid_status=수주 · status=완료로 정리한다(ProjectConvertService).
//   실패 → 수행 프로젝트를 만들지 않고 입찰 자체만 bid_status=실패 · status=완료로 마감.
const showBidOutcome = ref(false);
const bidOutcomeSaving = ref(false);
const bidOutcomeError = ref<string | null>(null);

function chooseWin() {
  showBidOutcome.value = false;
  showConvertWizard.value = true;
}
async function chooseLose() {
  if (!window.confirm('이 입찰을 「실패」로 확정할까요? 수행 프로젝트는 생성되지 않습니다.')) return;
  bidOutcomeSaving.value = true;
  bidOutcomeError.value = null;
  try {
    project.value = await dataClient.projects.update(projectId.value, { bidStatus: '실패', status: '완료' });
    showBidOutcome.value = false;
  } catch (e) {
    bidOutcomeError.value = e instanceof Error ? e.message : String(e);
  } finally {
    bidOutcomeSaving.value = false;
  }
}

// ---- 프로젝트 수정 모달(배치18) ----------------------------------------------
const showEditForm = ref(false);
async function onProjectSaved(updated: Project) {
  showEditForm.value = false;
  project.value = updated;
  // 단계 변경 시 탭 구성이 바뀔 수 있어 개요로 되돌리는 편이 안전(현재 탭이 새 구성에 없으면).
}

const activitiesSorted = computed(() =>
  [...activities.value].sort((a, b) => String(b.date).localeCompare(String(a.date))),
);

const ACTION_LABELS: Record<string, string> = { INSERT: '등록', UPDATE: '수정', DELETE: '삭제' };
function actionLabel(t: string): string {
  return ACTION_LABELS[t] ?? t;
}

function fmtAmount(v: number): string {
  return v ? v.toLocaleString('ko-KR') + ' 원' : '—';
}
function fmtDate(v: string | null | undefined): string {
  return v ? String(v).split('T')[0] : '—';
}
function attendeesText(list: unknown[]): string {
  return (list ?? []).map((a) => (typeof a === 'string' ? a : (a as any)?.name ?? '')).filter(Boolean).join(', ') || '—';
}

async function loadProject() {
  loading.value = true;
  loadError.value = null;
  project.value = null;
  sourceProject.value = null;
  loadedTabs.clear();
  issues.value = []; actionItems.value = []; artifacts.value = []; tasks.value = [];
  meetings.value = []; vrb.value = null; officialDocs.value = []; activities.value = [];
  wbs.value = null;
  progress.value = null; progressLoaded.value = false;
  panelTarget.value = null;
  members.value = []; overviewLoaded.value = false;
  ownersEditing.value = false; includeExcludedMembers.value = false;
  try {
    project.value = await dataClient.projects.get(projectId.value);
    // 0031: 사이드바 입찰/수행 메뉴 활성 — 실제 단계 공유
    setCurrentProjectStage(project.value?.stage ?? null);
    if (project.value?.sourceProjectId != null) {
      sourceProject.value = await dataClient.projects.get(project.value.sourceProjectId);
    }
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
  await loadTab(activeTab.value);
  applyPanelQuery();
  applyMeetingQuery();
}

// 0039 — 대시보드 '최근 회의록'에서 ?meeting=<id>로 진입하면 회의록 상세 드로어를 바로 연다.
function applyMeetingQuery() {
  const raw = Number(route.query.meeting);
  if (Number.isFinite(raw) && raw > 0) openMeetingId.value = raw;
  else if (!route.query.meeting) openMeetingId.value = null;
}

watch(projectId, loadProject, { immediate: true });
onUnmounted(() => setCurrentProjectStage(null));
watch(activeTab, (t) => loadTab(t));
watch(() => route.query.panel, applyPanelQuery);
watch(() => route.query.meeting, applyMeetingQuery);
</script>

<template>
  <div>
    <StateNotice
      :loading="loading" :error="loadError"
      :empty="!loading && !loadError && !project"
      empty-text="프로젝트를 찾을 수 없습니다 — 데이터 소스(백엔드 API 또는 Supabase 시드) 연결 후 표시됩니다."
    />

    <template v-if="!loading && project">
      <div class="head">
        <div>
          <h1 class="title">
            {{ project.name }}
            <StageBadge :stage="project.stage" class="head-badge" />
            <span v-if="dday" class="dday-badge" :class="dday.cls">{{ dday.label }}</span>
          </h1>
          <p class="sub">
            <span class="code">{{ project.projectCode || '—' }}</span>
            <span v-if="project.desc"> · {{ project.desc }}</span>
          </p>
        </div>
        <div class="head-actions">
          <button
            v-if="project.stage === 'BIDDING'"
            class="btn btn-primary"
            title="입찰 결과(수주/실패)를 확정합니다"
            @click="showBidOutcome = true"
          >상태 전환</button>
          <button class="btn" @click="showEditForm = true">수정</button>
          <RouterLink :to="project.stage === 'BIDDING' ? '/projects/bidding' : '/projects/active'" class="back">← 목록</RouterLink>
        </div>
      </div>

      <!-- 0027: 헤더 KPI 6카드 (레거시 상세 헤더 파리티) -->
      <div class="kpi-row">
        <div class="kpi"><span class="kpi-k">고객사</span><span class="kpi-v">{{ project.customerName || '—' }}</span></div>
        <div class="kpi"><span class="kpi-k">사업책임자</span><span class="kpi-v">{{ project.manager || '—' }}</span></div>
        <div class="kpi"><span class="kpi-k">사업기간</span><span class="kpi-v">{{ fmtDate(project.startDate) }} ~ {{ fmtDate(project.endDate) }}</span></div>
        <div class="kpi"><span class="kpi-k">계약금액</span><span class="kpi-v">{{ fmtAmount(project.projectBudget) }}</span></div>
        <div class="kpi"><span class="kpi-k">사업상태</span><span class="kpi-v">{{ projectStatusLabel(project.status) }}</span></div>
        <div class="kpi">
          <span class="kpi-k">진척률</span>
          <span class="kpi-v kpi-progress"><ProgressBar :value="progress ? progress.overall : project.progress" /></span>
        </div>
      </div>

      <RouterLink
        v-if="project.sourceProjectId != null"
        :to="`/projects/${project.sourceProjectId}`"
        class="src-card"
      >
        <span class="src-label">원본 입찰 프로젝트</span>
        <span class="src-name">
          {{ sourceProject ? `${sourceProject.projectCode || ''} ${sourceProject.name}`.trim() : `#${project.sourceProjectId}` }}
        </span>
        <span class="src-go">보기 →</span>
      </RouterLink>

      <div class="tabs">
        <button
          v-for="key in tabs" :key="key"
          class="tab" :class="{ on: activeTab === key }"
          @click="selectTab(key)"
        >{{ TAB_LABELS[key] }}</button>
      </div>

      <div class="tab-body">
        <div v-if="tabLoading" class="card-empty">불러오는 중…</div>

        <!-- 공통: 개요 — 0027 레거시 사업개요 6섹션(2행×3열) 파리티 -->
        <template v-else-if="activeTab === 'overview'">
          <div class="ov-grid">
            <!-- ① 기본정보 (단계 분기) -->
            <section class="card">
              <h2 class="card-title">기본 정보</h2>
              <dl class="meta ov-meta">
                <template v-if="project.stage === 'BIDDING'">
                  <div><dt>프로젝트 코드</dt><dd>{{ project.projectCode || '—' }}</dd></div>
                  <div><dt>공고번호</dt><dd>{{ project.announcementNo || project.bidNumber || '—' }}</dd></div>
                  <div><dt>발주기관</dt><dd>{{ project.customerName || '—' }}</dd></div>
                  <div><dt>사업예산</dt><dd>{{ fmtAmount(project.budget) }}</dd></div>
                  <div><dt>사업유형</dt><dd>{{ project.businessType || '—' }}</dd></div>
                  <div><dt>제안서 제출마감일</dt><dd>{{ fmtDate(project.proposalDeadline) }}</dd></div>
                  <div><dt>입찰상태</dt><dd>{{ project.bidStatus || '—' }}</dd></div>
                </template>
                <template v-else>
                  <div><dt>상태</dt><dd>{{ projectStatusLabel(project.status) }}</dd></div>
                  <div><dt>사업유형</dt><dd>{{ project.businessType || '—' }}</dd></div>
                  <div><dt>고객사</dt><dd>{{ project.customerName || '—' }}</dd></div>
                  <div><dt>수행장소</dt><dd>{{ project.location || '—' }}</dd></div>
                  <div><dt>담당부서</dt><dd>{{ project.dept || '—' }}</dd></div>
                  <div><dt>기간</dt><dd>{{ fmtDate(project.startDate) }} ~ {{ fmtDate(project.endDate) }}</dd></div>
                  <div><dt>계약금액</dt><dd>{{ fmtAmount(project.projectBudget) }}</dd></div>
                  <div class="wide">
                    <dt>진행률
                      <span v-if="progress && !progress.fallback" class="calc-tag" title="산출물 승인 기준 계산값 (0006 롤업)">계산</span>
                      <span v-else class="calc-tag manual" title="전개 산출물이 없어 수동 입력값을 사용합니다">수동</span>
                    </dt>
                    <dd><ProgressBar :value="progress ? progress.overall : project.progress" /></dd>
                  </div>
                </template>
              </dl>
              <div class="remarks-box">
                <label class="remarks-label">비고</label>
                <textarea v-model="remarksDraft" class="remarks-input" rows="2"
                          placeholder="상태 메모 (저장 시 반영)" :disabled="remarksSaving"></textarea>
                <button class="btn btn-sm" :disabled="remarksSaving || remarksDraft === (project.remarks ?? '')"
                        @click="saveRemarks">{{ remarksSaving ? '저장 중…' : '저장' }}</button>
              </div>
            </section>

            <!-- ② 입찰: 담당조직 정보 / 수행: 프로세스별 진척률 -->
            <section v-if="project.stage === 'BIDDING'" class="card">
              <h2 class="card-title">
                담당조직 정보
                <button v-if="!ownersEditing" class="btn-link" @click="startOwnersEdit">수정</button>
              </h2>
              <dl v-if="!ownersEditing" class="meta ov-meta">
                <div v-for="f in OWNER_FIELDS" :key="f.key">
                  <dt>{{ f.label }}</dt><dd>{{ project[f.key] || '—' }}</dd>
                </div>
              </dl>
              <div v-else class="owners-edit">
                <label v-for="f in OWNER_FIELDS" :key="f.key" class="owner-field">
                  <span>{{ f.label }}</span>
                  <input v-model="ownersDraft[f.key]" class="owner-input" type="text" :disabled="ownersSaving" />
                </label>
                <div class="owners-actions">
                  <button class="btn btn-sm" :disabled="ownersSaving" @click="ownersEditing = false">취소</button>
                  <button class="btn btn-primary btn-sm" :disabled="ownersSaving" @click="saveOwners">
                    {{ ownersSaving ? '저장 중…' : '저장' }}
                  </button>
                </div>
              </div>
            </section>
            <section v-else class="card">
              <h2 class="card-title">
                프로세스별 진척률
                <span v-if="progress && progress.phases.length > 0" class="calc-tag" title="0006 recursive CTE 롤업">계산</span>
              </h2>
              <div v-if="!progress || progress.phases.length === 0" class="card-empty">전개된 프로세스가 없습니다.</div>
              <ul v-else class="phase-progress">
                <li v-for="ph in progress.phases" :key="ph.nodeId">
                  <span class="pp-name">{{ ph.name }}</span>
                  <ProgressBar :value="ph.rate" />
                </li>
              </ul>
            </section>

            <!-- ③ 참여인력 요약 -->
            <section class="card">
              <h2 class="card-title">
                참여 인력
                <span class="title-side">현재 투입 {{ activeMembers.length }}명(총 {{ members.length }}명)</span>
              </h2>
              <label class="chk-line">
                <input v-model="includeExcludedMembers" type="checkbox" /> 제외 인력 포함
              </label>
              <div v-if="shownMembers.length === 0" class="card-empty">참여 인력이 없습니다.</div>
              <ul v-else class="member-brief">
                <li v-for="m in shownMembers.slice(0, 8)" :key="m.memberId">
                  <span class="avatar">{{ initial(m.name) }}</span>
                  <span class="mb-main">
                    <span class="mb-name">
                      {{ m.name }}
                      <span class="mb-emp">{{ employmentTypeLabel(m.employmentType) }}</span>
                      <span v-if="m.isActive === false" class="mb-out">제외</span>
                    </span>
                    <span class="mb-sub">{{ [m.roleName || m.participationRole, m.department].filter(Boolean).join(' · ') || '—' }}</span>
                  </span>
                </li>
              </ul>
              <button class="btn-link more" @click="selectTab('members')">전체보기 →</button>
            </section>

            <!-- ④ 주요 일정 (WBS 타임라인) -->
            <section class="card">
              <h2 class="card-title">주요 일정</h2>
              <div v-if="phaseTimeline.length === 0" class="card-empty">전개된 일정이 없습니다.</div>
              <ul v-else class="timeline">
                <li v-for="t in phaseTimeline" :key="t.nodeId" :class="t.state">
                  <span class="tl-dot">{{ t.state === 'done' ? '✓' : t.state === 'doing' ? '●' : '○' }}</span>
                  <span class="tl-main">
                    <span class="tl-name">{{ t.name }}</span>
                    <span class="tl-sub">{{ fmtDate(t.start) }} ~ {{ fmtDate(t.end) }} · 진척률 {{ t.rate }}%</span>
                  </span>
                </li>
              </ul>
              <button class="btn-link more" @click="selectTab('wbs')">WBS/일정 →</button>
            </section>

            <!-- ⑤ 최근 활동 -->
            <section class="card">
              <h2 class="card-title">최근 활동</h2>
              <div v-if="recentActivities.length === 0" class="card-empty">활동 내역이 없습니다.</div>
              <ul v-else class="activity-brief">
                <li v-for="(a, i) in recentActivities" :key="i">
                  <span class="ab-text">
                    <span class="ab-kind">{{ a.entityType || a.type || '—' }}</span>
                    {{ a.text || '—' }}
                  </span>
                  <span class="ab-date">{{ fmtDate(a.date) }}</span>
                </li>
              </ul>
              <button class="btn-link more" @click="selectTab('activity')">활동로그 →</button>
            </section>

            <!-- ⑥ 현황 요약 (구 연관정보) -->
            <section class="card">
              <h2 class="card-title">현황 요약</h2>
              <ul class="related">
                <li v-for="r in relatedRows" :key="r.tab">
                  <button class="rel-btn" @click="selectTab(r.tab)">
                    <span class="rel-label">{{ r.label }}</span>
                    <span class="rel-count">{{ r.count }}건</span>
                  </button>
                </li>
              </ul>
            </section>

            <!-- 컨소시엄 요약 (기존 유지) -->
            <section class="card">
              <h2 class="card-title">컨소시엄 요약</h2>
              <div v-if="project.consortiumMembers.length === 0" class="card-empty">컨소시엄 구성이 없습니다.</div>
              <ul v-else class="consortium-brief">
                <li v-for="(c, i) in project.consortiumMembers" :key="i">
                  <span class="c-name">{{ c.companyName }}</span>
                  <span class="c-meta">{{ c.role || '—' }}<template v-if="c.shareRate"> · {{ c.shareRate }}%</template></span>
                </li>
              </ul>
            </section>
          </div>
        </template>

        <!-- BIDDING: 제안 태스크 (태스크 → 산출물 트리). 행 클릭 → 상세 패널 -->
        <template v-else-if="activeTab === 'tasks'">
          <div v-if="taskTreeRows.length === 0" class="card-empty">
            테일러링 전개 전입니다 — 프로젝트 생성/테일러링 마법사(Phase 2)에서 태스크·산출물이 전개됩니다.
          </div>
          <ul v-else class="task-tree">
            <li
              v-for="(row, i) in taskTreeRows" :key="i"
              class="tree-row" :style="{ paddingLeft: row.depth * 22 + 'px' }"
            >
              <template v-if="row.kind === 'task' && row.task">
                <span class="type t-TASK">태스크</span>
                <button class="tree-name link" @click="openPanel('task', row.task.id)">{{ row.task.name }}</button>
                <span class="task-status" :class="'ts-' + row.task.status">
                  {{ TASK_STATUS_LABELS[row.task.status] ?? row.task.status }}
                </span>
                <span class="tree-meta">
                  <template v-if="row.task.plannedStartDate || row.task.plannedEndDate">
                    {{ fmtDate(row.task.plannedStartDate) }} ~ {{ fmtDate(row.task.plannedEndDate) }} ·
                  </template>
                  {{ row.task.progress }}%
                  <span v-if="taskHasDeliverable(row.task.id)" class="calc-tag" title="하위 산출물 상태 기준 자동 계산">계산</span>
                </span>
              </template>
              <template v-else-if="row.artifact">
                <span class="type t-DELIVERABLE">산출물</span>
                <button class="tree-name link" @click="openPanel('artifact', row.artifact.id)">{{ row.artifact.name }}</button>
                <StatusBadge :status="row.artifact.status" />
              </template>
            </li>
          </ul>
        </template>

        <!-- BIDDING: 컨소시엄 (0039 — 구성원 CRUD + 지분율 합계 검증) -->
        <template v-else-if="activeTab === 'consortium'">
          <div class="tab-toolbar">
            <button class="btn btn-primary btn-sm" :disabled="!apiMode"
              :title="apiMode ? '' : '등록은 백엔드 연결 후 활성화'"
              @click="openConsortiumForm(null)">+ 구성원 추가</button>
            <span v-if="!apiMode" class="gate-hint">등록은 백엔드(API_BASE) 연결 후 활성화</span>
          </div>
          <p v-if="consortiumError" class="err-line">{{ consortiumError }}</p>
          <div v-if="consortiumMembers.length === 0" class="card-empty">컨소시엄 구성이 없습니다.</div>
          <template v-else>
            <table class="grid">
              <thead>
                <tr><th>회사명</th><th>역할</th><th class="num">지분율 (%)</th><th>담당자</th><th>연락처</th><th>이메일</th><th>비고</th><th>작업</th></tr>
              </thead>
              <tbody>
                <tr v-for="c in consortiumMembers" :key="c.id ?? c.companyName">
                  <td class="name">{{ c.companyName }}</td>
                  <td><span class="role-chip" :class="{ lead: c.role === '주사업자' }">{{ c.role || '—' }}</span></td>
                  <td class="num">{{ c.shareRate }}%</td>
                  <td>{{ c.contactName || '—' }}</td>
                  <td class="muted">{{ c.contactPhone || '—' }}</td>
                  <td class="muted">{{ c.contactEmail || '—' }}</td>
                  <td class="muted">{{ c.description || '—' }}</td>
                  <td class="cell-actions">
                    <button class="btn btn-sm" :disabled="!apiMode" @click="openConsortiumForm(c)">수정</button>
                    <button class="btn btn-sm danger" :disabled="!apiMode" @click="removeConsortiumMember(c)">삭제</button>
                  </td>
                </tr>
              </tbody>
            </table>
            <div class="share-foot">
              <span>총 지분율: <b :class="{ bad: !consortiumBalanced }">{{ consortiumTotal }}%</b></span>
              <span v-if="!consortiumBalanced" class="share-warn">⚠ 총합이 100%가 아닙니다.</span>
            </div>
          </template>
        </template>

        <!-- 배치21: 참여인력 — 목록(페이징) + 등록 (자체 로드) -->
        <template v-else-if="activeTab === 'members'">
          <ProjectMembers :project-id="projectId" />
        </template>

        <!-- 이슈/리스크 — 제목 클릭 → 상세 패널(인라인 편집 제거) -->
        <template v-else-if="activeTab === 'issues'">
          <div class="tab-toolbar">
            <button class="btn btn-primary btn-sm" :disabled="!apiMode"
              :title="apiMode ? '' : '등록은 백엔드 연결 후 활성화'"
              @click="showIssueForm = true">+ 등록</button>
            <span v-if="!apiMode" class="gate-hint">등록은 백엔드(API_BASE) 연결 후 활성화</span>
          </div>
          <div v-if="issues.length === 0" class="card-empty">등록된 이슈가 없습니다.</div>
          <table v-else class="grid">
            <thead><tr><th>제목</th><th>유형</th><th>우선순위</th><th>담당</th><th>발생일</th><th>목표해결일</th><th>상태</th></tr></thead>
            <tbody>
              <tr v-for="i in issues" :key="i.id" class="row" @click="openPanel('issue', i.id)">
                <td class="name">
                  <span class="link">{{ i.title }}</span>
                  <span v-if="i.sourceRuleId != null" class="auto-badge" title="신호 규칙으로 자동 등록된 리스크 (0007)">자동</span>
                  <span v-else class="manual-badge" title="수동 등록">수동</span>
                </td>
                <td>{{ i.type || '—' }}</td>
                <td>{{ i.priority || '—' }}</td>
                <td>{{ i.owner || '—' }}</td>
                <td>{{ fmtDate(i.reportedDate) }}</td>
                <td>{{ fmtDate(i.dueDate) }}</td>
                <td>{{ i.status || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </template>

        <template v-else-if="activeTab === 'action-items'">
          <div class="tab-toolbar">
            <button class="btn btn-primary btn-sm" :disabled="!apiMode"
              :title="apiMode ? '' : '등록은 백엔드 연결 후 활성화'"
              @click="showActionForm = true">+ 등록</button>
            <span v-if="!apiMode" class="gate-hint">등록은 백엔드(API_BASE) 연결 후 활성화</span>
          </div>
          <div v-if="actionItems.length === 0" class="card-empty">등록된 액션아이템이 없습니다.</div>
          <table v-else class="grid">
            <thead><tr><th>제목</th><th>담당</th><th>마감일</th><th>상태</th><th>확인 코멘트</th></tr></thead>
            <tbody>
              <tr v-for="a in actionItems" :key="a.id" class="row" @click="openPanel('action', a.id)">
                <td class="name"><span class="link">{{ a.title }}</span></td>
                <td>{{ a.assignee || '—' }}</td>
                <td>{{ fmtDate(a.dueDate) }}</td>
                <td>{{ a.status || '—' }}</td>
                <td class="muted">{{ a.confirmComment || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </template>

        <!-- 배치20: WBS/일정 — 왼쪽 표(진척 숫자) + 오른쪽 날짜축 간트 -->
        <template v-else-if="activeTab === 'wbs'">
          <div v-if="!apiMode" class="card-empty">
            WBS/일정은 백엔드(API_BASE) 연결 후 표시됩니다.
          </div>
          <WbsSchedule v-else-if="wbs" :wbs="wbs" />
          <div v-else class="card-empty">WBS 데이터를 불러올 수 없습니다.</div>
        </template>

        <!-- 0031: 간트차트 — 계획·실적 이중 바(기존 WBS 탭 유지, 별도 탭) -->
        <template v-else-if="activeTab === 'gantt'">
          <div v-if="!apiMode" class="card-empty">간트차트는 백엔드(API_BASE) 연결 후 표시됩니다.</div>
          <WbsGantt v-else-if="wbs" :wbs="wbs" />
          <div v-else class="card-empty">WBS 데이터를 불러올 수 없습니다.</div>
        </template>

        <template v-else-if="activeTab === 'artifacts'">
          <div v-if="artifacts.length === 0" class="card-empty">등록된 산출물이 없습니다.</div>
          <table v-else class="grid">
            <thead><tr><th>산출물명</th><th>분류</th><th>버전</th><th>작성자</th><th>마감일</th><th>제출일</th><th>상태</th></tr></thead>
            <tbody>
              <tr v-for="a in artifacts" :key="a.id" class="row" @click="openPanel('artifact', a.id)">
                <td class="name"><span class="link">{{ a.name }}</span></td>
                <td>{{ a.category || '—' }}</td>
                <td>{{ a.version || '—' }}</td>
                <td>{{ a.author || '—' }}</td>
                <td>{{ fmtDate(a.dueDate) }}</td>
                <td>{{ a.submitDate || '—' }}</td>
                <td><StatusBadge :status="a.status" /></td>
              </tr>
            </tbody>
          </table>
        </template>

        <template v-else-if="activeTab === 'meeting-minutes'">
          <div class="tab-toolbar">
            <button class="btn btn-primary btn-sm" :disabled="!apiMode"
              :title="apiMode ? '' : '등록은 백엔드 연결 후 활성화'"
              @click="showMeetingForm = true">+ 등록</button>
            <span v-if="!apiMode" class="gate-hint">등록은 백엔드(API_BASE) 연결 후 활성화</span>
          </div>
          <div v-if="meetings.length === 0" class="card-empty">등록된 회의록이 없습니다.</div>
          <table v-else class="grid">
            <thead><tr><th>제목</th><th>회의일</th><th>참석자</th><th>비고</th></tr></thead>
            <tbody>
              <tr v-for="m in meetings" :key="m.id" class="row" @click="openMeeting(m.id)">
                <td class="name">{{ m.title }}</td>
                <td>{{ fmtDate(m.meetDate) }}</td>
                <td class="muted">{{ attendeesText(m.attendees) }}</td>
                <td class="muted">{{ m.remarks || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </template>

        <!-- BIDDING: VRB 심의 정보 (0039 — 수정 지원) -->
        <template v-else-if="activeTab === 'vrb'">
          <div class="tab-toolbar vrb-toolbar">
            <h3 class="vrb-title">VRB 심의 정보</h3>
            <button class="btn btn-primary btn-sm" :disabled="!apiMode"
              :title="apiMode ? '' : '수정은 백엔드 연결 후 활성화'"
              @click="showVrbForm = true">VRB 정보 수정</button>
          </div>
          <dl class="meta vrb-meta">
            <div><dt>진행 상태</dt><dd class="strong">{{ vrb?.status || '미상신' }}</dd></div>
            <div><dt>심의번호</dt><dd>{{ vrb?.vrbNumber || '—' }}</dd></div>
            <div><dt>상신 예정일</dt><dd>{{ fmtDate(vrb?.plannedDate) }}</dd></div>
            <div><dt>실제 상신일</dt><dd>{{ fmtDate(vrb?.submittedDate) }}</dd></div>
            <div><dt>승인/반려일</dt><dd>{{ fmtDate(vrb?.approvedDate) }}</dd></div>
            <div class="wide"><dt>VRB 심의 메모</dt><dd>{{ vrb?.memo || '등록된 메모가 없습니다.' }}</dd></div>
          </dl>
        </template>

        <template v-else-if="activeTab === 'official-docs'">
          <div v-if="officialDocs.length === 0" class="card-empty">등록된 공문이 없습니다.</div>
          <table v-else class="grid">
            <thead><tr><th>문서번호</th><th>제목</th><th>구분</th><th>기안부서</th><th>기안자</th><th>현재 상태</th></tr></thead>
            <tbody>
              <tr v-for="d in officialDocs" :key="d.id">
                <td class="code">{{ d.docNumber || '—' }}</td>
                <td class="name">{{ d.title }}</td>
                <td>{{ d.category || '—' }}</td>
                <td>{{ d.draftDept || '—' }}</td>
                <td>{{ d.drafter || '—' }}</td>
                <td>{{ d.currentStatus || '—' }}</td>
              </tr>
            </tbody>
          </table>
          <p class="hint">결재라인 상세는 아마란스 전자결재 연계(0005) 이후 제공됩니다.</p>
        </template>

        <template v-else-if="activeTab === 'activity'">
          <div v-if="activities.length === 0" class="card-empty">활동 로그가 없습니다.</div>
          <table v-else class="grid">
            <thead><tr><th>일시</th><th>대상</th><th>동작</th><th>사유</th><th>변경자</th></tr></thead>
            <tbody>
              <tr v-for="a in activitiesSorted" :key="a.id">
                <td class="code">{{ fmtDate(a.date) }}</td>
                <td>{{ a.entityType || '—' }}<span v-if="a.entityId != null" class="muted"> #{{ a.entityId }}</span></td>
                <td>{{ actionLabel(a.type) }}</td>
                <td class="muted">{{ a.text || '—' }}</td>
                <td>{{ a.userName || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </template>
      </div>

      <!-- ==== 상세 패널(사이드 드로어) ==== -->
      <SideDrawer v-if="panelTarget" @close="closePanel">
        <DetailPanel
          v-if="panelIssue" kind="issue" :issue="panelIssue" :project-id="projectId"
          :highlight-comment-id="highlightCommentId" @close="closePanel" @changed="onPanelChanged"
        />
        <DetailPanel
          v-else-if="panelAction" kind="action" :action="panelAction" :project-id="projectId"
          :highlight-comment-id="highlightCommentId" @close="closePanel" @changed="onPanelChanged"
        />
        <DetailPanel
          v-else-if="panelArtifact" kind="artifact" :artifact="panelArtifact" :project-id="projectId"
          :highlight-comment-id="highlightCommentId" @close="closePanel" @changed="onPanelChanged"
        />
        <DetailPanel
          v-else-if="panelTask" kind="task" :task="panelTask" :project-id="projectId"
          :highlight-comment-id="highlightCommentId" @close="closePanel" @changed="onPanelChanged"
        />
        <div v-else class="panel-missing">
          대상을 찾을 수 없습니다 — 목록이 갱신되었거나 접근 권한이 없을 수 있습니다.
          <button class="btn btn-sm" @click="closePanel">닫기</button>
        </div>
      </SideDrawer>

      <SideDrawer v-if="openMeetingId != null" @close="closeMeetingPanel">
        <MeetingDetailPanel
          :meeting-id="openMeetingId" :project-id="projectId"
          :highlight-comment-id="highlightCommentId" @close="closeMeetingPanel" @changed="onMeetingChanged"
        />
      </SideDrawer>

      <VrbFormModal
        v-if="showVrbForm" :project-id="projectId" :vrb="vrb"
        @saved="onVrbSaved" @close="showVrbForm = false"
      />

      <ConsortiumMemberFormModal
        v-if="consortiumForm" :project-id="projectId" :member="consortiumForm.member"
        :others-total="consortiumOthersTotal"
        @saved="onConsortiumSaved" @close="consortiumForm = null"
      />

      <!-- ==== 신규 등록 폼 ==== -->
      <IssueFormModal
        v-if="showIssueForm" :project-id="projectId"
        @created="onIssueCreated" @close="showIssueForm = false"
      />
      <ActionItemFormModal
        v-if="showActionForm" :project-id="projectId"
        @created="onActionCreated" @close="showActionForm = false"
      />
      <MeetingMinuteFormModal
        v-if="showMeetingForm" :project-id="projectId"
        @created="onMeetingCreated" @close="showMeetingForm = false"
      />

      <!-- 0039 — 입찰 결과 확정(수주/실패) 선택 -->
      <ModalShell v-if="showBidOutcome" title="입찰 상태 전환" @close="showBidOutcome = false">
        <p class="outcome-lead">이 입찰의 결과를 선택하세요.</p>
        <button class="outcome-opt win" type="button" :disabled="bidOutcomeSaving" @click="chooseWin">
          <span class="outcome-name">수주</span>
          <span class="outcome-desc">수행 프로젝트를 생성합니다 — 이어서 정보 보완·테일러링 선택 화면이 열립니다.</span>
        </button>
        <button class="outcome-opt lose" type="button" :disabled="bidOutcomeSaving" @click="chooseLose">
          <span class="outcome-name">실패</span>
          <span class="outcome-desc">수행 프로젝트 없이 이 입찰을 실패로 마감합니다(입찰상태 실패 · 사업상태 완료).</span>
        </button>
        <p v-if="bidOutcomeSaving" class="outcome-msg">처리 중…</p>
        <p v-if="bidOutcomeError" class="outcome-msg err">{{ bidOutcomeError }}</p>
      </ModalShell>

      <!-- 배치18 — 프로젝트 수정 -->
      <ExecConvertWizard
        v-if="showConvertWizard && project"
        :project="project"
        @converted="onConverted"
        @close="showConvertWizard = false"
      />

      <ProjectFormModal
        v-if="showEditForm" mode="edit" :project="project"
        @saved="onProjectSaved" @close="showEditForm = false"
      />
    </template>
  </div>
</template>

<style scoped>
.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
.title { font-size: 22px; margin: 0 0 4px; display: flex; align-items: center; gap: 10px; }
.head-badge { flex-shrink: 0; }
.sub { color: var(--muted); font-size: 14px; margin: 0; }
.code { font-family: ui-monospace, monospace; }
.head-actions { display: flex; align-items: center; gap: 12px; flex-shrink: 0; margin-top: 4px; }
.back { font-size: 14px; flex-shrink: 0; }
.auto-badge {
  font-size: 11px; font-weight: 600; color: var(--accent);
  border: 1px solid var(--accent); border-radius: 999px; padding: 0 6px; margin-left: 6px;
}

.src-card {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px; margin-bottom: 14px;
  background: var(--panel); border: 1px solid var(--accent); border-radius: 8px;
  font-size: 14px; color: var(--text);
}
.src-card:hover { text-decoration: none; background: var(--panel-2); }
.src-label { color: var(--accent); font-weight: 600; font-size: 13px; }
.src-name { font-weight: 600; }
.src-go { margin-left: auto; color: var(--muted); font-size: 13px; }

.cards { display: grid; grid-template-columns: 1.2fr 1fr; gap: 12px; }
/* 개요 하단: 프로세스별 진척률 + 컨소시엄 요약 = 동일 폭 2열 */
.cards-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; }

/* ---- 0027 헤더 KPI 6카드 + D-Day ---- */
.kpi-row {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px; margin: 0 0 16px;
}
.kpi {
  background: var(--panel); border: 1px solid var(--border); border-radius: 10px;
  padding: 10px 14px; display: flex; flex-direction: column; gap: 4px; min-width: 0;
}
.kpi-k { font-size: 12px; color: var(--muted); }
.kpi-v { font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kpi-progress { overflow: visible; }
.dday-badge {
  display: inline-block; margin-left: 8px; padding: 3px 10px; border-radius: 999px;
  font-size: 13px; font-weight: 700; vertical-align: middle;
}
.dday-badge.dday-norm { background: var(--panel-2); color: var(--muted); }
.dday-badge.dday-hot { background: color-mix(in srgb, #e5a13d 20%, transparent); color: #e5a13d; }
.dday-badge.dday-over { background: color-mix(in srgb, #e5484d 18%, transparent); color: #e5484d; }
.dday-badge.dday-none { background: var(--panel-2); color: var(--muted); }

/* ---- 0027 개요 6섹션 그리드 ---- */
.ov-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
@media (max-width: 1100px) { .ov-grid { grid-template-columns: 1fr 1fr; } }
.ov-meta { grid-template-columns: 1fr; }
.title-side { font-size: 12.5px; color: var(--muted); font-weight: 500; margin-left: 8px; }
.btn-link {
  border: 0; background: transparent; color: var(--accent);
  font-size: 13px; font-weight: 600; cursor: pointer; padding: 0 4px; margin-left: 6px;
}
.btn-link.more { display: block; margin: 10px 0 0; padding: 0; }
.chk-line { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--muted); cursor: pointer; margin-bottom: 8px; }

.remarks-box { margin-top: 12px; display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
.remarks-label { font-size: 12px; color: var(--muted); }
.remarks-input {
  width: 100%; box-sizing: border-box; background: var(--bg); border: 1px solid var(--border);
  border-radius: 8px; color: var(--text); font-size: 13.5px; padding: 8px 10px; outline: none;
  font-family: inherit; resize: vertical;
}
.remarks-input:focus { border-color: var(--accent); }

.owners-edit { display: flex; flex-direction: column; gap: 8px; }
.owner-field { display: grid; grid-template-columns: 120px 1fr; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); }
.owner-input {
  background: var(--bg); border: 1px solid var(--border); border-radius: 6px;
  color: var(--text); font-size: 13.5px; padding: 6px 8px; outline: none; width: 100%;
}
.owner-input:focus { border-color: var(--accent); }
.owners-actions { display: flex; gap: 8px; justify-content: flex-end; }

.member-brief { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.member-brief li { display: flex; align-items: center; gap: 10px; }
.avatar {
  width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
  background: color-mix(in srgb, var(--accent) 25%, transparent); color: var(--accent);
  display: inline-flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700;
}
.mb-main { display: flex; flex-direction: column; min-width: 0; }
.mb-name { font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
.mb-emp {
  font-size: 11.5px; font-weight: 600; padding: 1px 6px; border-radius: 999px;
  background: var(--panel-2); color: var(--muted);
}
.mb-out {
  font-size: 11.5px; font-weight: 600; padding: 1px 6px; border-radius: 999px;
  background: color-mix(in srgb, #e5484d 18%, transparent); color: #e5484d;
}
.mb-sub { font-size: 12.5px; color: var(--muted); }

.timeline { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.timeline li { display: flex; gap: 10px; align-items: flex-start; }
.tl-dot { width: 18px; text-align: center; font-size: 13px; color: var(--muted); flex-shrink: 0; }
.timeline li.done .tl-dot { color: #34d399; }
.timeline li.doing .tl-dot { color: var(--accent); }
.tl-main { display: flex; flex-direction: column; min-width: 0; }
.tl-name { font-size: 14px; font-weight: 600; }
.tl-sub { font-size: 12.5px; color: var(--muted); }

.activity-brief { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.activity-brief li { display: flex; justify-content: space-between; gap: 10px; font-size: 13.5px; }
.ab-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ab-kind { color: var(--muted); font-size: 12px; margin-right: 4px; font-family: ui-monospace, monospace; }
.ab-date { color: var(--muted); font-size: 12.5px; white-space: nowrap; }

.related { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.rel-btn {
  width: 100%; display: flex; justify-content: space-between; align-items: center;
  background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); font-size: 13.5px; padding: 8px 12px; cursor: pointer; font-family: inherit;
}
.rel-btn:hover { border-color: var(--accent); }
.rel-count { font-weight: 700; color: var(--accent); }
.card { background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 18px 20px; }
.card-title { font-size: 15px; margin: 0 0 14px; }
.card-empty { font-size: 14px; color: var(--muted); padding: 8px 0; }

/* 밀도 있는 필드 그리드 — 넓은 화면일수록 열이 늘어 여백을 채움 */
.meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 14px 28px; margin: 0; }
.meta > div { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.meta .wide { grid-column: 1 / -1; }
.meta dt { font-size: 12px; color: var(--muted); }
.meta dd { margin: 0; font-size: 14.5px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; }
.vrb-meta { background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 16px; }

.consortium-brief { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.consortium-brief li { display: flex; align-items: baseline; gap: 8px; font-size: 14px; }
.c-name { font-weight: 600; }
.c-meta { color: var(--muted); font-size: 13px; }

.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); margin-bottom: 14px; flex-wrap: wrap; }
.tab {
  border: 0; background: transparent; color: var(--muted);
  font-size: 14px; padding: 8px 14px; cursor: pointer;
  border-bottom: 2px solid transparent; margin-bottom: -1px;
}
.tab:hover { color: var(--text); }
.tab.on { color: var(--text); border-bottom-color: var(--accent); font-weight: 600; }

/* 제안 태스크 트리 */
.task-tree { list-style: none; margin: 0; padding: 0; }
.tree-row {
  display: flex; align-items: center; gap: 8px;
  padding-top: 6px; padding-bottom: 6px; padding-right: 8px;
  font-size: 14px; border-bottom: 1px solid var(--border);
}
.tree-row:last-child { border-bottom: 0; }
.type {
  flex-shrink: 0; font-size: 11px; font-weight: 600;
  padding: 1px 7px; border-radius: 999px; background: var(--panel-2); color: var(--muted);
}
.t-TASK { color: var(--green); background: rgba(52, 211, 153, 0.12); }
.t-DELIVERABLE { color: var(--yellow); background: rgba(251, 191, 36, 0.12); }
.tree-name { font-weight: 600; min-width: 0; }
.tree-meta { margin-left: auto; font-size: 13px; color: var(--muted); white-space: nowrap; }
.task-status {
  flex-shrink: 0; font-size: 12px; font-weight: 600;
  padding: 1px 8px; border-radius: 999px; background: var(--panel-2); color: var(--muted);
}
.ts-IN_PROGRESS { color: var(--blue); background: rgba(59, 130, 246, 0.12); }
.ts-REVIEW { color: var(--yellow); background: rgba(251, 191, 36, 0.12); }
.ts-REJECTED { color: var(--red); background: rgba(239, 68, 68, 0.12); }
.ts-DONE { color: var(--green); background: rgba(52, 211, 153, 0.12); }

.grid { border-collapse: collapse; width: 100%; font-size: 14px; }
.grid th, .grid td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--border); }
.grid th { color: var(--muted); font-weight: 600; font-size: 13px; }
.row { cursor: pointer; }
.row:hover { background: var(--panel); }
.name { font-weight: 600; }
.muted { color: var(--muted); }
.hint { font-size: 13px; color: var(--muted); margin: 10px 0 0; }

/* 제목/명 클릭 링크(상세 패널 진입점) */
.link {
  border: 0; background: transparent; padding: 0; cursor: pointer;
  color: var(--accent); font-size: inherit; font-family: inherit; font-weight: 600; text-align: left;
}
.link:hover { text-decoration: underline; }

.wide-card { grid-column: 1 / -1; }
.calc-tag {
  font-size: 11px; font-weight: 600; color: var(--blue); margin-left: 6px;
  border: 1px solid var(--blue); border-radius: 999px; padding: 0 6px;
  background: rgba(59, 130, 246, 0.08);
}
.calc-tag.manual { color: var(--muted); border-color: var(--border); background: transparent; }
.phase-progress { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.phase-progress li { display: flex; align-items: center; gap: 12px; font-size: 14px; }
.pp-name { min-width: 140px; }

.manual-badge {
  font-size: 11px; font-weight: 600; color: var(--muted);
  border: 1px solid var(--border); border-radius: 999px; padding: 0 6px; margin-left: 6px;
}
.tab-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
/* 0039 — 입찰 결과 확정 선택 */
.outcome-lead { margin: 0; font-size: 13.5px; color: var(--muted); }
.outcome-opt {
  display: flex; flex-direction: column; gap: 4px; text-align: left; width: 100%;
  border: 1px solid var(--border); background: var(--bg); color: var(--text);
  border-radius: 10px; padding: 12px 14px; cursor: pointer; font-family: inherit;
}
.outcome-opt:hover:not(:disabled) { border-color: var(--accent); background: var(--panel); }
.outcome-opt:disabled { opacity: 0.55; cursor: default; }
.outcome-opt.win .outcome-name { color: var(--green); }
.outcome-opt.lose .outcome-name { color: var(--red); }
.outcome-name { font-size: 15px; font-weight: 700; }
.outcome-desc { font-size: 12.5px; color: var(--muted); }
.outcome-msg { margin: 0; font-size: 12.5px; color: var(--muted); }
.outcome-msg.err { color: var(--red); }

.vrb-toolbar { justify-content: space-between; }
.vrb-title { font-size: 14px; margin: 0; }
.vrb-meta .strong { font-weight: 700; }

/* 0039 — 컨소시엄 탭 */
.grid .num { text-align: right; font-variant-numeric: tabular-nums; }
.cell-actions { display: flex; gap: 6px; }
.btn.danger { border-color: var(--red); color: var(--red); }
.err-line { color: var(--red); font-size: 13px; margin: 0 0 10px; }
.role-chip {
  font-size: 11.5px; font-weight: 600; padding: 2px 8px; border-radius: 999px;
  background: var(--panel-2, var(--panel)); color: var(--muted); border: 1px solid var(--border);
}
.role-chip.lead { color: var(--accent); border-color: var(--accent); background: rgba(139, 92, 246, 0.12); }
.share-foot {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  margin-top: 10px; padding: 10px 12px; border-radius: 8px;
  background: var(--panel); border: 1px solid var(--border); font-size: 13.5px;
}
.share-foot b.bad { color: var(--red); }
.share-warn { color: var(--red); font-size: 12.5px; font-weight: 600; }
.gate-hint { font-size: 13px; color: var(--muted); }
.panel-missing {
  padding: 24px; display: flex; flex-direction: column; gap: 12px;
  font-size: 14px; color: var(--muted);
}

@media (max-width: 900px) { .cards { grid-template-columns: 1fr; } .cards-2 { grid-template-columns: 1fr; } }
</style>
