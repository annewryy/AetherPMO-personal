<script setup lang="ts">
// P1-1.5 대시보드 (/app/dashboard) — 0007 §5 위젯 v1 개편.
// - KPI 재정의: '진행중' 폐기 → "진행 프로젝트 N (입찰 n · 수행 m)", 통합 카드에 "(전체)" 명시
// - 요약 테이블 확장: 목표/실제/Δ지연 + 리스크·이슈·액션 해결/총 — Δ 지연 큰 순 정렬
// - 신호 위젯(지연 카드·Today): API_BASE 전용(GET /api/dashboard/signals), 폴백에선 숨김+안내
// - 진행률 바 차트·사업유형 도넛(SVG 직접)은 유지. 해결/총은 폴백에서도 클라이언트 집계.
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { dataClient } from '../lib/dataClient';
import type {
  Project, Issue, ActionItem, Artifact, DashboardSignals, TodaySignalItem,
} from '../types';
import StageBadge from '../components/StageBadge.vue';
import StateNotice from '../components/StateNotice.vue';

const router = useRouter();

const projects = ref<Project[]>([]);
const issues = ref<Issue[]>([]);
const actionItems = ref<ActionItem[]>([]);
const artifacts = ref<Artifact[]>([]);
const signals = ref<DashboardSignals | null>(null);
const signalsError = ref(false);
const loading = ref(true);
const loadError = ref<string | null>(null);

const apiMode = computed(() => !!window.API_BASE);

const todayStr = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

// ---- 상태 판별 헬퍼 ----------------------------------------------------------
const isDone = (s: string) => s === '완료' || s === 'Completed';
const isRiskType = (t: string) => (t || '').includes('리스크') || (t || '').toLowerCase().includes('risk');

// ---- KPI (0007 재정의) -------------------------------------------------------
// 진행 프로젝트: status ∉ {완료} — 지연·보류 포함, 종결 안 된 건 전부. 단계 분해 병기.
const activeProjects = computed(() => projects.value.filter((p) => p.status !== 'Completed'));
const activeBidding = computed(() => activeProjects.value.filter((p) => p.stage === 'BIDDING').length);
const activeExecution = computed(() => activeProjects.value.filter((p) => p.stage === 'EXECUTION').length);

const kpiDelayed = computed(() =>
  projects.value.filter(
    (p) => p.status === 'Delay' ||
      (p.endDate && p.endDate < todayStr && p.status !== 'Completed' && p.stage !== 'COMPLETED'),
  ).length,
);
const kpiOpenIssues = computed(() =>
  issues.value.filter((i) => i.status === '발생' || i.status === '조치중').length,
);
const kpiOpenActions = computed(() => actionItems.value.filter((a) => !isDone(a.status)).length);
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

const signalByProject = computed(() => {
  const m = new Map<number, { expected: number | null; delayPct: number | null }>();
  for (const s of signals.value?.signals ?? []) {
    m.set(s.projectId, { expected: s.expected, delayPct: s.delayPct });
  }
  return m;
});

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
      actual: p.progress,
      delta: sig?.delayPct ?? null,
      risk: ratio(risks),
      issue: ratio(pures),
      action: ratio(actions),
    };
  });
  // 기본 정렬: Δ 지연 큰 순(문제 프로젝트 위로). Δ 없음(폴백)은 뒤로, 동률은 이름순.
  return rows.sort((a, b) => {
    if (a.delta == null && b.delta == null) return a.p.name.localeCompare(b.p.name);
    if (a.delta == null) return 1;
    if (b.delta == null) return -1;
    return b.delta - a.delta || a.p.name.localeCompare(b.p.name);
  });
});

function fmtPct(v: number | null): string {
  return v == null ? '—' : `${Math.round(v)}%`;
}
function fmtDelta(v: number | null): string {
  if (v == null) return '—';
  const r = Math.round(v * 10) / 10;
  return r > 0 ? `+${r}%p` : `${r}%p`; // 양수=지연
}
function ratioText(r: Ratio): string {
  return r.total === 0 ? '—' : `${r.done}/${r.total}`;
}

// ---- 신호 위젯 (API_BASE 전용) ------------------------------------------------
const delaySignals = computed(() =>
  [...(signals.value?.signals ?? [])]
    .filter((s) => s.delayPct != null)
    .sort((a, b) => (b.delayPct ?? 0) - (a.delayPct ?? 0)),
);

const KIND_ORDER: Record<string, number> = { DELAY: 0, DUE_TODAY: 1, HIGH_PRIORITY: 2 };
const KIND_LABELS: Record<string, string> = { DELAY: '지연', DUE_TODAY: '오늘 마감', HIGH_PRIORITY: '고우선순위' };
const todayItems = computed(() =>
  [...(signals.value?.today ?? [])]
    .sort((a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9)),
);

function projectName(id: number): string {
  return projects.value.find((p) => p.id === id)?.name ?? `#${id}`;
}

// Today 항목 클릭 → 해당 상세(엔티티 유형별 탭 딥링크)
function openTodayItem(item: TodaySignalItem) {
  const tabByType: Record<string, string | undefined> = {
    PROJECT: undefined,
    ISSUE: 'issues',
    ACTION_ITEM: 'action-items',
    DELIVERABLE: 'artifacts',
  };
  const tab = tabByType[item.entityType];
  router.push({ path: `/projects/${item.projectId}`, query: tab ? { tab } : {} });
}

// ---- 진행률 바 차트·도넛(기존 유지) --------------------------------------------
const progressRows = computed(() =>
  [...projects.value]
    .filter((p) => p.stage !== 'COMPLETED')
    .sort((a, b) => b.progress - a.progress)
    .slice(0, 10),
);

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
  // 신호는 별도 로드 — 실패해도 대시보드 본체는 유지
  try {
    signals.value = await dataClient.dashboard.signals();
  } catch (e) {
    signalsError.value = true;
    console.error('[dashboard] 신호 로드 실패:', e);
  }
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

    <template v-if="!loading && !loadError && projects.length > 0">
      <!-- KPI 5종 (0007 재정의) -->
      <div class="kpis">
        <div class="kpi kpi-accent">
          <div class="kpi-value">{{ activeProjects.length }}</div>
          <div class="kpi-label">진행 프로젝트</div>
          <div class="kpi-break">입찰 {{ activeBidding }} · 수행 {{ activeExecution }}</div>
        </div>
        <div class="kpi kpi-red">
          <div class="kpi-value">{{ kpiDelayed }}</div>
          <div class="kpi-label">지연</div>
        </div>
        <div class="kpi kpi-yellow">
          <div class="kpi-value">{{ kpiOpenIssues }}</div>
          <div class="kpi-label">오픈 리스크·이슈 (전체)</div>
        </div>
        <div class="kpi kpi-blue">
          <div class="kpi-value">{{ kpiOpenActions }}</div>
          <div class="kpi-label">미결 액션아이템 (전체)</div>
        </div>
        <div class="kpi kpi-green">
          <div class="kpi-value">{{ kpiDueToday }}</div>
          <div class="kpi-label">오늘 마감</div>
        </div>
      </div>

      <!-- 신호 위젯 (0007 — API_BASE 전용) -->
      <div v-if="!apiMode" class="signal-off">
        신호 위젯(지연 신호·Today)은 백엔드 연동(API_BASE) 후 제공됩니다 — 폴백 모드에서는 숨김.
      </div>
      <div v-else class="charts">
        <section class="card">
          <h2 class="card-title">지연 신호 <span class="card-sub">기대 vs 실제, 지연 큰 순</span></h2>
          <div v-if="signalsError" class="card-empty">신호를 불러오지 못했습니다.</div>
          <div v-else-if="delaySignals.length === 0" class="card-empty">지연 신호가 없습니다.</div>
          <table v-else class="grid">
            <thead><tr><th>프로젝트</th><th class="num">목표</th><th class="num">실제</th><th class="num">Δ 지연</th><th></th></tr></thead>
            <tbody>
              <tr v-for="s in delaySignals" :key="s.projectId" class="row" @click="openDetail(s.projectId)">
                <td class="name">{{ s.projectName || projectName(s.projectId) }}</td>
                <td class="num">{{ fmtPct(s.expected) }}</td>
                <td class="num">{{ fmtPct(s.actual) }}</td>
                <td class="num" :class="(s.delayPct ?? 0) > 0 ? 'delta-bad' : 'delta-good'">{{ fmtDelta(s.delayPct) }}</td>
                <td><span v-if="s.fallbackUsed" class="tag">폴백 기대치</span></td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="card">
          <h2 class="card-title">Today — 오늘 확인 필요 <span class="card-sub">지연 &gt; 오늘마감 &gt; 고우선순위</span></h2>
          <div v-if="signalsError" class="card-empty">신호를 불러오지 못했습니다.</div>
          <div v-else-if="todayItems.length === 0" class="card-empty">오늘 확인할 항목이 없습니다.</div>
          <ul v-else class="today-list">
            <li v-for="(item, i) in todayItems" :key="i" class="today-item" @click="openTodayItem(item)">
              <span class="kind" :class="'kind-' + item.kind">{{ KIND_LABELS[item.kind] ?? item.kind }}</span>
              <span class="today-title">
                {{ item.title }}
                <span v-if="item.auto" class="auto-badge">자동</span>
              </span>
              <span class="today-meta">
                {{ item.projectName || projectName(item.projectId) }}
                <template v-if="item.dueDate"> · {{ item.dueDate }}</template>
                <template v-if="item.priority"> · {{ item.priority }}</template>
              </span>
            </li>
          </ul>
        </section>
      </div>

      <!-- 진행률 바 차트 + 사업유형 도넛 (유지) -->
      <div class="charts">
        <section class="card">
          <h2 class="card-title">프로젝트 진행률</h2>
          <div v-if="progressRows.length === 0" class="card-empty">진행 중인 프로젝트가 없습니다.</div>
          <div v-else class="bars">
            <div v-for="p in progressRows" :key="p.id" class="bar-row" @click="openDetail(p.id)">
              <span class="bar-name" :title="p.name">{{ p.name }}</span>
              <div class="bar-track">
                <div class="bar-fill" :style="{ width: Math.max(0, Math.min(100, p.progress)) + '%' }" />
              </div>
              <span class="bar-num">{{ p.progress }}%</span>
            </div>
          </div>
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

      <!-- 요약 테이블 (0007 확장) -->
      <section class="card">
        <h2 class="card-title">
          프로젝트 요약
          <span class="card-sub">Δ 지연 큰 순 · 해결/총은 현재 데이터 집계<template v-if="!apiMode">, 목표·Δ는 백엔드 연동 후</template></span>
        </h2>
        <table class="grid">
          <thead>
            <tr>
              <th>프로젝트명</th><th>단계</th>
              <th class="num">목표</th><th class="num">실제</th><th class="num">Δ 지연</th>
              <th class="num">리스크</th><th class="num">이슈</th><th class="num">액션</th>
              <th>PM</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in summaryRows" :key="r.p.id" class="row" @click="openDetail(r.p.id)">
              <td class="name">{{ r.p.name }}</td>
              <td><StageBadge :stage="r.p.stage" /></td>
              <td class="num">{{ fmtPct(r.expected) }}</td>
              <td class="num">{{ fmtPct(r.actual) }}</td>
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
    </template>
  </div>
</template>

<style scoped>
.title { font-size: 20px; margin: 0 0 4px; }
.sub { color: var(--muted); font-size: 13px; margin: 0 0 20px; }

.kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 16px; }
.kpi {
  background: var(--panel); border: 1px solid var(--border); border-radius: 10px;
  padding: 14px 16px;
}
.kpi-value { font-size: 26px; font-weight: 700; line-height: 1.2; }
.kpi-label { font-size: 12px; color: var(--muted); margin-top: 4px; }
.kpi-break { font-size: 11px; color: var(--text); margin-top: 3px; opacity: 0.85; }
.kpi-green .kpi-value { color: var(--green); }
.kpi-red .kpi-value { color: var(--red); }
.kpi-yellow .kpi-value { color: var(--yellow); }
.kpi-blue .kpi-value { color: var(--blue); }
.kpi-accent .kpi-value { color: var(--accent); }

.signal-off {
  padding: 10px 14px; margin-bottom: 16px; border-radius: 8px;
  background: var(--panel); border: 1px dashed var(--border);
  color: var(--muted); font-size: 12px;
}

.charts { display: grid; grid-template-columns: 1.4fr 1fr; gap: 12px; margin-bottom: 16px; }
.card {
  background: var(--panel); border: 1px solid var(--border); border-radius: 10px;
  padding: 16px; margin-bottom: 12px;
}
.card-title { font-size: 14px; margin: 0 0 14px; }
.card-sub { font-size: 11px; color: var(--muted); font-weight: 400; margin-left: 6px; }
.card-empty { font-size: 13px; color: var(--muted); }

.bars { display: flex; flex-direction: column; gap: 10px; }
.bar-row { display: flex; align-items: center; gap: 10px; cursor: pointer; }
.bar-row:hover .bar-name { color: var(--text); }
.bar-name {
  width: 180px; flex-shrink: 0; font-size: 12px; color: var(--muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.bar-track { flex: 1; height: 8px; border-radius: 999px; background: var(--panel-2); overflow: hidden; }
.bar-fill { height: 100%; border-radius: 999px; background: var(--accent); }
.bar-num { width: 40px; text-align: right; font-size: 12px; color: var(--muted); }

.donut-wrap { display: flex; align-items: center; gap: 20px; }
.donut { width: 150px; height: 150px; flex-shrink: 0; }
.donut-total { fill: var(--text); font-size: 20px; font-weight: 700; }
.donut-caption { fill: var(--muted); font-size: 9px; }
.legend { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 12px; }
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
  flex-shrink: 0; font-size: 10px; font-weight: 600;
  padding: 1px 7px; border-radius: 999px;
}
.kind-DELAY { color: var(--red); background: rgba(239, 68, 68, 0.12); }
.kind-DUE_TODAY { color: var(--yellow); background: rgba(251, 191, 36, 0.12); }
.kind-HIGH_PRIORITY { color: var(--accent); background: rgba(139, 92, 246, 0.12); }
.today-title { font-size: 13px; font-weight: 600; }
.today-meta { font-size: 11px; color: var(--muted); }
.auto-badge {
  font-size: 10px; font-weight: 600; color: var(--accent);
  border: 1px solid var(--accent); border-radius: 999px; padding: 0 6px; margin-left: 4px;
}

.grid { border-collapse: collapse; width: 100%; font-size: 13px; }
.grid th, .grid td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border); }
.grid th { color: var(--muted); font-weight: 600; font-size: 12px; }
.grid tbody tr:last-child td { border-bottom: 0; }
.grid .num { text-align: right; white-space: nowrap; }
.row { cursor: pointer; }
.row:hover { background: var(--panel-2); }
.name { font-weight: 600; }
.delta-bad { color: var(--red); font-weight: 600; }
.delta-good { color: var(--green); font-weight: 600; }
.tag {
  font-size: 10px; color: var(--muted);
  border: 1px solid var(--border); border-radius: 999px; padding: 0 6px;
}

@media (max-width: 1000px) {
  .kpis { grid-template-columns: repeat(2, 1fr); }
  .charts { grid-template-columns: 1fr; }
}
</style>
