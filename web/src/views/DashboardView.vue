<script setup lang="ts">
// P1-1.5 대시보드 (/app/dashboard) — 0007 §5 위젯 v1 개편.
// - KPI 재정의: '진행중' 폐기 → "진행 프로젝트 N (입찰 n · 수행 m)", 통합 카드에 "(전체)" 명시
// - 요약 테이블 확장: 목표/실제/Δ지연 + 리스크·이슈·액션 해결/총 — Δ 지연 큰 순 정렬
// - 신호 위젯(지연 카드·Today): API_BASE 전용(GET /api/dashboard/signals), 폴백에선 숨김+안내
// - 진행률 바 차트·사업유형 도넛(SVG 직접)은 유지. 해결/총은 폴백에서도 클라이언트 집계.
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { dataClient } from '../lib/dataClient';
import type {
  Project, Issue, ActionItem, Artifact, DashboardSignals, DashboardWidgets, MyDashboard,
} from '../types';
import { currentUser, isAuthenticated } from '../lib/auth';
import StageBadge from '../components/StageBadge.vue';
import StateNotice from '../components/StateNotice.vue';
import ProgressBar from '../components/ProgressBar.vue';

const router = useRouter();
const route = useRoute();

const projects = ref<Project[]>([]);
const issues = ref<Issue[]>([]);
const actionItems = ref<ActionItem[]>([]);
const artifacts = ref<Artifact[]>([]);
const signals = ref<DashboardSignals | null>(null);
const signalsError = ref(false);
// 0026 — 오늘 해야할 일·최근 활동·규칙 기반 3위젯
const widgets = ref<DashboardWidgets | null>(null);
const widgetsError = ref(false);
const loading = ref(true);
const loadError = ref<string | null>(null);

const apiMode = computed(() => !!window.API_BASE);

// ---- 0038 — 관리자용/실무진용 분리: WORKER는 기본 '내 업무', 그 외 '전체 현황' ----
// 0041 — 탭 상태를 URL(?view=my)에 보존: 상세로 갔다가 뒤로가기 하면 보던 탭으로 복귀
type ViewKey = 'admin' | 'my';
const defaultView: ViewKey = currentUser.value?.role === 'WORKER' ? 'my' : 'admin';
const view = computed<ViewKey>(() => {
  const v = String(route.query.view ?? '');
  return v === 'admin' || v === 'my' ? v : defaultView;
});
function selectView(key: ViewKey) {
  if (view.value === key) return;
  router.replace({ query: { ...route.query, view: key } });
  if (key === 'my') void loadMy();
}
const my = ref<MyDashboard | null>(null);
const myError = ref('');
// 0038 — 카드 목록 공통: 총 건수 표시 + 상위 3건만 기본 표시, 펼치기 토글
const COLLAPSE_N = 3;
const expanded = ref<Record<string, boolean>>({});
function visibleOf<T>(key: string, list: T[] | undefined | null): T[] {
  const l = list ?? [];
  return expanded.value[key] ? l : l.slice(0, COLLAPSE_N);
}
function moreCount(list: unknown[] | undefined | null): number {
  return Math.max(0, (list?.length ?? 0) - COLLAPSE_N);
}
function toggleMore(key: string) {
  expanded.value = { ...expanded.value, [key]: !expanded.value[key] };
}

async function loadMy() {
  if (!apiMode.value || !isAuthenticated.value) return;
  try {
    my.value = await dataClient.dashboard.my();
  } catch (e) {
    myError.value = e instanceof Error ? e.message : String(e);
  }
}

const todayStr = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

// ---- 상태 판별 헬퍼 ----------------------------------------------------------
const isDone = (s: string) => s === '완료' || s === 'Completed';
const isRiskType = (t: string) => (t || '').includes('리스크') || (t || '').toLowerCase().includes('risk');

// ---- KPI (0007 재정의 → 0038 개정: 전체 프로젝트 n/n, 유형별 미해결 n/총 N) ----
const biddingTotal = computed(() => projects.value.filter((p) => p.stage === 'BIDDING').length);
// Bug #3 수정: EXECUTION + COMPLETED 모두 "수행" 단계로 집계 (목록 화면 /projects/active와 동일 기준)
const execTotal = computed(() => projects.value.filter((p) => p.stage === 'EXECUTION' || p.stage === 'COMPLETED').length);
const signalByProject = computed(() => {
  const m = new Map<number, { expected: number | null; actual: number | null; delayPct: number | null }>();
  for (const s of signals.value?.signals ?? []) {
    m.set(s.projectId, { expected: s.expected, actual: s.actual, delayPct: s.delayPct });
  }
  return m;
});
// 0039 재개정 — WBS 계산 지연신호(delayPct, 요약 표와 동일 기준) 우선.
//   신호 미제공(폴백 모드·계산불가)일 때만 계약종료일 초과/수동 status='Delay'로 대체.
// Bug #3 수정: 한글 '지연'(DB 직접 저장값)도 지연으로 인식하도록 보완.
const isDelayedP = (p: Project) => {
  const sig = signalByProject.value.get(p.id);
  if (sig && sig.delayPct != null) return sig.delayPct > 0;
  // 영문 'Delay' 또는 한글 '지연' 모두 지연 판정
  return p.status === 'Delay' || p.status === '지연' ||
    (!!p.endDate && p.endDate < todayStr && p.status !== 'Completed' && p.status !== '완료' && p.stage !== 'COMPLETED');
};
const delayedBidding = computed(() => projects.value.filter((p) => p.stage === 'BIDDING' && isDelayedP(p)).length);
// Bug #3 수정: delayedExecution도 EXECUTION + COMPLETED 포함
const delayedExecution = computed(() => projects.value.filter((p) => (p.stage === 'EXECUTION' || p.stage === 'COMPLETED') && isDelayedP(p)).length);
// 리스크/이슈 분리 카운트: 미해결 n / 총 N
const riskAll = computed(() => issues.value.filter((i) => isRiskType(i.type)));
const issueAll = computed(() => issues.value.filter((i) => !isRiskType(i.type)));
const openOf = (list: { status: string }[]) => list.filter((i) => i.status === '발생' || i.status === '조치중').length;
const riskOpen = computed(() => openOf(riskAll.value));
const issueOpen = computed(() => openOf(issueAll.value));
const actionOpen = computed(() => actionItems.value.filter((a) => !isDone(a.status)).length);

const kpiDelayed = computed(() => projects.value.filter(isDelayedP).length);
const kpiDueToday = computed(() =>
  artifacts.value.filter((a) => a.dueDate === todayStr && a.status !== 'APPROVED').length +
  actionItems.value.filter((a) => a.dueDate === todayStr && !isDone(a.status)).length,
);

// ---- 요약 테이블 (0007 확장: 목표/실제/Δ + 해결/총 3종, Δ 지연순) ---------------
interface Ratio { done: number; total: number; }
interface SummaryRow {
  p: Project;
  expected: number | null;
  actual: number;
  delta: number | null;      // 기대−실제 (%p, 양수=지연)
  risk: Ratio;
  issue: Ratio;
  action: Ratio;
}

const summaryRows = computed<SummaryRow[]>(() => {
  const rows = projects.value.map((p) => {
    const sig = signalByProject.value.get(p.id);
    const projIssues = issues.value.filter((i) => i.projectId === p.id);
    const risks = projIssues.filter((i) => isRiskType(i.type));
    const pures = projIssues.filter((i) => !isRiskType(i.type));
    const actions = actionItems.value.filter((a) => a.projectId === p.id);
    const ratio = (list: { status: string }[]): Ratio => ({
      done: list.filter((x) => isDone(x.status)).length,
      total: list.length,
    });
    return {
      p,
      expected: sig?.expected ?? null,
      actual: sig?.actual ?? p.progress,  // 0038 — 계산 진척(0006 rate) 우선, 폴백=수동 progress
      delta: sig?.delayPct ?? null,
      risk: ratio(risks),
      issue: ratio(pures),
      action: ratio(actions),
    };
  });
  return rows;
});

// 0038 — 요약 정렬(헤더 클릭 토글) + 5건 접기. 기본: Δ 큰 순(문제 프로젝트 위로).
type SumKey = 'name' | 'stage' | 'expected' | 'actual' | 'delta' | 'risk' | 'issue' | 'action' | 'pm';
const sumSort = ref<{ key: SumKey; dir: 1 | -1 }>({ key: 'delta', dir: -1 });
function sortSummary(key: SumKey) {
  const textKeys: SumKey[] = ['name', 'stage', 'pm'];
  sumSort.value = sumSort.value.key === key
    ? { key, dir: sumSort.value.dir === 1 ? -1 : 1 }
    : { key, dir: textKeys.includes(key) ? 1 : -1 };
}
const sumArrow = (key: SumKey) => (sumSort.value.key === key ? (sumSort.value.dir === 1 ? '▲' : '▼') : '');
const sortedSummary = computed<SummaryRow[]>(() => {
  const { key, dir } = sumSort.value;
  // 리스크·이슈·액션은 '미해결 건수' 기준 정렬(해결/총에서 미해결=total-done)
  const val = (r: SummaryRow): number | string | null => {
    switch (key) {
      case 'name': return r.p.name;
      case 'stage': return r.p.stage;
      case 'pm': return r.p.manager || '';
      case 'expected': return r.expected;
      case 'actual': return r.actual;
      case 'delta': return r.delta;
      case 'risk': return r.risk.total === 0 ? null : r.risk.total - r.risk.done;
      case 'issue': return r.issue.total === 0 ? null : r.issue.total - r.issue.done;
      case 'action': return r.action.total === 0 ? null : r.action.total - r.action.done;
    }
  };
  return [...summaryRows.value].sort((a, b) => {
    const av = val(a); const bv = val(b);
    if (av == null && bv == null) return a.p.name.localeCompare(b.p.name);
    if (av == null) return 1;
    if (bv == null) return -1;
    const c = typeof av === 'string' ? av.localeCompare(String(bv)) : Number(av) - Number(bv);
    return c * dir || a.p.name.localeCompare(b.p.name);
  });
});
// 0039 — 기본 노출 10건(요청). 표가 길어져도 스크롤이 생기지 않는 높이.
const SUMMARY_COLLAPSE_N = 10;
// 0039 — 위젯 항목 클릭 → 해당 프로젝트의 상세 탭으로 딥링크.
//   회의록은 상세가 프로젝트 상세 안의 드로어라 ?meeting= 쿼리로 열고,
//   공문은 단독 상세 화면이 없어 소속 프로젝트의 공문 탭으로 보낸다.
function openMeeting(m: { projectId: number; meetingId: number }) {
  router.push({ path: `/projects/${m.projectId}`, query: { tab: 'meeting-minutes', meeting: String(m.meetingId) } });
}
function openOfficialDoc(d: { projectId: number }) {
  router.push({ path: `/projects/${d.projectId}`, query: { tab: 'official-docs' } });
}

const summaryVisible = computed(() =>
  (expanded.value['summary'] ? sortedSummary.value : sortedSummary.value.slice(0, SUMMARY_COLLAPSE_N)));

function fmtPct(v: number | null): string {
  return v == null ? '—' : `${Math.round(v)}%`;
}
function fmtDelta(v: number | null): string {
  if (v == null) return '—';
  // 내부값은 기대-실제(양수=지연)지만 표기는 반전 — 지연이면 마이너스(-65%p), 앞서면 플러스
  const r = Math.round(-v * 10) / 10;
  return r > 0 ? `+${r}%p` : `${r}%p`;
}
function ratioText(r: Ratio): string {
  return r.total === 0 ? '—' : `${r.done}/${r.total}`;
}

// 0026 — 위젯 항목 클릭 이동. 기존 Today 혼합 위젯은 "오늘 해야할 일" 3열로 대체(0003 D1).
function fmtDate(v: string | null | undefined): string {
  return v ? v.slice(0, 10) : '—';
}
const LEVEL_LABELS: Record<string, string> = { OK: '양호', WARN: '주의', DANGER: '위험' };
function openRisk(r: { kind: string; issueId?: number; projectId: number }) {
  if (r.kind === 'OPEN_RISK' && r.issueId != null) router.push(`/issues/${r.issueId}`);
  else router.push(`/projects/${r.projectId}`);
}
function openReco(r: { entityType?: string | null; entityId?: number | null; projectId: number }) {
  if (r.entityType === 'ISSUE' && r.entityId != null) router.push(`/issues/${r.entityId}`);
  else router.push(`/projects/${r.projectId}`);
}

// ---- 진행률 바 차트·도넛(기존 유지) --------------------------------------------

const DONUT_COLORS = ['#8b5cf6', '#3b82f6', '#34d399', '#fbbf24', '#ef4444', '#ec4899', '#22d3ee', '#9ca3af'];
const R = 42;
const CIRC = 2 * Math.PI * R;

const donutSegments = computed(() => {
  const counts = new Map<string, number>();
  for (const p of projects.value) {
    const key = p.businessType || '미분류';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const total = projects.value.length || 1;
  let offset = 0;
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, count], i) => {
      const frac = count / total;
      const seg = {
        label,
        count,
        color: DONUT_COLORS[i % DONUT_COLORS.length],
        dash: `${frac * CIRC} ${CIRC}`,
        offset: -offset * CIRC,
        pct: Math.round(frac * 100),
      };
      offset += frac;
      return seg;
    });
});

function openDetail(id: number) {
  router.push(`/projects/${id}`);
}

onMounted(async () => {
  try {
    [projects.value, issues.value, actionItems.value, artifacts.value] = await Promise.all([
      dataClient.projects.list(),
      dataClient.issues.list(),
      dataClient.actionItems.list(),
      dataClient.artifacts.list(),
    ]);
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
  void loadMy(); // 0038 — 실무진용(내 업무)
  // 신호·위젯은 별도 로드 — 실패해도 대시보드 본체는 유지
  const [sigResult, widgetResult] = await Promise.allSettled([
    dataClient.dashboard.signals(),
    dataClient.dashboard.widgets(),
  ]);
  if (sigResult.status === 'fulfilled') signals.value = sigResult.value;
  else { signalsError.value = true; console.error('[dashboard] 신호 로드 실패:', sigResult.reason); }
  if (widgetResult.status === 'fulfilled') widgets.value = widgetResult.value;
  else { widgetsError.value = true; console.error('[dashboard] 위젯 로드 실패:', widgetResult.reason); }
});
</script>

<template>
  <div>
    <h1 class="title">대시보드</h1>
    <p class="sub">전 프로젝트 현황 요약 — {{ todayStr }}</p>

    <StateNotice
      :loading="loading" :error="loadError"
      :empty="!loading && !loadError && projects.length === 0"
      empty-text="등록된 프로젝트가 없습니다 — 데이터 소스(백엔드 API 또는 Supabase 시드) 연결 후 표시됩니다."
    />

    <!-- 0038 — 관리자용(전체 현황) / 실무진용(내 업무) 분리. WORKER 기본=내 업무 -->
    <div v-if="apiMode && isAuthenticated" class="view-tabs" role="tablist">
      <button class="vtab" :class="{ on: view === 'admin' }" role="tab" @click="selectView('admin')">전체 현황 (관리자)</button>
      <button class="vtab" :class="{ on: view === 'my' }" role="tab" @click="selectView('my')">내 업무 (실무)</button>
    </div>

    <!-- ==================== 실무진용: 내 업무 ==================== -->
    <template v-if="view === 'my'">
      <div v-if="myError" class="signal-off">내 업무를 불러오지 못했습니다. ({{ myError }})</div>
      <div v-else-if="my?.needsPersonLink" class="signal-off">
        계정에 인력(person)이 연결되어 있지 않아 내 담당 업무를 판정할 수 없습니다 — 시스템 관리자에게
        [관리자 콘솔 &gt; 사용자]에서 인력 연결을 요청하세요.
      </div>
      <template v-else-if="my">
        <div class="kpis">
          <div class="kpi kpi-accent">
            <div class="kpi-value">{{ my.counts?.tasks.open ?? 0 }}</div>
            <div class="kpi-label">내 태스크 미완료</div>
            <div class="kpi-break">총 {{ my.counts?.tasks.total ?? 0 }}건</div>
          </div>
          <div class="kpi kpi-blue">
            <div class="kpi-value">{{ my.counts?.actionItems.open ?? 0 }}</div>
            <div class="kpi-label">내 액션아이템 미완료</div>
            <div class="kpi-break">총 {{ my.counts?.actionItems.total ?? 0 }}건</div>
          </div>
          <div class="kpi kpi-yellow">
            <div class="kpi-value">{{ my.counts?.issues.open ?? 0 }}</div>
            <div class="kpi-label">내 리스크·이슈 미해결</div>
            <div class="kpi-break">총 {{ my.counts?.issues.total ?? 0 }}건</div>
          </div>
          <div class="kpi kpi-green">
            <div class="kpi-value">{{ my.counts?.deliverables.open ?? 0 }}</div>
            <div class="kpi-label">내 산출물 미제출</div>
            <div class="kpi-break">총 {{ my.counts?.deliverables.total ?? 0 }}건</div>
          </div>
        </div>

        <section class="card">
          <h2 class="card-title">내 참여 프로젝트 <span class="card-sub">산출물 승인 기준 진척</span> <button type="button" class="cnt-badge" :title="expanded['myPj'] ? '접기' : '전체 보기'" @click="toggleMore('myPj')">{{ (my?.projects ?? []).length }}건<template v-if="moreCount(my?.projects) > 0"> {{ expanded['myPj'] ? '▲' : '▼' }}</template></button></h2>
          <div v-if="!my.projects || my.projects.length === 0" class="card-empty">참여 중인 프로젝트가 없습니다.</div>
          <ul v-else class="mini-list">
            <li v-for="pj in visibleOf('myPj', my.projects)" :key="pj.projectId" class="mini-item" @click="openDetail(pj.projectId)">
              <span class="due-badge" :class="pj.stage === 'BIDDING' ? 'due-today' : 'due-over'">{{ pj.stage === 'BIDDING' ? '입찰' : '수행' }}</span>
              <span class="mini-title">{{ pj.projectName }}<span v-if="pj.isPm" class="pm-mini">PM</span></span>
              <span class="mini-meta">
                {{ pj.status }}<template v-if="pj.progress != null"> · 진척 {{ pj.progress }}%</template>
              </span>
              <span v-if="pj.progress != null" class="my-bar"><span class="my-bar-fill" :style="{ width: pj.progress + '%' }" /></span>
            </li>
          </ul>
        </section>

        <div class="triple">
          <section class="card">
            <h2 class="card-title">내 태스크 <button type="button" class="cnt-badge" :title="expanded['myTasks'] ? '접기' : '전체 보기'" @click="toggleMore('myTasks')">{{ (my?.tasks ?? []).length }}건<template v-if="moreCount(my?.tasks) > 0"> {{ expanded['myTasks'] ? '▲' : '▼' }}</template></button></h2>
            <div v-if="!my.tasks || my.tasks.length === 0" class="card-empty">미완료 태스크가 없습니다.</div>
            <ul v-else class="mini-list">
              <li v-for="t in visibleOf('myTasks', my.tasks)" :key="t.id" class="mini-item" @click="router.push(`/tasks/${t.id}`)">
                <span v-if="t.overdue || t.dueToday" class="due-badge" :class="t.overdue ? 'due-over' : 'due-today'">{{ t.overdue ? '지연' : '오늘' }}</span>
                <span class="mini-title">{{ t.title }}</span>
                <span class="mini-meta">{{ t.projectName }}<template v-if="t.progress != null"> · {{ t.progress }}%</template><template v-if="t.dueDate"> · 기한 {{ t.dueDate }}</template></span>
              </li>
            </ul>
          </section>
          <section class="card">
            <h2 class="card-title">내 액션아이템 · 리스크 <button type="button" class="cnt-badge" @click="toggleMore('myActs'); toggleMore('myIss')">{{ (my?.actionItems ?? []).length + (my?.issues ?? []).length }}건 {{ expanded['myActs'] ? '▲' : '▼' }}</button></h2>
            <div v-if="(!my.actionItems || my.actionItems.length === 0) && (!my.issues || my.issues.length === 0)" class="card-empty">해당 항목이 없습니다.</div>
            <ul v-else class="mini-list">
              <li v-for="a in visibleOf('myActs', my.actionItems)" :key="'a' + a.id" class="mini-item" @click="router.push(`/action-items/${a.id}`)">
                <span v-if="a.overdue || a.dueToday" class="due-badge" :class="a.overdue ? 'due-over' : 'due-today'">{{ a.overdue ? '지연' : '오늘' }}</span>
                <span class="mini-title">{{ a.title }}</span>
                <span class="mini-meta">{{ a.projectName }}<template v-if="a.dueDate"> · 기한 {{ a.dueDate }}</template></span>
              </li>
              <li v-for="i in visibleOf('myIss', my.issues)" :key="'i' + i.id" class="mini-item" @click="router.push(`/issues/${i.id}`)">
                <span v-if="i.overdue || i.dueToday" class="due-badge" :class="i.overdue ? 'due-over' : 'due-today'">{{ i.overdue ? '지연' : '오늘' }}</span>
                <span class="mini-title">{{ i.title }}</span>
                <span class="mini-meta">{{ i.projectName }}<template v-if="i.dueDate"> · 기한 {{ i.dueDate }}</template></span>
              </li>
            </ul>
          </section>
          <section class="card">
            <h2 class="card-title">내 산출물 (미제출) <button type="button" class="cnt-badge" :title="expanded['myDel'] ? '접기' : '전체 보기'" @click="toggleMore('myDel')">{{ (my?.deliverables ?? []).length }}건<template v-if="moreCount(my?.deliverables) > 0"> {{ expanded['myDel'] ? '▲' : '▼' }}</template></button></h2>
            <div v-if="!my.deliverables || my.deliverables.length === 0" class="card-empty">미제출 산출물이 없습니다.</div>
            <ul v-else class="mini-list">
              <li v-for="d in visibleOf('myDel', my.deliverables)" :key="d.id" class="mini-item" @click="router.push(`/deliverables/${d.id}`)">
                <span v-if="d.overdue || d.dueToday" class="due-badge" :class="d.overdue ? 'due-over' : 'due-today'">{{ d.overdue ? '지연' : '오늘' }}</span>
                <span class="mini-title">{{ d.title }}</span>
                <span class="mini-meta">{{ d.projectName }}<template v-if="d.dueDate"> · 기한 {{ d.dueDate }}</template></span>
              </li>
            </ul>
          </section>
        </div>

      </template>

      <!-- 0038 재배치 — 전역 오늘/지연·조치·최근 활동은 실무진(내 업무) 화면으로 -->
      <template v-if="apiMode">
      <!-- 0026 D1 — 오늘 해야할 일 (3열) -->
      <div class="triple">
        <section class="card">
          <h2 class="card-title">오늘/지연 WBS 일정 <button type="button" class="cnt-badge" :title="expanded['tTasks'] ? '접기' : '전체 보기'" @click="toggleMore('tTasks')">{{ (widgets?.today.tasks ?? []).length }}건<template v-if="moreCount(widgets?.today.tasks) > 0"> {{ expanded['tTasks'] ? '▲' : '▼' }}</template></button></h2>
          <div v-if="widgetsError" class="card-empty">위젯을 불러오지 못했습니다.</div>
          <div v-else-if="!widgets || widgets.today.tasks.length === 0" class="card-empty">해당 항목이 없습니다.</div>
          <ul v-else class="mini-list">
            <li v-for="t in visibleOf('tTasks', widgets.today.tasks)" :key="t.taskId" class="mini-item" @click="router.push(`/tasks/${t.taskId}`)">
              <span class="due-badge" :class="t.overdue ? 'due-over' : 'due-today'">{{ t.overdue ? '지연' : '오늘' }}</span>
              <span class="mini-title">{{ t.name }}</span>
              <span class="mini-meta">{{ t.projectName }} · 진행률 {{ t.progress }}% · 기한 {{ t.dueDate }}</span>
            </li>
          </ul>
        </section>
        <section class="card">
          <h2 class="card-title">오늘/지연 액션아이템 <button type="button" class="cnt-badge" :title="expanded['tActs'] ? '접기' : '전체 보기'" @click="toggleMore('tActs')">{{ (widgets?.today.actions ?? []).length }}건<template v-if="moreCount(widgets?.today.actions) > 0"> {{ expanded['tActs'] ? '▲' : '▼' }}</template></button></h2>
          <div v-if="widgetsError" class="card-empty">위젯을 불러오지 못했습니다.</div>
          <div v-else-if="!widgets || widgets.today.actions.length === 0" class="card-empty">해당 항목이 없습니다.</div>
          <ul v-else class="mini-list">
            <li v-for="a in visibleOf('tActs', widgets.today.actions)" :key="a.actionId" class="mini-item" @click="router.push(`/action-items/${a.actionId}`)">
              <span class="due-badge" :class="a.overdue ? 'due-over' : 'due-today'">{{ a.overdue ? '지연' : '오늘' }}</span>
              <span class="mini-title">{{ a.title }}</span>
              <span class="mini-meta">{{ a.projectName }}<template v-if="a.assigneeName"> · {{ a.assigneeName }}</template> · 기한 {{ a.dueDate }}</span>
            </li>
          </ul>
        </section>
        <section class="card">
          <h2 class="card-title">오늘/지연 제출 산출물 <button type="button" class="cnt-badge" :title="expanded['tDelivs'] ? '접기' : '전체 보기'" @click="toggleMore('tDelivs')">{{ (widgets?.today.deliverables ?? []).length }}건<template v-if="moreCount(widgets?.today.deliverables) > 0"> {{ expanded['tDelivs'] ? '▲' : '▼' }}</template></button></h2>
          <div v-if="widgetsError" class="card-empty">위젯을 불러오지 못했습니다.</div>
          <div v-else-if="!widgets || widgets.today.deliverables.length === 0" class="card-empty">해당 항목이 없습니다.</div>
          <ul v-else class="mini-list">
            <li v-for="d in visibleOf('tDelivs', widgets.today.deliverables)" :key="d.deliverableId" class="mini-item" @click="router.push(`/deliverables/${d.deliverableId}`)">
              <span class="due-badge" :class="d.overdue ? 'due-over' : 'due-today'">{{ d.overdue ? '지연' : '오늘' }}</span>
              <span class="mini-title">{{ d.name }}</span>
              <span class="mini-meta">{{ d.projectName }} · 기한 {{ d.dueDate }}</span>
            </li>
          </ul>
        </section>
      </div>

      <div class="triple">
        <section class="card">
          <h2 class="card-title">주요 리스크 <span class="card-sub">우선순위·경과일 순</span> <button type="button" class="cnt-badge" :title="expanded['risks'] ? '접기' : '전체 보기'" @click="toggleMore('risks')">{{ (widgets?.risks ?? []).length }}건<template v-if="moreCount(widgets?.risks) > 0"> {{ expanded['risks'] ? '▲' : '▼' }}</template></button></h2>
          <div v-if="widgetsError" class="card-empty">위젯을 불러오지 못했습니다.</div>
          <div v-else-if="!widgets || widgets.risks.length === 0" class="card-empty">오픈 리스크가 없습니다.</div>
          <ul v-else class="mini-list">
            <li v-for="(r, i) in visibleOf('risks', widgets.risks)" :key="i" class="mini-item" @click="openRisk(r)">
              <span class="due-badge" :class="r.kind === 'DELAY' ? 'due-over' : 'due-today'">{{ r.kind === 'DELAY' ? '진척 지연' : (r.priority || '리스크') }}</span>
              <span class="mini-title">{{ r.title }}</span>
              <span class="mini-meta">{{ r.projectName }}<template v-if="r.ageDays != null"> · {{ r.ageDays }}일 경과</template></span>
            </li>
          </ul>
        </section>
        <section class="card">
          <h2 class="card-title">지금 실행하면 좋은 조치 <button type="button" class="cnt-badge" :title="expanded['reco'] ? '접기' : '전체 보기'" @click="toggleMore('reco')">{{ (widgets?.recommendations ?? []).length }}건<template v-if="moreCount(widgets?.recommendations) > 0"> {{ expanded['reco'] ? '▲' : '▼' }}</template></button></h2>
          <div v-if="widgetsError" class="card-empty">위젯을 불러오지 못했습니다.</div>
          <div v-else-if="!widgets || widgets.recommendations.length === 0" class="card-empty">권장 조치가 없습니다.</div>
          <ul v-else class="mini-list">
            <li v-for="(r, i) in visibleOf('reco', widgets.recommendations)" :key="i" class="mini-item" @click="openReco(r)">
              <span class="mini-title">{{ r.text }}</span>
              <span class="mini-meta">{{ r.projectName }}</span>
            </li>
          </ul>
        </section>
      </div>

      <div class="triple">
        <section class="card">
        <h2 class="card-title">최근 공문 <button type="button" class="cnt-badge" @click="toggleMore('rDocs')">{{ (widgets?.recent.officialDocs ?? []).length }}건<template v-if="moreCount(widgets?.recent.officialDocs) > 0"> {{ expanded['rDocs'] ? '▲' : '▼' }}</template></button></h2>
        <div v-if="widgetsError" class="card-empty">위젯을 불러오지 못했습니다.</div>
        <div v-else-if="!widgets || widgets.recent.officialDocs.length === 0" class="card-empty">등록된 공문이 없습니다.</div>
        <ul v-else class="mini-list">
          <li v-for="d in visibleOf('rDocs', widgets.recent.officialDocs)" :key="d.docId" class="mini-item" @click="openOfficialDoc(d)">
            <span v-if="d.currentStatus" class="due-badge due-today">{{ d.currentStatus }}</span>
            <span class="mini-title">{{ d.title }}</span>
            <span class="mini-meta">
              <template v-if="d.docNumber">{{ d.docNumber }} · </template>{{ d.projectName }}
              <template v-if="d.drafterName"> · {{ d.drafterName }}</template>
              <template v-if="d.draftDate"> · {{ fmtDate(d.draftDate) }}</template>
            </span>
          </li>
        </ul>
        </section>
        <section class="card">
        <h2 class="card-title">최근 회의록 <button type="button" class="cnt-badge" @click="toggleMore('rMeet')">{{ (widgets?.recent.meetings ?? []).length }}건<template v-if="moreCount(widgets?.recent.meetings) > 0"> {{ expanded['rMeet'] ? '▲' : '▼' }}</template></button></h2>
        <div v-if="widgetsError" class="card-empty">위젯을 불러오지 못했습니다.</div>
        <div v-else-if="!widgets || widgets.recent.meetings.length === 0" class="card-empty">등록된 회의록이 없습니다.</div>
        <ul v-else class="mini-list">
          <li v-for="m in visibleOf('rMeet', widgets.recent.meetings)" :key="m.meetingId" class="mini-item" @click="openMeeting(m)">
            <span class="mini-title">{{ m.title }}</span>
            <span class="mini-meta">
                {{ m.projectName }}<template v-if="m.location"> · {{ m.location }}</template> · {{ fmtDate(m.meetDate) }}
            </span>
          </li>
        </ul>
        </section>
        <section class="card">
        <h2 class="card-title">최근 제출 산출물 <button type="button" class="cnt-badge" @click="toggleMore('rDeliv')">{{ (widgets?.recent.deliverables ?? []).length }}건<template v-if="moreCount(widgets?.recent.deliverables) > 0"> {{ expanded['rDeliv'] ? '▲' : '▼' }}</template></button></h2>
        <div v-if="widgetsError" class="card-empty">위젯을 불러오지 못했습니다.</div>
        <div v-else-if="!widgets || widgets.recent.deliverables.length === 0" class="card-empty">제출된 산출물이 없습니다.</div>
        <ul v-else class="mini-list">
          <li v-for="d in visibleOf('rDeliv', widgets.recent.deliverables)" :key="d.deliverableId" class="mini-item" @click="router.push(`/deliverables/${d.deliverableId}`)">
            <span class="due-badge due-today">제출</span>
            <span class="mini-title">{{ d.name }}</span>
            <span class="mini-meta">
                {{ d.projectName }}<template v-if="d.authorName"> · {{ d.authorName }}</template> · {{ fmtDate(d.submittedAt) }}
            </span>
          </li>
        </ul>
        </section>
      </div>
      <!-- Bug #5: 게시판/공지 안내 — 홈에서 공지가 보이고 게시판 목록이 비어 있는 경우 안내.
           공지는 현재 backend widgets.recent 또는 시드 데이터에서 제공되며,
           통합 게시판 화면은 아직 이 앱에 구현되어 있지 않습니다(라우트 미등록).
           ※ 홈에서 보이는 '최근 공지 N건'은 위젯 API 또는 샘플 시드 데이터로부터 제공됩니다. -->
      <div v-if="!apiMode" class="notice-hint">
        <span>📋</span>
        <span>
          <b>공지/게시판</b>: 현재 화면에 표시되는 공지는 <b>데모 샘플 데이터</b>입니다.
          실제 공지·게시판 기능은 백엔드(API_BASE) 연결 후 제공됩니다.
          통합 게시판 화면은 향후 별도 메뉴로 제공될 예정입니다.
        </span>
      </div>
      </template>
    </template>

    <!-- ==================== 관리자용: 전체 현황 ==================== -->
    <template v-if="view === 'admin' && !loading && !loadError && projects.length > 0">
      <!-- KPI (0038 재개정: 지연/전체 통합 카드 + 전 항목 '미해결/총' 큰 숫자, 리스크=노랑·이슈=빨강) -->
      <div class="kpis">
        <div class="kpi kpi-accent">
          <div class="kpi-value"><span class="v-warn">{{ kpiDelayed }}</span><span class="v-sep">/</span>{{ projects.length }}</div>
          <div class="kpi-label">지연 / 전체 프로젝트</div>
          <div class="kpi-break">지연 — 입찰 {{ delayedBidding }}/{{ biddingTotal }} · 수행 {{ delayedExecution }}/{{ execTotal }}</div>
        </div>
        <div class="kpi kpi-yellow">
          <div class="kpi-value">{{ riskOpen }}<span class="v-sep">/</span><span class="v-total">{{ riskAll.length }}</span></div>
          <div class="kpi-label">리스크 미해결 / 총</div>
        </div>
        <div class="kpi kpi-red">
          <div class="kpi-value">{{ issueOpen }}<span class="v-sep">/</span><span class="v-total">{{ issueAll.length }}</span></div>
          <div class="kpi-label">이슈 미해결 / 총</div>
        </div>
        <div class="kpi kpi-blue">
          <div class="kpi-value">{{ actionOpen }}<span class="v-sep">/</span><span class="v-total">{{ actionItems.length }}</span></div>
          <div class="kpi-label">액션아이템 미완료 / 총</div>
        </div>
        <div class="kpi kpi-green">
          <div class="kpi-value">{{ kpiDueToday }}</div>
          <div class="kpi-label">오늘 마감</div>
        </div>
      </div>

      <!-- 신호·위젯 (0007·0026 — API_BASE 전용) -->
      <div v-if="!apiMode" class="signal-off">
        신호·위젯(오늘 해야할 일·지연 신호·규칙 기반)은 백엔드 연동(API_BASE) 후 제공됩니다 — 폴백 모드에서는 숨김.
      </div>
      <template v-else>
      <!-- 요약 테이블 (0038 재개정: 정렬 가능 헤더 + 5건 접기, 진행률=계산 진척) -->
      <section class="card">
        <h2 class="card-title">
          프로젝트 요약
          <span class="card-sub">헤더 클릭으로 정렬 · 해결/총은 현재 데이터 집계</span>
          <button type="button" class="cnt-badge" @click="toggleMore('summary')">{{ sortedSummary.length }}건<template v-if="sortedSummary.length > SUMMARY_COLLAPSE_N"> {{ expanded['summary'] ? '▲' : '▼' }}</template></button>
        </h2>
        <table class="grid">
          <thead>
            <tr>
              <th class="sortable" @click="sortSummary('name')">프로젝트명 {{ sumArrow('name') }}</th>
              <th class="sortable" @click="sortSummary('stage')">단계 {{ sumArrow('stage') }}</th>
              <th class="num sortable" @click="sortSummary('expected')">목표 {{ sumArrow('expected') }}</th>
              <th class="num sortable" @click="sortSummary('actual')">진행률 {{ sumArrow('actual') }}</th>
              <th class="num sortable" @click="sortSummary('delta')">지연 {{ sumArrow('delta') }}</th>
              <th class="num sortable" title="미해결 건수 기준 정렬" @click="sortSummary('risk')">리스크 {{ sumArrow('risk') }}</th>
              <th class="num sortable" title="미해결 건수 기준 정렬" @click="sortSummary('issue')">이슈 {{ sumArrow('issue') }}</th>
              <th class="num sortable" title="미해결 건수 기준 정렬" @click="sortSummary('action')">액션 {{ sumArrow('action') }}</th>
              <th class="sortable" @click="sortSummary('pm')">PM {{ sumArrow('pm') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in summaryVisible" :key="r.p.id" class="row" @click="openDetail(r.p.id)">
              <td class="name">{{ r.p.name }}</td>
              <td><StageBadge :stage="r.p.stage" /></td>
              <td class="num">{{ fmtPct(r.expected) }}</td>
              <td class="progress-cell">
                <ProgressBar :value="r.actual ?? 0" />
                <span class="progress-num">{{ fmtPct(r.actual) }}</span>
              </td>
              <td class="num" :class="r.delta == null ? '' : r.delta > 0 ? 'delta-bad' : 'delta-good'">
                {{ fmtDelta(r.delta) }}
              </td>
              <td class="num">{{ ratioText(r.risk) }}</td>
              <td class="num">{{ ratioText(r.issue) }}</td>
              <td class="num">{{ ratioText(r.action) }}</td>
              <td>{{ r.p.manager || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </section>

        <!-- 0038 재배치 → 0039: 주의 프로젝트 | 주요 리스크 | 최근 회의록 | 사업유형 분포 -->
        <div class="quad">
          <section class="card">
            <h2 class="card-title">주의가 필요한 프로젝트 <span class="card-sub">건강도 점수 낮은 순</span> <button type="button" class="cnt-badge" :title="expanded['att'] ? '접기' : '전체 보기'" @click="toggleMore('att')">{{ (widgets?.attention ?? []).length }}건<template v-if="moreCount(widgets?.attention) > 0"> {{ expanded['att'] ? '▲' : '▼' }}</template></button></h2>
            <div v-if="widgetsError" class="card-empty">위젯을 불러오지 못했습니다.</div>
            <div v-else-if="!widgets || widgets.attention.length === 0" class="card-empty">대상 프로젝트가 없습니다.</div>
            <ul v-else class="mini-list">
              <li v-for="a in visibleOf('att', widgets.attention)" :key="a.projectId" class="mini-item" @click="openDetail(a.projectId)">
                <span class="score" :class="'score-' + a.level.toLowerCase()">{{ a.score }}점 · {{ LEVEL_LABELS[a.level] ?? a.level }}</span>
                <span class="mini-title">{{ a.projectName }}</span>
                <span v-if="a.factors.length" class="mini-meta">{{ a.factors.join(' · ') }}</span>
              </li>
            </ul>
          </section>
          <section class="card">
            <h2 class="card-title">주요 리스크 <span class="card-sub">우선순위·경과일 순</span> <button type="button" class="cnt-badge" :title="expanded['risks'] ? '접기' : '전체 보기'" @click="toggleMore('risks')">{{ (widgets?.risks ?? []).length }}건<template v-if="moreCount(widgets?.risks) > 0"> {{ expanded['risks'] ? '▲' : '▼' }}</template></button></h2>
            <div v-if="widgetsError" class="card-empty">위젯을 불러오지 못했습니다.</div>
            <div v-else-if="!widgets || widgets.risks.length === 0" class="card-empty">오픈 리스크가 없습니다.</div>
            <ul v-else class="mini-list">
              <li v-for="(r, i) in visibleOf('risks', widgets.risks)" :key="i" class="mini-item" @click="openRisk(r)">
                <span class="due-badge" :class="r.kind === 'DELAY' ? 'due-over' : 'due-today'">{{ r.kind === 'DELAY' ? '진척 지연' : (r.priority || '리스크') }}</span>
                <span class="mini-title">{{ r.title }}</span>
                <span class="mini-meta">{{ r.projectName }}<template v-if="r.ageDays != null"> · {{ r.ageDays }}일 경과</template></span>
              </li>
            </ul>
          </section>
          <section class="card">
          <h2 class="card-title">최근 회의록 <button type="button" class="cnt-badge" @click="toggleMore('rMeet')">{{ (widgets?.recent.meetings ?? []).length }}건<template v-if="moreCount(widgets?.recent.meetings) > 0"> {{ expanded['rMeet'] ? '▲' : '▼' }}</template></button></h2>
          <div v-if="widgetsError" class="card-empty">위젯을 불러오지 못했습니다.</div>
          <div v-else-if="!widgets || widgets.recent.meetings.length === 0" class="card-empty">등록된 회의록이 없습니다.</div>
          <ul v-else class="mini-list">
            <li v-for="m in visibleOf('rMeet', widgets.recent.meetings)" :key="m.meetingId" class="mini-item" @click="openMeeting(m)">
              <span class="mini-title">{{ m.title }}</span>
              <span class="mini-meta">
                {{ m.projectName }}<template v-if="m.location"> · {{ m.location }}</template> · {{ fmtDate(m.meetDate) }}
              </span>
            </li>
          </ul>
            </section>
          <section class="card">
          <h2 class="card-title">사업유형 분포</h2>
          <div class="donut-wrap">
            <svg viewBox="0 0 120 120" class="donut" role="img" aria-label="사업유형 분포 도넛 차트">
              <circle cx="60" cy="60" :r="R" fill="none" stroke="var(--panel-2)" stroke-width="16" />
              <circle
                v-for="s in donutSegments" :key="s.label"
                cx="60" cy="60" :r="R" fill="none"
                :stroke="s.color" stroke-width="16"
                :stroke-dasharray="s.dash" :stroke-dashoffset="s.offset"
                transform="rotate(-90 60 60)"
              />
              <text x="60" y="58" text-anchor="middle" class="donut-total">{{ projects.length }}</text>
              <text x="60" y="72" text-anchor="middle" class="donut-caption">프로젝트</text>
            </svg>
            <ul class="legend">
              <li v-for="s in donutSegments" :key="s.label">
                <span class="dot" :style="{ background: s.color }" />
                {{ s.label }} <span class="legend-num">{{ s.count }}건 ({{ s.pct }}%)</span>
              </li>
            </ul>
          </div>
          </section>
        </div>

      </template>



    </template>
  </div>
</template>

<style scoped>
.title { font-size: 22px; margin: 0 0 4px; }
.sub { color: var(--muted); font-size: 14px; margin: 0 0 20px; }

.kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 16px; }
.kpi {
  background: var(--panel); border: 1px solid var(--border); border-radius: 10px;
  padding: 14px 16px;
}
.kpi-value { font-size: 26px; font-weight: 700; line-height: 1.2; }
.kpi-label { font-size: 13px; color: var(--muted); margin-top: 4px; }
.kpi-break { font-size: 12px; color: var(--text); margin-top: 3px; opacity: 0.85; }
.kpi-green .kpi-value { color: var(--green); }
.kpi-red .kpi-value { color: var(--red); }
.kpi-yellow .kpi-value { color: var(--yellow); }
.kpi-blue .kpi-value { color: var(--blue); }
.kpi-accent .kpi-value { color: var(--accent); }

.signal-off {
  padding: 10px 14px; margin-bottom: 16px; border-radius: 8px;
  background: var(--panel); border: 1px dashed var(--border);
  color: var(--muted); font-size: 13px;
}

.charts { display: grid; grid-template-columns: 1.4fr 1fr; gap: 12px; margin-bottom: 16px; }
/* 0026 — 3열 위젯 공통 */
.triple { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 4px; }
/* 0039 — 사업유형 분포를 최근 회의록 옆으로 올려 4열로(요청). .triple은 '내 업무' 탭 3열 행이 공유 */
.quad { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 4px; }
/* 0039 — 프로젝트 요약 진행률: 막대 + 숫자 병기 */
.progress-cell { display: flex; align-items: center; gap: 8px; min-width: 120px; }
.progress-cell > :first-child { flex: 1; }
.progress-num { font-variant-numeric: tabular-nums; font-size: 12.5px; color: var(--muted); flex-shrink: 0; }
.mini-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.mini-item {
  display: flex; flex-direction: column; gap: 2px; cursor: pointer;
  padding: 8px 6px; border-radius: 6px;
}
.mini-item:hover { background: var(--panel-2); }
.mini-item + .mini-item { border-top: 1px solid var(--border); }
.mini-title { font-size: 13.5px; font-weight: 600; line-height: 1.35; }
.mini-meta { font-size: 12px; color: var(--muted); }
.due-badge {
  align-self: flex-start; padding: 1px 7px; border-radius: 999px;
  font-size: 11px; font-weight: 700;
}
.due-today { background: color-mix(in srgb, var(--yellow) 20%, transparent); color: var(--yellow); }
.due-over { background: color-mix(in srgb, var(--red) 18%, transparent); color: var(--red); }
.score { align-self: flex-start; padding: 1px 7px; border-radius: 999px; font-size: 11px; font-weight: 700; }
.score-ok { background: color-mix(in srgb, var(--green) 18%, transparent); color: var(--green); }
.score-warn { background: color-mix(in srgb, var(--yellow) 20%, transparent); color: var(--yellow); }
.score-danger { background: color-mix(in srgb, var(--red) 18%, transparent); color: var(--red); }
.card {
  background: var(--panel); border: 1px solid var(--border); border-radius: 10px;
  padding: 16px; margin-bottom: 12px;
}
.card-title { font-size: 15px; margin: 0 0 14px; }
.card-sub { font-size: 12px; color: var(--muted); font-weight: 400; margin-left: 6px; }
.card-empty { font-size: 14px; color: var(--muted); }

.bars { display: flex; flex-direction: column; gap: 10px; }
.bar-row { display: flex; align-items: center; gap: 10px; cursor: pointer; }
.bar-row:hover .bar-name { color: var(--text); }
.bar-name {
  width: 180px; flex-shrink: 0; font-size: 13px; color: var(--muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.bar-track { flex: 1; height: 8px; border-radius: 999px; background: var(--panel-2); overflow: hidden; }
.bar-fill { height: 100%; border-radius: 999px; background: var(--accent); }
.bar-num { width: 40px; text-align: right; font-size: 13px; color: var(--muted); }

.donut-wrap { display: flex; align-items: center; gap: 20px; }
.donut { width: 150px; height: 150px; flex-shrink: 0; }
.donut-total { fill: var(--text); font-size: 22px; font-weight: 700; }
.donut-caption { fill: var(--muted); font-size: 10px; }
.legend { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
.legend .dot { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
.legend-num { color: var(--muted); }

.today-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.today-item {
  display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;
  padding: 8px 6px; border-bottom: 1px solid var(--border); cursor: pointer;
}
.today-item:last-child { border-bottom: 0; }
.today-item:hover { background: var(--panel-2); }
.kind {
  flex-shrink: 0; font-size: 11px; font-weight: 600;
  padding: 1px 7px; border-radius: 999px;
}
.kind-DELAY { color: var(--red); background: rgba(239, 68, 68, 0.12); }
.kind-DUE_TODAY { color: var(--yellow); background: rgba(251, 191, 36, 0.12); }
.kind-HIGH_PRIORITY { color: var(--accent); background: rgba(139, 92, 246, 0.12); }
.today-title { font-size: 14px; font-weight: 600; }
.today-meta { font-size: 12px; color: var(--muted); }
.auto-badge {
  font-size: 11px; font-weight: 600; color: var(--accent);
  border: 1px solid var(--accent); border-radius: 999px; padding: 0 6px; margin-left: 4px;
}

.grid { border-collapse: collapse; width: 100%; font-size: 14px; }
.grid th, .grid td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border); }
.grid th { color: var(--muted); font-weight: 600; font-size: 13px; }
.grid tbody tr:last-child td { border-bottom: 0; }
.grid .num { text-align: right; white-space: nowrap; }
.row { cursor: pointer; }
.row:hover { background: var(--panel-2); }
.name { font-weight: 600; }
.delta-bad { color: var(--red); font-weight: 600; }
.delta-good { color: var(--green); font-weight: 600; }
.tag {
  font-size: 11px; color: var(--muted);
  border: 1px solid var(--border); border-radius: 999px; padding: 0 6px;
}

@media (max-width: 1000px) {
  .kpis { grid-template-columns: repeat(2, 1fr); }
  .charts { grid-template-columns: 1fr; }
  .quad { grid-template-columns: repeat(2, 1fr); }
}

/* 0038 — 뷰 탭 + 카드 건수 뱃지(클릭=펼치기) + 내 업무 */
.view-tabs { display: flex; gap: 6px; margin: 2px 0 14px; }
.vtab {
  border: 1px solid var(--border); background: var(--panel); color: var(--muted);
  font-size: 13.5px; font-weight: 600; padding: 7px 16px; border-radius: 999px; cursor: pointer; font-family: inherit;
}
.vtab:hover { color: var(--text); }
.vtab.on { background: var(--accent); border-color: var(--accent); color: #fff; }
.cnt-badge {
  margin-left: 6px; font-size: 11.5px; font-weight: 700; padding: 1px 9px; border-radius: 999px;
  border: 1px solid var(--border); background: var(--panel-2); color: var(--muted);
  cursor: pointer; font-family: inherit;
}
.cnt-badge:hover { color: var(--text); border-color: var(--accent); }
.pm-mini {
  margin-left: 6px; font-size: 10px; font-weight: 700; color: var(--accent);
  border: 1px solid var(--accent); border-radius: 4px; padding: 0 4px; vertical-align: 1px;
}
.my-bar { display: block; height: 4px; background: var(--panel-2); border-radius: 2px; margin-top: 5px; overflow: hidden; }
.my-bar-fill { display: block; height: 100%; background: var(--accent); }

/* 0038 — KPI 'n / N' 표기: 총계도 크게, 지연 수치는 경고색 */
.kpi-value .v-sep { margin: 0 6px; color: var(--muted); font-weight: 400; }
.kpi-value .v-total { color: var(--text); }
.kpi-value .v-warn { color: var(--red); }

.grid th.sortable { cursor: pointer; user-select: none; }
.grid th.sortable:hover { color: var(--text); }

/* Bug #5: 공지/게시판 안내 */
.notice-hint {
  display: flex; align-items: flex-start; gap: 10px;
  margin-top: 12px; padding: 12px 16px; border-radius: 10px;
  background: color-mix(in srgb, var(--yellow) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--yellow) 40%, transparent);
  font-size: 13px; color: var(--text); line-height: 1.6;
}
</style>
