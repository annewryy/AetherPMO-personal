<script setup lang="ts">
// 0031 — 간트차트 탭: 계획 일정과 실적 일정을 이중 바로 병렬 표시.
//   행 = WBS 트리 평탄화(단계→활동→태스크). 태스크 행마다 계획 바(위)·실적 바(아래).
//   실적 종료가 없는 진행 중 태스크는 오늘까지 점선 연장으로 표시. 데이터는 GET /wbs 재사용.
//   기존 WBS/일정 탭은 그대로 두고 별도 탭으로 제공(너울님 2026-07-26 요구).
import { computed } from 'vue';
import type { WbsNode, ProjectWbs } from '../types';

const props = defineProps<{ wbs: ProjectWbs }>();

interface Row {
  node: WbsNode;
  depth: number; // 0 PHASE / 1 ACTIVITY / 2 TASK
}

const rows = computed<Row[]>(() => {
  const out: Row[] = [];
  for (const ph of props.wbs.phases ?? []) {
    out.push({ node: ph, depth: 0 });
    for (const a of ph.activities ?? []) {
      out.push({ node: a, depth: 1 });
      for (const t of a.tasks ?? []) out.push({ node: t, depth: 2 });
    }
  }
  return out;
});

const todayStr = new Date().toISOString().slice(0, 10);

// ---- 날짜 축(계획+실적+오늘 포괄) ------------------------------------------------
const range = computed(() => {
  let min: string | null = null;
  let max: string | null = null;
  const eat = (d: string | null | undefined) => {
    if (!d) return;
    if (!min || d < min) min = d;
    if (!max || d > max) max = d;
  };
  for (const { node } of rows.value) {
    eat(node.plannedStartDate); eat(node.plannedEndDate);
    eat(node.actualStartDate); eat(node.actualEndDate);
  }
  eat(todayStr);
  if (!min || !max) return null;
  // 여백: 앞뒤 7일
  const pad = (d: string, days: number) => {
    const t = new Date(`${d}T00:00:00`); t.setDate(t.getDate() + days);
    return t.toISOString().slice(0, 10);
  };
  return { min: pad(min, -7), max: pad(max, 7) };
});

function pct(d: string): number {
  const r = range.value!;
  const t0 = new Date(`${r.min}T00:00:00`).getTime();
  const t1 = new Date(`${r.max}T00:00:00`).getTime();
  const t = new Date(`${d}T00:00:00`).getTime();
  return Math.max(0, Math.min(100, ((t - t0) / (t1 - t0)) * 100));
}

function bar(start: string | null | undefined, end: string | null | undefined) {
  if (!start && !end) return null;
  const s = start ?? end!;
  const e = end ?? start!;
  const left = pct(s);
  const width = Math.max(0.8, pct(e) - left);
  return { left: `${left}%`, width: `${width}%` };
}

/** 실적 바 — 종료 미기록이면 오늘까지(ongoing 표시). */
function actualBar(node: WbsNode) {
  if (!node.actualStartDate) return null;
  const end = node.actualEndDate ?? (node.actualStartDate <= todayStr ? todayStr : node.actualStartDate);
  const b = bar(node.actualStartDate, end);
  return b ? { ...b, ongoing: !node.actualEndDate } : null;
}

/** 지연 판정: 계획 종료 경과 & 미완료(실적 종료 없음·진척<100). */
function isLate(node: WbsNode): boolean {
  if (!node.plannedEndDate || node.actualEndDate) return false;
  return node.plannedEndDate < todayStr && node.actualRate < 100;
}

// 월 눈금
const monthTicks = computed(() => {
  const r = range.value;
  if (!r) return [];
  const out: { label: string; left: number }[] = [];
  const d = new Date(`${r.min}T00:00:00`);
  d.setDate(1);
  while (d.toISOString().slice(0, 10) <= r.max) {
    const iso = d.toISOString().slice(0, 10);
    if (iso >= r.min) out.push({ label: `${d.getMonth() + 1}월`, left: pct(iso) });
    d.setMonth(d.getMonth() + 1);
  }
  return out;
});

const todayLeft = computed(() => (range.value ? pct(todayStr) : null));
</script>

<template>
  <div v-if="!range" class="empty">계획·실적 일정이 입력된 항목이 없습니다 — 태스크 상세에서 일정을 지정하세요.</div>
  <div v-else class="gantt">
    <div class="legend">
      <span class="lg"><i class="sw planned" /> 계획</span>
      <span class="lg"><i class="sw actual" /> 실적</span>
      <span class="lg"><i class="sw actual ongoing" /> 실적(진행 중 — 오늘까지)</span>
      <span class="lg"><i class="sw late" /> 지연</span>
    </div>
    <div class="grid">
      <!-- 좌: 이름 열 -->
      <div class="names">
        <div class="head-cell">WBS</div>
        <div
          v-for="{ node, depth } in rows" :key="node.nodeId"
          class="name-cell" :class="`d${depth}`"
        >
          <span v-if="node.code" class="code">{{ node.code }}</span>
          {{ node.name }}
        </div>
      </div>
      <!-- 우: 타임라인 -->
      <div class="timeline">
        <div class="head-cell axis">
          <span v-for="m in monthTicks" :key="m.label + m.left" class="tick" :style="{ left: m.left + '%' }">{{ m.label }}</span>
        </div>
        <div v-for="{ node, depth } in rows" :key="node.nodeId" class="lane" :class="`d${depth}`">
          <span v-for="m in monthTicks" :key="'g' + m.left" class="gridline" :style="{ left: m.left + '%' }" />
          <span v-if="todayLeft != null" class="today" :style="{ left: todayLeft + '%' }" />
          <template v-if="depth === 2">
            <span v-if="bar(node.plannedStartDate, node.plannedEndDate)" class="bar planned"
                  :style="bar(node.plannedStartDate, node.plannedEndDate)!"
                  :title="`계획 ${node.plannedStartDate ?? '?'} ~ ${node.plannedEndDate ?? '?'}`" />
            <span v-if="actualBar(node)" class="bar actual"
                  :class="{ ongoing: actualBar(node)!.ongoing, late: isLate(node) }"
                  :style="{ left: actualBar(node)!.left, width: actualBar(node)!.width }"
                  :title="`실적 ${node.actualStartDate} ~ ${node.actualEndDate ?? '진행 중'}`" />
          </template>
          <template v-else>
            <span v-if="bar(node.plannedStartDate, node.plannedEndDate)" class="bar rollup"
                  :style="bar(node.plannedStartDate, node.plannedEndDate)!" />
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.empty { color: var(--muted); font-size: 14px; padding: 16px; }
.gantt { display: flex; flex-direction: column; gap: 10px; }
.legend { display: flex; gap: 16px; font-size: 12.5px; color: var(--muted); }
.lg { display: inline-flex; align-items: center; gap: 6px; }
.sw { display: inline-block; width: 18px; height: 8px; border-radius: 3px; }
.sw.planned { border: 1.5px solid var(--accent); background: color-mix(in srgb, var(--accent) 18%, transparent); }
.sw.actual { background: var(--green); }
.sw.actual.ongoing { background: repeating-linear-gradient(45deg, var(--green), var(--green) 3px, transparent 3px, transparent 6px); }
.sw.late { background: var(--red); }

.grid { display: flex; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
.names { width: 300px; flex-shrink: 0; border-right: 1px solid var(--border); }
.head-cell {
  height: 34px; display: flex; align-items: center; padding: 0 12px;
  font-size: 12.5px; font-weight: 600; color: var(--muted);
  border-bottom: 1px solid var(--border); background: var(--panel);
}
.name-cell {
  height: 34px; display: flex; align-items: center; gap: 6px; padding: 0 12px;
  font-size: 13px; border-bottom: 1px solid var(--border);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.name-cell.d0 { font-weight: 700; background: var(--panel); }
.name-cell.d1 { padding-left: 24px; font-weight: 600; }
.name-cell.d2 { padding-left: 40px; color: var(--text); }
.code { color: var(--muted); font-family: ui-monospace, monospace; font-size: 11px; flex-shrink: 0; }

.timeline { flex: 1; min-width: 0; overflow-x: auto; position: relative; }
.head-cell.axis { position: relative; padding: 0; }
.tick {
  position: absolute; top: 0; height: 100%; display: flex; align-items: center;
  padding-left: 6px; font-size: 11px; color: var(--muted);
  border-left: 1px solid var(--border);
}
.lane { position: relative; height: 34px; border-bottom: 1px solid var(--border); }
.lane.d0 { background: var(--panel); }
.gridline { position: absolute; top: 0; bottom: 0; border-left: 1px dashed color-mix(in srgb, var(--border) 60%, transparent); }
.today { position: absolute; top: 0; bottom: 0; border-left: 2px solid var(--yellow); z-index: 2; }

.bar { position: absolute; border-radius: 4px; z-index: 1; }
.bar.planned {
  top: 5px; height: 10px;
  border: 1.5px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 16%, transparent);
}
.bar.actual { bottom: 5px; height: 10px; background: var(--green); }
.bar.actual.ongoing {
  background: repeating-linear-gradient(45deg, var(--green), var(--green) 4px,
    color-mix(in srgb, var(--green) 35%, transparent) 4px, color-mix(in srgb, var(--green) 35%, transparent) 8px);
}
.bar.actual.late { background: var(--red); }
.bar.rollup {
  top: 12px; height: 8px; opacity: 0.55;
  background: color-mix(in srgb, var(--accent) 35%, transparent);
}
</style>
