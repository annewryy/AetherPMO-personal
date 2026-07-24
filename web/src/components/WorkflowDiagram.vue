<script setup lang="ts">
// 워크플로 상태머신 다이어그램 (0004 P1-3 개정 — 단방향 화살표 나열 금지)
// - 주 흐름(초기→최종): 위→아래 세로 일렬 (2026-07-07 피드백 — 상세 패널 폭이
//   좁으므로 가로 스크롤 금지, SVG는 컨테이너 폭 100% viewBox 스케일)
// - 분기(전방 건너뜀) 전이: 오른쪽 곡선 / 역방향 전이: 왼쪽 곡선
// - 상태 노드: category 색(TODO 회색/IN_PROGRESS 파랑/DONE 초록, status.color 우선),
//   is_initial(진입 화살표)·is_final(이중 테두리) 시각 구분
// - 엣지 라벨 = 전이명, 조건(guard) 있으면 🔒N
// - 다이어그램 아래 전이 목록 표: 조건은 error_message 사람 문장 그대로
// SVG 자체 렌더(라이브러리 금지). 상태 5~6개 전제의 수동 레이아웃.
import { computed } from 'vue';
import type { Workflow, WorkflowStatus, WorkflowTransitionCondition } from '../types';

const props = defineProps<{ workflow: Workflow }>();

const NODE_W = 118;
const NODE_H = 30;
const GAP = 44;       // 노드 세로 간격(주 흐름 화살표 구간)
const TOP_M = 30;     // 초기 진입 화살표 공간
const BOT_M = 14;

const statuses = computed(() => props.workflow.statuses);
const indexById = computed(() => {
  const m = new Map<number, number>();
  statuses.value.forEach((s, i) => m.set(s.id, i));
  return m;
});
const nameById = computed(() => {
  const m = new Map<number, string>();
  for (const s of statuses.value) m.set(s.id, s.name);
  return m;
});

// 좌/우 곡선 개수 → 필요한 좌우 여백(가로 스크롤 금지: viewBox로 폭 흡수)
const sideCounts = computed(() => {
  let up = 0;
  let down = 0;
  for (const t of props.workflow.transitions) {
    const i = indexById.value.get(t.fromStatusId);
    const j = indexById.value.get(t.toStatusId);
    if (i == null || j == null) continue;
    if (j > i + 1 || j === i) up++;
    else if (j < i) down++;
  }
  return { up, down };
});

const rightRoom = computed(() => 96 + Math.max(0, sideCounts.value.up - 1) * 20);
const leftRoom = computed(() => 96 + Math.max(0, sideCounts.value.down - 1) * 20);
const svgWidth = computed(() => leftRoom.value + NODE_W + rightRoom.value);
const svgHeight = computed(() =>
  TOP_M + statuses.value.length * NODE_H + Math.max(0, statuses.value.length - 1) * GAP + BOT_M,
);

const centerX = computed(() => leftRoom.value + NODE_W / 2);
function nodeY(i: number): number {
  return TOP_M + i * (NODE_H + GAP);
}

const CATEGORY_COLORS: Record<string, string> = {
  TODO: '#9ca3af',
  IN_PROGRESS: '#3b82f6',
  DONE: '#34d399',
};
function color(s: WorkflowStatus): string {
  return s.color || CATEGORY_COLORS[s.category ?? ''] || '#9ca3af';
}

interface Edge {
  key: number;
  d: string;
  label: string;
  lx: number;
  ly: number;
  anchor: 'start' | 'middle' | 'end';
  kind: 'main' | 'branch' | 'back';
}

const edges = computed<Edge[]>(() => {
  const out: Edge[] = [];
  const cx = centerX.value;
  const rightX = cx + NODE_W / 2;
  const leftX = cx - NODE_W / 2;
  let branch = 0;
  let back = 0;
  for (const t of props.workflow.transitions) {
    const i = indexById.value.get(t.fromStatusId);
    const j = indexById.value.get(t.toStatusId);
    if (i == null || j == null) continue;
    const label = `${t.name || `${nameById.value.get(t.fromStatusId)}→${nameById.value.get(t.toStatusId)}`}${
      t.conditions.length ? ` 🔒${t.conditions.length}` : ''
    }`;

    if (j === i + 1) {
      // 주 흐름: 세로 직선, 라벨은 선 오른쪽
      const y1 = nodeY(i) + NODE_H;
      const y2 = nodeY(j);
      out.push({
        key: t.id, kind: 'main',
        d: `M ${cx} ${y1} L ${cx} ${y2 - 6}`,
        label, lx: cx + 7, ly: (y1 + y2) / 2 + 3, anchor: 'start',
      });
    } else if (j > i || j === i) {
      // 분기(전방 건너뜀)·자기 전이: 오른쪽 곡선
      const y1 = nodeY(i) + NODE_H / 2;
      const y2 = j === i ? y1 + 10 : nodeY(j) + NODE_H / 2;
      const off = 66 + branch * 20;
      branch++;
      const apexX = rightX + off / 2;
      out.push({
        key: t.id, kind: 'branch',
        d: `M ${rightX} ${y1} Q ${rightX + off} ${(y1 + y2) / 2} ${rightX + 2} ${y2}`,
        label, lx: apexX + 4, ly: (y1 + y2) / 2 - 6, anchor: 'start',
      });
    } else {
      // 역방향: 왼쪽 곡선
      const y1 = nodeY(i) + NODE_H / 2;
      const y2 = nodeY(j) + NODE_H / 2;
      const off = 66 + back * 20;
      back++;
      const apexX = leftX - off / 2;
      out.push({
        key: t.id, kind: 'back',
        d: `M ${leftX} ${y1} Q ${leftX - off} ${(y1 + y2) / 2} ${leftX - 2} ${y2}`,
        label, lx: apexX - 4, ly: (y1 + y2) / 2 - 6, anchor: 'end',
      });
    }
  }
  return out;
});

// 전이 목록 표 — 조건은 error_message(사람 문장) 그대로
function conditionText(list: WorkflowTransitionCondition[]): string {
  if (!list.length) return '—';
  return list
    .map((c) => c.errorMessage || `${c.subjectScope}${c.leftField ? `.${c.leftField}` : ''} ${c.operator}`)
    .join(' · ');
}

const tableRows = computed(() =>
  [...props.workflow.transitions]
    .filter((t) => indexById.value.has(t.fromStatusId) && indexById.value.has(t.toStatusId))
    .sort((a, b) =>
      (indexById.value.get(a.fromStatusId)! - indexById.value.get(b.fromStatusId)!) ||
      (indexById.value.get(a.toStatusId)! - indexById.value.get(b.toStatusId)!),
    ),
);

const initialIndex = computed(() => {
  const i = statuses.value.findIndex((s) => s.isInitial);
  return i >= 0 ? i : 0;
});
</script>

<template>
  <div class="diagram">
    <div class="wf-head">
      <span class="wf-name">{{ workflow.name }}</span>
      <span v-if="workflow.isDefault" class="wf-default">기본</span>
    </div>

    <div v-if="statuses.length === 0" class="empty">상태 정의가 없습니다.</div>
    <template v-else>
      <!-- 컨테이너 폭 100% viewBox 스케일 — 가로 스크롤 금지 -->
      <svg
        :viewBox="`0 0 ${svgWidth} ${svgHeight}`"
        class="svg" :style="{ maxWidth: svgWidth + 'px' }"
        preserveAspectRatio="xMidYMin meet" role="img"
        :aria-label="`${workflow.name} 상태머신 다이어그램`"
      >
        <defs>
          <marker id="wf-arrow" viewBox="0 0 10 10" refX="9" refY="5"
                  markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#9ca3af" />
          </marker>
        </defs>

        <!-- 엣지: 주 흐름 세로 직선 / 분기 오른쪽 곡선 / 역방향 왼쪽 곡선 -->
        <g v-for="e in edges" :key="e.key">
          <path :d="e.d" fill="none" marker-end="url(#wf-arrow)"
                :class="['edge', 'edge-' + e.kind]" />
          <text :x="e.lx" :y="e.ly" :text-anchor="e.anchor" class="edge-label">{{ e.label }}</text>
        </g>

        <!-- 초기 상태 진입 표시(위에서 아래로) -->
        <g>
          <circle :cx="centerX" :cy="nodeY(initialIndex) - 22" r="4" fill="#9ca3af" />
          <line :x1="centerX" :y1="nodeY(initialIndex) - 18" :x2="centerX" :y2="nodeY(initialIndex) - 6"
                stroke="#9ca3af" stroke-width="1.5" marker-end="url(#wf-arrow)" />
        </g>

        <!-- 상태 노드(세로 일렬) -->
        <g v-for="(s, i) in statuses" :key="s.id">
          <rect :x="centerX - NODE_W / 2" :y="nodeY(i)" :width="NODE_W" :height="NODE_H" rx="9"
                :stroke="color(s)" stroke-width="1.5"
                :fill="color(s)" fill-opacity="0.14" />
          <!-- 최종 상태: 이중 테두리 -->
          <rect v-if="s.isFinal" :x="centerX - NODE_W / 2 + 3" :y="nodeY(i) + 3"
                :width="NODE_W - 6" :height="NODE_H - 6" rx="6"
                :stroke="color(s)" stroke-width="1" fill="none" />
          <text :x="centerX" :y="nodeY(i) + NODE_H / 2 + 4"
                text-anchor="middle" class="node-label" :fill="color(s)">{{ s.name }}</text>
        </g>
      </svg>

      <table class="trans-table">
        <thead>
          <tr><th>현재 상태</th><th></th><th>다음 상태</th><th>전이명</th><th>조건</th></tr>
        </thead>
        <tbody>
          <tr v-for="t in tableRows" :key="t.id">
            <td>{{ nameById.get(t.fromStatusId) }}</td>
            <td class="arrow-cell">→</td>
            <td>{{ nameById.get(t.toStatusId) }}</td>
            <td>{{ t.name || '—' }}</td>
            <td class="cond" :class="{ none: !t.conditions.length }">{{ conditionText(t.conditions) }}</td>
          </tr>
          <tr v-if="tableRows.length === 0">
            <td colspan="5" class="cond none">정의된 전이가 없습니다.</td>
          </tr>
        </tbody>
      </table>
    </template>
  </div>
</template>

<style scoped>
.diagram { display: flex; flex-direction: column; gap: 10px; }
.wf-head { display: flex; align-items: center; gap: 8px; }
.wf-name { font-size: 14px; font-weight: 600; }
.wf-default {
  font-size: 11px; color: var(--muted);
  border: 1px solid var(--border); border-radius: 999px; padding: 0 7px;
}
.empty { font-size: 13px; color: var(--muted); }

/* 가로 스크롤 금지: 폭 100%(viewBox 비율 스케일), 원본 크기 이상 확대는 안 함 */
.svg { display: block; width: 100%; height: auto; margin: 0 auto; }
.edge { stroke: #9ca3af; stroke-width: 1.5; }
.edge-branch { stroke: var(--accent); }
.edge-back { stroke: var(--red); }
.edge-label { font-size: 11px; fill: var(--muted); }
.node-label { font-size: 12px; font-weight: 600; }

.trans-table { border-collapse: collapse; width: 100%; font-size: 13px; }
.trans-table th, .trans-table td {
  text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--border);
}
.trans-table th { color: var(--muted); font-weight: 600; font-size: 12px; }
.trans-table tbody tr:last-child td { border-bottom: 0; }
.arrow-cell { color: var(--muted); }
.cond { color: var(--text); }
.cond.none { color: var(--muted); }
</style>
