<script setup lang="ts">
// 배치20 — 프로젝트 상세 "WBS/일정" 탭 본문.
// 왼쪽 표(WBS 단계→활동→태스크: 담당자·상태·목표%·실제%·Δ 숫자)
//   + 오른쪽 날짜 축 간트(계획 시작~종료 바 + 실제% 채움 + 오늘 선, 오늘 못 넘긴 태스크는 지연=빨강).
// 진척률은 바가 아니라 숫자로 표(목업 확정). 간트 바 안 채움은 진행 시각화 보조.
// 계약: GET /api/projects/{id}/wbs → { projectId, phases:[phase] }, phase.activities[], activity.tasks[].
// null 값은 "미정"/"—"로 표시(더미 금지). targetRate null이면 목표·Δ "—".
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import type { WbsNode } from '../types';

const props = defineProps<{ wbs: import('../types').ProjectWbs }>();

const router = useRouter();

// 배치23 B안 + 0031 수정: TASK 행 클릭 → 태스크 상세(/tasks/{taskId}).
//   nodeId는 카탈로그 노드 id라 상세 이동에 쓰면 404 — 실제 pms_task.task_id(taskId)로 이동한다.
//   taskId가 없으면(전개 매핑 없음) 이동하지 않는다.
function openTask(node: WbsNode) {
  if (node.nodeType !== 'TASK' || node.taskId == null) return;
  router.push(`/tasks/${node.taskId}`);
}

// ---- 트리 평탄화(표·간트 공통 행) ------------------------------------------------
interface FlatRow {
  node: WbsNode;
  depth: number;      // 0 PHASE / 1 ACTIVITY / 2 TASK
  health: Health;
}

const rows = computed<FlatRow[]>(() => {
  const out: FlatRow[] = [];
  for (const phase of props.wbs.phases ?? []) {
    out.push({ node: phase, depth: 0, health: health(phase) });
    for (const activity of phase.activities ?? []) {
      out.push({ node: activity, depth: 1, health: health(activity) });
      for (const task of activity.tasks ?? []) {
        out.push({ node: task, depth: 2, health: health(task) });
      }
    }
  }
  return out;
});

const isEmpty = computed(() => rows.value.length === 0);

// ---- 날짜 축 도메인(전체 태스크 계획일정 min/max) --------------------------------
// ISO yyyy-MM-dd → epoch day. 유효 일정이 있는 노드만 축에 반영.
function toDay(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso + 'T00:00:00Z');
  return Number.isFinite(t) ? Math.floor(t / 86400000) : null;
}
function fromDay(day: number): Date {
  return new Date(day * 86400000);
}
const today = new Date();
const todayDay = Math.floor(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 86400000);

// ---- 노드 건강도(지연/미착수) ----------------------------------------------------
// 사용자 요구: "목표 시작일이 지났는데 아직 착수 못함"도 지연으로 보여야 한다(종료 초과만이 아니라).
interface Health {
  delayed: boolean;   // 간트 바 빨강 처리 대상
  notStarted: boolean; // 착수해야 하는데 미착수(빨강 "미착수 Nd" 뱃지)
  overdue: boolean;   // 종료일 지났는데 미완료
  lateDays: number;   // 지연 일수(종료 초과 우선, 없으면 시작 초과)
}
function health(node: WbsNode): Health {
  const s = toDay(node.plannedStartDate);
  const e = toDay(node.plannedEndDate);
  const done = node.actualRate >= 100 || node.status === 'DONE';
  const started = node.actualRate > 0 || node.status === 'IN_PROGRESS' || node.status === 'REVIEW';
  const notStarted = s != null && todayDay >= s && !started && !done;
  const overdue = e != null && todayDay > e && !done;
  const behind = node.delta != null && node.delta < 0;
  const delayed = !done && (overdue || behind || notStarted);
  let lateDays = 0;
  if (overdue && e != null) lateDays = todayDay - e;
  else if (notStarted && s != null) lateDays = todayDay - s;
  return { delayed, notStarted, overdue, lateDays };
}

interface Domain { min: number; max: number; span: number; }

const domain = computed<Domain | null>(() => {
  let min: number | null = null;
  let max: number | null = null;
  const consider = (iso: string | null | undefined) => {
    const d = toDay(iso);
    if (d == null) return;
    if (min == null || d < min) min = d;
    if (max == null || d > max) max = d;
  };
  for (const { node } of rows.value) {
    consider(node.plannedStartDate);
    consider(node.plannedEndDate);
  }
  if (min == null || max == null) return null;
  // 오늘 선을 축 안에 담기 위해 오늘도 도메인에 포함.
  if (todayDay < min) min = todayDay;
  if (todayDay > max) max = todayDay;
  // 좌우 여백(전체 span의 3%, 최소 1일)으로 바가 축 끝에 붙지 않게.
  const rawSpan = Math.max(1, max - min);
  const pad = Math.max(1, Math.round(rawSpan * 0.03));
  min -= pad;
  max += pad;
  return { min, max, span: max - min };
});

// 도메인 안 위치를 0~100%로 정규화.
function pct(day: number, d: Domain): number {
  return ((day - d.min) / d.span) * 100;
}

const todayPct = computed(() => {
  const d = domain.value;
  return d ? pct(todayDay, d) : null;
});

// ---- 날짜 축 눈금(월 경계) -------------------------------------------------------
interface Tick { pos: number; label: string; }
const ticks = computed<Tick[]>(() => {
  const d = domain.value;
  if (!d) return [];
  const out: Tick[] = [];
  const start = fromDay(d.min);
  // 도메인 시작월의 1일부터 매월 1일 눈금.
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth();
  // 첫 눈금은 시작월(포함) 또는 다음 달 1일.
  for (let guard = 0; guard < 240; guard++) {
    const firstOfMonth = Math.floor(Date.UTC(y, m, 1) / 86400000);
    if (firstOfMonth > d.max) break;
    if (firstOfMonth >= d.min) {
      out.push({ pos: pct(firstOfMonth, d), label: `${y}.${String(m + 1).padStart(2, '0')}` });
    }
    m += 1;
    if (m > 11) { m = 0; y += 1; }
  }
  return out;
});

// ---- 간트 바 계산(노드별) --------------------------------------------------------
interface Bar {
  left: number;     // %
  width: number;    // %
  fill: number;     // 채움 %(actualRate, 0~100)
  delayed: boolean; // 오늘까지 실제 진행이 못 따라잡은 지연 상태(빨강)
}

function bar(node: WbsNode): Bar | null {
  const d = domain.value;
  if (!d) return null;
  const s = toDay(node.plannedStartDate);
  const e = toDay(node.plannedEndDate);
  if (s == null || e == null) return null;
  const end = Math.max(e, s); // 방어(역전 방지)
  const left = pct(s, d);
  const right = pct(end, d);
  const width = Math.max(0.6, right - left); // 하루짜리도 보이게 최소 폭.
  const fill = Math.max(0, Math.min(100, node.actualRate));
  // 지연 판정은 health()로 일원화(종료 초과·목표 뒤처짐·미착수 지연 포함).
  const delayed = health(node).delayed;
  return { left, width, fill, delayed };
}

// ---- 표 표시 헬퍼 ---------------------------------------------------------------
const STATUS_LABELS: Record<string, string> = {
  TODO: '예정', IN_PROGRESS: '진행중', REVIEW: '검토중', REJECTED: '반려', DONE: '완료',
};
function statusLabel(s: string | null): string {
  if (!s) return '';
  return STATUS_LABELS[s] ?? s;
}
function statusClass(s: string | null): string {
  return s ? 'st-' + s : '';
}

function typeLabel(t: WbsNode['nodeType']): string {
  return t === 'PHASE' ? '단계' : t === 'ACTIVITY' ? '활동' : '태스크';
}

function fmtDate(v: string | null | undefined): string {
  return v ? String(v) : '—';
}

// 목표일정을 날짜 숫자로 표기(요구 ②). yyyy-MM-dd → MM/DD, 목표 시작~종료.
function shortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[2]}/${m[3]}` : String(iso);
}
function fmtRange(s: string | null | undefined, e: string | null | undefined): string {
  if (!s && !e) return '—';
  return `${shortDate(s)} ~ ${shortDate(e)}`;
}

// Δ 색: 음수 빨강(지연) / 양수 초록(앞섬) / 0 중립 / null(미정) —.
function deltaClass(delta: number | null): string {
  if (delta == null) return 'd-none';
  if (delta < 0) return 'd-neg';
  if (delta > 0) return 'd-pos';
  return 'd-zero';
}
function deltaText(delta: number | null): string {
  if (delta == null) return '—';
  return (delta > 0 ? '+' : '') + delta;
}

function rateText(v: number | null): string {
  return v == null ? '—' : v + '%';
}
</script>

<template>
  <div v-if="isEmpty" class="card-empty">
    WBS 전개 전입니다 — 테일러링(단계·활동·태스크) 전개 후 일정이 표시됩니다.
  </div>

  <div v-else class="wbs">
    <!-- 헤더: 왼쪽 표 컬럼 + 오른쪽 날짜 축 눈금 -->
    <div class="wbs-head">
      <div class="col-tree">WBS</div>
      <div class="col-assignee">담당자</div>
      <div class="col-range">목표기간</div>
      <div class="col-status">상태</div>
      <div class="col-num">목표%</div>
      <div class="col-num">실제%</div>
      <div class="col-num">지연</div>
      <div class="col-gantt">
        <div v-if="domain" class="axis">
          <span
            v-for="(t, i) in ticks" :key="i"
            class="tick" :style="{ left: t.pos + '%' }"
          >
            <span class="tick-line" />
            <span class="tick-label">{{ t.label }}</span>
          </span>
          <span
            v-if="todayPct != null && todayPct >= 0 && todayPct <= 100"
            class="today-head" :style="{ left: todayPct + '%' }"
          >오늘</span>
        </div>
        <div v-else class="axis axis-none">일정 미정</div>
      </div>
    </div>

    <!-- 바디: 노드 행 -->
    <div class="wbs-body">
      <div
        v-for="(row, i) in rows" :key="row.node.nodeId + '-' + i"
        class="wbs-row" :class="'lvl-' + row.depth"
      >
        <div class="col-tree" :style="{ paddingLeft: 8 + row.depth * 20 + 'px' }">
          <span class="type-tag" :class="'ty-' + row.node.nodeType">{{ typeLabel(row.node.nodeType) }}</span>
          <span
            v-if="row.node.nodeType === 'TASK'"
            class="node-name task-link" :title="row.node.name + ' — 상세 열기'"
            role="link" tabindex="0"
            @click="openTask(row.node)"
            @keydown.enter="openTask(row.node)"
          >{{ row.node.name }}</span>
          <span v-else class="node-name" :title="row.node.name">{{ row.node.name }}</span>
          <span
            v-if="row.health.notStarted"
            class="flag flag-late"
            :title="`목표 시작일(${fmtDate(row.node.plannedStartDate)})이 지났으나 아직 착수하지 않음`"
          >미착수 {{ row.health.lateDays }}일</span>
          <span
            v-else-if="row.health.overdue"
            class="flag flag-over"
            :title="`목표 종료일(${fmtDate(row.node.plannedEndDate)})을 ${row.health.lateDays}일 초과`"
          >지연 {{ row.health.lateDays }}일</span>
        </div>
        <div class="col-assignee">{{ row.node.assigneeName || '—' }}</div>
        <div class="col-range" :class="{ late: row.health.delayed }">{{ fmtRange(row.node.plannedStartDate, row.node.plannedEndDate) }}</div>
        <div class="col-status">
          <span v-if="row.node.status" class="status-pill" :class="statusClass(row.node.status)">
            {{ statusLabel(row.node.status) }}
          </span>
          <span v-else class="muted">—</span>
        </div>
        <div class="col-num">{{ rateText(row.node.targetRate) }}</div>
        <div class="col-num strong">{{ rateText(row.node.actualRate) }}</div>
        <div class="col-num" :class="deltaClass(row.node.delta)">{{ deltaText(row.node.delta) }}</div>

        <!-- 날짜 축 간트 셀 -->
        <div class="col-gantt">
          <div class="lane">
            <!-- 오늘 선(각 행에도 그어 위치 대응) -->
            <span
              v-if="todayPct != null && todayPct >= 0 && todayPct <= 100"
              class="today-line" :style="{ left: todayPct + '%' }"
            />
            <template v-if="bar(row.node)">
              <div
                class="bar" :class="{ delayed: bar(row.node)!.delayed }"
                :style="{ left: bar(row.node)!.left + '%', width: bar(row.node)!.width + '%' }"
                :title="`${fmtDate(row.node.plannedStartDate)} ~ ${fmtDate(row.node.plannedEndDate)} · 실제 ${row.node.actualRate}%`"
              >
                <span class="bar-fill" :style="{ width: bar(row.node)!.fill + '%' }" />
              </div>
            </template>
            <span v-else class="no-plan">일정 미정</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 범례 -->
    <div class="legend">
      <span class="lg"><span class="sw sw-bar" /> 계획 시작~종료</span>
      <span class="lg"><span class="sw sw-fill" /> 실제 진척(채움)</span>
      <span class="lg"><span class="sw sw-delayed" /> 지연(종료 초과·미착수)</span>
      <span class="lg"><span class="sw sw-today" /> 오늘</span>
      <span class="lg muted">진척률은 표의 목표%·실제%·지연 숫자로 표기</span>
    </div>
  </div>
</template>

<style scoped>
.wbs { font-size: 14px; }

/* 그리드 컬럼: 표 6열 + 간트 1열(가변). CSS 변수로 head/body 공유. */
.wbs-head, .wbs-row {
  display: grid;
  grid-template-columns:
    minmax(210px, 1.5fr)  /* WBS 트리 */
    92px                  /* 담당자 */
    112px                 /* 목표기간(날짜) */
    72px                  /* 상태 */
    54px 54px 48px        /* 목표%·실제%·Δ */
    minmax(260px, 2.2fr); /* 간트 */
  align-items: center;
}

.wbs-head {
  border-bottom: 2px solid var(--border);
  color: var(--muted);
  font-size: 13px;
  font-weight: 600;
  padding-bottom: 6px;
}
.wbs-head > div { padding: 0 8px; }
.col-num { text-align: right; }

/* 날짜 축 */
.col-gantt { position: relative; }
.axis { position: relative; height: 24px; }
.axis-none { color: var(--muted); font-weight: 400; font-size: 13px; line-height: 24px; }
.tick { position: absolute; top: 0; transform: translateX(-50%); text-align: center; }
.tick-line { display: block; width: 1px; height: 6px; margin: 0 auto; background: var(--border); }
.tick-label { display: block; font-size: 11px; color: var(--muted); white-space: nowrap; }
.today-head {
  position: absolute; top: 2px; transform: translateX(-50%);
  font-size: 11px; font-weight: 700; color: var(--red); white-space: nowrap;
}

/* 바디 행 */
.wbs-body { }
.wbs-row {
  border-bottom: 1px solid var(--border);
  min-height: 34px;
}
.wbs-row > div { padding: 5px 8px; }
.wbs-row.lvl-0 { background: var(--panel); font-weight: 600; }
.wbs-row.lvl-1 { background: transparent; }
.wbs-row.lvl-0 .node-name { font-weight: 700; }
.wbs-row.lvl-1 .node-name { font-weight: 600; }

.col-tree { display: flex; align-items: center; gap: 7px; min-width: 0; }
.node-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.task-link { cursor: pointer; color: var(--blue); }
.task-link:hover { text-decoration: underline; }
.task-link:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 3px; }
.type-tag {
  flex-shrink: 0; font-size: 11px; font-weight: 600;
  padding: 1px 6px; border-radius: 999px; background: var(--panel-2); color: var(--muted);
}
.ty-PHASE { color: var(--accent); background: rgba(99, 102, 241, 0.12); }
.ty-ACTIVITY { color: var(--blue); background: rgba(59, 130, 246, 0.12); }
.ty-TASK { color: var(--green); background: rgba(52, 211, 153, 0.12); }

.col-assignee { color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.col-range { font-variant-numeric: tabular-nums; color: var(--text); white-space: nowrap; font-size: 13px; }
.col-range.late { color: var(--red); font-weight: 600; }
.strong { font-weight: 700; }
.muted { color: var(--muted); }

/* 미착수/지연 뱃지(트리 셀) */
.flag {
  flex-shrink: 0; font-size: 11px; font-weight: 700;
  padding: 1px 6px; border-radius: 999px; white-space: nowrap;
}
.flag-late { color: var(--red); background: rgba(239, 68, 68, 0.14); border: 1px solid rgba(239, 68, 68, 0.4); }
.flag-over { color: var(--yellow); background: rgba(251, 191, 36, 0.14); border: 1px solid rgba(251, 191, 36, 0.4); }

/* 상태 pill */
.status-pill {
  font-size: 12px; font-weight: 600;
  padding: 1px 8px; border-radius: 999px; background: var(--panel-2); color: var(--muted);
}
.st-IN_PROGRESS { color: var(--blue); background: rgba(59, 130, 246, 0.12); }
.st-REVIEW { color: var(--yellow); background: rgba(251, 191, 36, 0.12); }
.st-REJECTED { color: var(--red); background: rgba(239, 68, 68, 0.12); }
.st-DONE { color: var(--green); background: rgba(52, 211, 153, 0.12); }

/* Δ 색 */
.d-neg { color: var(--red); font-weight: 700; }
.d-pos { color: var(--green); font-weight: 700; }
.d-zero { color: var(--text); }
.d-none { color: var(--muted); }

/* 간트 레인 */
.lane { position: relative; height: 20px; }
.bar {
  position: absolute; top: 3px; height: 14px;
  background: rgba(59, 130, 246, 0.22);
  border: 1px solid var(--blue);
  border-radius: 4px; overflow: hidden;
}
.bar-fill {
  position: absolute; left: 0; top: 0; bottom: 0;
  background: var(--blue);
}
.bar.delayed { border-color: var(--red); background: rgba(239, 68, 68, 0.18); }
.bar.delayed .bar-fill { background: var(--red); }
.today-line {
  position: absolute; top: -2px; bottom: -2px; width: 2px;
  background: var(--red); opacity: 0.55; z-index: 1; transform: translateX(-1px);
}
.no-plan { font-size: 12px; color: var(--muted); line-height: 20px; }

/* 범례 */
.legend {
  display: flex; flex-wrap: wrap; gap: 14px; align-items: center;
  margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--border);
  font-size: 13px; color: var(--muted);
}
.lg { display: inline-flex; align-items: center; gap: 6px; }
.sw { display: inline-block; width: 22px; height: 12px; border-radius: 3px; }
.sw-bar { background: rgba(59, 130, 246, 0.22); border: 1px solid var(--blue); }
.sw-fill { background: var(--blue); }
.sw-delayed { background: rgba(239, 68, 68, 0.18); border: 1px solid var(--red); }
.sw-today { width: 3px; background: var(--red); border-radius: 0; }

.card-empty { font-size: 14px; color: var(--muted); padding: 8px 0; }

@media (max-width: 1100px) {
  .wbs-head, .wbs-row {
    grid-template-columns: minmax(170px, 1.3fr) 80px 100px 64px 46px 46px 42px minmax(200px, 1.9fr);
  }
}
</style>
