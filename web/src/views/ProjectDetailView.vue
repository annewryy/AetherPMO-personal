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
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { dataClient } from '../lib/dataClient';
import type {
  Project, Issue, ActionItem, Artifact, MeetingMinute, VrbInfo, OfficialDoc, Activity, Task,
  ProjectProgress, ProjectWbs,
} from '../types';
import StageBadge from '../components/StageBadge.vue';
import ProgressBar from '../components/ProgressBar.vue';
import StatusBadge from '../components/StatusBadge.vue';
import StateNotice from '../components/StateNotice.vue';
import SideDrawer from '../components/SideDrawer.vue';
import DetailPanel, { type DetailKind } from '../components/DetailPanel.vue';
import IssueFormModal from '../components/IssueFormModal.vue';
import ActionItemFormModal from '../components/ActionItemFormModal.vue';
import MeetingMinuteFormModal from '../components/MeetingMinuteFormModal.vue';
import WbsSchedule from '../components/WbsSchedule.vue';
import ProjectFormModal from '../components/ProjectFormModal.vue';
import ProjectMembers from '../components/ProjectMembers.vue';

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
  | 'wbs'                                                       // 배치20 WBS/일정
  | 'artifacts' | 'meeting-minutes' | 'issues' | 'action-items' | 'official-docs'; // EXECUTION

const TAB_LABELS: Record<TabKey, string> = {
  overview: '개요', activity: '활동로그',
  members: '참여인력',
  tasks: '제안 태스크', consortium: '컨소시엄', vrb: 'VRB',
  wbs: 'WBS/일정',
  artifacts: '산출물', 'meeting-minutes': '회의록', issues: '이슈/리스크',
  'action-items': '액션아이템', 'official-docs': '공문',
};

const tabs = computed<TabKey[]>(() => {
  if (!project.value) return [];
  // WBS/일정: 실행 단계 핵심. BIDDING(제안 일정)에서도 노출.
  // 참여인력: 입찰·실행 공통(유경님 요구 §1).
  const stageTabs: TabKey[] =
    project.value.stage === 'BIDDING'
      ? ['tasks', 'wbs', 'consortium', 'vrb', 'members']
      : ['wbs', 'artifacts', 'meeting-minutes', 'issues', 'action-items', 'official-docs', 'members'];
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
  // members는 컴포넌트가 자체 로드(GET /members) — 여기서는 지연로드 대상 아님.
  const needsLoad = !['overview', 'consortium', 'members'].includes(key);
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
  try {
    project.value = await dataClient.projects.get(projectId.value);
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
}

watch(projectId, loadProject, { immediate: true });
watch(activeTab, (t) => loadTab(t));
watch(() => route.query.panel, applyPanelQuery);
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
          </h1>
          <p class="sub">
            <span class="code">{{ project.projectCode || '—' }}</span>
            <span v-if="project.desc"> · {{ project.desc }}</span>
          </p>
        </div>
        <div class="head-actions">
          <button class="btn" @click="showEditForm = true">수정</button>
          <RouterLink to="/projects" class="back">← 목록</RouterLink>
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

        <!-- 공통: 개요 -->
        <template v-else-if="activeTab === 'overview'">
          <section class="card">
            <h2 class="card-title">개요</h2>
            <dl class="meta">
              <div><dt>상태</dt><dd>{{ project.status || '—' }}</dd></div>
              <div><dt>단계</dt><dd>{{ project.stage || '—' }}</dd></div>
              <div><dt>사업유형</dt><dd>{{ project.businessType || '—' }}</dd></div>
              <div><dt>고객사</dt><dd>{{ project.customerName || '—' }}</dd></div>
              <div><dt>수행장소</dt><dd>{{ project.location || '—' }}</dd></div>
              <div><dt>담당부서</dt><dd>{{ project.dept || '—' }}</dd></div>
              <div><dt>PM</dt><dd>{{ project.manager || '—' }}</dd></div>
              <div><dt>기간</dt><dd>{{ fmtDate(project.startDate) }} ~ {{ fmtDate(project.endDate) }}</dd></div>
              <div><dt>계약금액</dt><dd>{{ fmtAmount(project.projectBudget) }}</dd></div>
              <div class="wide">
                <dt>진행률
                  <span v-if="progress && !progress.fallback" class="calc-tag" title="산출물 승인 기준 계산값 (0006 롤업)">계산</span>
                  <span v-else class="calc-tag manual" title="전개 산출물이 없어 수동 입력값을 사용합니다">수동</span>
                </dt>
                <dd><ProgressBar :value="progress ? progress.overall : project.progress" /></dd>
              </div>
            </dl>
          </section>

          <div class="cards-2">
            <section class="card">
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
                  <span v-if="taskHasDeliverable(row.task.id)" class="calc-tag" title="산출물 승인 기준 계산 우선">계산</span>
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

        <!-- BIDDING: 컨소시엄 (상세) -->
        <template v-else-if="activeTab === 'consortium'">
          <div v-if="project.consortiumMembers.length === 0" class="card-empty">컨소시엄 구성이 없습니다.</div>
          <table v-else class="grid">
            <thead><tr><th>회사</th><th>역할</th><th>지분율</th><th>비고</th></tr></thead>
            <tbody>
              <tr v-for="(c, i) in project.consortiumMembers" :key="i">
                <td class="name">{{ c.companyName }}</td>
                <td>{{ c.role || '—' }}</td>
                <td>{{ c.shareRate ? c.shareRate + '%' : '—' }}</td>
                <td class="muted">{{ c.description || '—' }}</td>
              </tr>
            </tbody>
          </table>
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
              <tr v-for="m in meetings" :key="m.id">
                <td class="name">{{ m.title }}</td>
                <td>{{ fmtDate(m.meetDate) }}</td>
                <td class="muted">{{ attendeesText(m.attendees) }}</td>
                <td class="muted">{{ m.remarks || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </template>

        <template v-else-if="activeTab === 'vrb'">
          <div v-if="!vrb" class="card-empty">VRB 정보가 없습니다(미상신).</div>
          <dl v-else class="meta vrb-meta">
            <div><dt>상신 상태</dt><dd>{{ vrb.status }}</dd></div>
            <div><dt>VRB 번호</dt><dd>{{ vrb.vrbNumber || '—' }}</dd></div>
            <div><dt>상신 예정일</dt><dd>{{ fmtDate(vrb.plannedDate) }}</dd></div>
            <div><dt>상신일</dt><dd>{{ fmtDate(vrb.submittedDate) }}</dd></div>
            <div><dt>승인일</dt><dd>{{ fmtDate(vrb.approvedDate) }}</dd></div>
            <div class="wide"><dt>메모</dt><dd>{{ vrb.memo || '—' }}</dd></div>
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
                <td>{{ a.type }}</td>
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

      <!-- 배치18 — 프로젝트 수정 -->
      <ProjectFormModal
        v-if="showEditForm" mode="edit" :project="project"
        @saved="onProjectSaved" @close="showEditForm = false"
      />
    </template>
  </div>
</template>

<style scoped>
.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
.title { font-size: 20px; margin: 0 0 4px; display: flex; align-items: center; gap: 10px; }
.head-badge { flex-shrink: 0; }
.sub { color: var(--muted); font-size: 13px; margin: 0; }
.code { font-family: ui-monospace, monospace; }
.head-actions { display: flex; align-items: center; gap: 12px; flex-shrink: 0; margin-top: 4px; }
.back { font-size: 13px; flex-shrink: 0; }
.auto-badge {
  font-size: 10px; font-weight: 600; color: var(--accent);
  border: 1px solid var(--accent); border-radius: 999px; padding: 0 6px; margin-left: 6px;
}

.src-card {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px; margin-bottom: 14px;
  background: var(--panel); border: 1px solid var(--accent); border-radius: 8px;
  font-size: 13px; color: var(--text);
}
.src-card:hover { text-decoration: none; background: var(--panel-2); }
.src-label { color: var(--accent); font-weight: 600; font-size: 12px; }
.src-name { font-weight: 600; }
.src-go { margin-left: auto; color: var(--muted); font-size: 12px; }

.cards { display: grid; grid-template-columns: 1.2fr 1fr; gap: 12px; }
/* 개요 하단: 프로세스별 진척률 + 컨소시엄 요약 = 동일 폭 2열 */
.cards-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; }
.card { background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 18px 20px; }
.card-title { font-size: 14px; margin: 0 0 14px; }
.card-empty { font-size: 13px; color: var(--muted); padding: 8px 0; }

/* 밀도 있는 필드 그리드 — 넓은 화면일수록 열이 늘어 여백을 채움 */
.meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 14px 28px; margin: 0; }
.meta > div { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.meta .wide { grid-column: 1 / -1; }
.meta dt { font-size: 11px; color: var(--muted); }
.meta dd { margin: 0; font-size: 13.5px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; }
.vrb-meta { background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 16px; }

.consortium-brief { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.consortium-brief li { display: flex; align-items: baseline; gap: 8px; font-size: 13px; }
.c-name { font-weight: 600; }
.c-meta { color: var(--muted); font-size: 12px; }

.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); margin-bottom: 14px; flex-wrap: wrap; }
.tab {
  border: 0; background: transparent; color: var(--muted);
  font-size: 13px; padding: 8px 14px; cursor: pointer;
  border-bottom: 2px solid transparent; margin-bottom: -1px;
}
.tab:hover { color: var(--text); }
.tab.on { color: var(--text); border-bottom-color: var(--accent); font-weight: 600; }

/* 제안 태스크 트리 */
.task-tree { list-style: none; margin: 0; padding: 0; }
.tree-row {
  display: flex; align-items: center; gap: 8px;
  padding-top: 6px; padding-bottom: 6px; padding-right: 8px;
  font-size: 13px; border-bottom: 1px solid var(--border);
}
.tree-row:last-child { border-bottom: 0; }
.type {
  flex-shrink: 0; font-size: 10px; font-weight: 600;
  padding: 1px 7px; border-radius: 999px; background: var(--panel-2); color: var(--muted);
}
.t-TASK { color: var(--green); background: rgba(52, 211, 153, 0.12); }
.t-DELIVERABLE { color: var(--yellow); background: rgba(251, 191, 36, 0.12); }
.tree-name { font-weight: 600; min-width: 0; }
.tree-meta { margin-left: auto; font-size: 12px; color: var(--muted); white-space: nowrap; }
.task-status {
  flex-shrink: 0; font-size: 11px; font-weight: 600;
  padding: 1px 8px; border-radius: 999px; background: var(--panel-2); color: var(--muted);
}
.ts-IN_PROGRESS { color: var(--blue); background: rgba(59, 130, 246, 0.12); }
.ts-REVIEW { color: var(--yellow); background: rgba(251, 191, 36, 0.12); }
.ts-REJECTED { color: var(--red); background: rgba(239, 68, 68, 0.12); }
.ts-DONE { color: var(--green); background: rgba(52, 211, 153, 0.12); }

.grid { border-collapse: collapse; width: 100%; font-size: 13px; }
.grid th, .grid td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--border); }
.grid th { color: var(--muted); font-weight: 600; font-size: 12px; }
.row { cursor: pointer; }
.row:hover { background: var(--panel); }
.name { font-weight: 600; }
.muted { color: var(--muted); }
.hint { font-size: 12px; color: var(--muted); margin: 10px 0 0; }

/* 제목/명 클릭 링크(상세 패널 진입점) */
.link {
  border: 0; background: transparent; padding: 0; cursor: pointer;
  color: var(--accent); font-size: inherit; font-family: inherit; font-weight: 600; text-align: left;
}
.link:hover { text-decoration: underline; }

.wide-card { grid-column: 1 / -1; }
.calc-tag {
  font-size: 10px; font-weight: 600; color: var(--blue); margin-left: 6px;
  border: 1px solid var(--blue); border-radius: 999px; padding: 0 6px;
  background: rgba(59, 130, 246, 0.08);
}
.calc-tag.manual { color: var(--muted); border-color: var(--border); background: transparent; }
.phase-progress { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.phase-progress li { display: flex; align-items: center; gap: 12px; font-size: 13px; }
.pp-name { min-width: 140px; }

.manual-badge {
  font-size: 10px; font-weight: 600; color: var(--muted);
  border: 1px solid var(--border); border-radius: 999px; padding: 0 6px; margin-left: 6px;
}
.tab-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.gate-hint { font-size: 12px; color: var(--muted); }
.panel-missing {
  padding: 24px; display: flex; flex-direction: column; gap: 12px;
  font-size: 13px; color: var(--muted);
}

@media (max-width: 900px) { .cards { grid-template-columns: 1fr; } .cards-2 { grid-template-columns: 1fr; } }
</style>
