<script setup lang="ts">
// 워크플로 보기 모달(0023) — 상태 전체 + 전이(from→to)를 보여준다.
//   현재 상태·현재 상태에서 가능한 전이를 강조. 이슈/액션(사다리) / 태스크·산출물(엔진) 공통 뷰.
import { computed, onMounted, onBeforeUnmount } from 'vue';

export interface WfState { name: string; category?: string | null; isCurrent: boolean; isInitial?: boolean; isFinal?: boolean; }
export interface WfEdge { from: string; to: string; name?: string | null; fromCurrent: boolean; }

const props = defineProps<{
  title: string;
  states: WfState[];
  edges: WfEdge[];
  description?: string | null;
}>();

const emit = defineEmits<{ (e: 'close'): void }>();

function onKey(ev: KeyboardEvent) { if (ev.key === 'Escape') emit('close'); }
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

// 상태별 나가는 전이 묶음(from 기준).
const byFrom = computed(() => {
  const map = new Map<string, WfEdge[]>();
  for (const e of props.edges) {
    if (!map.has(e.from)) map.set(e.from, []);
    map.get(e.from)!.push(e);
  }
  return map;
});
function catClass(c: string | null | undefined): string {
  if (c === 'DONE') return 'cat-done';
  if (c === 'IN_PROGRESS') return 'cat-prog';
  if (c === 'TODO') return 'cat-todo';
  return '';
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="card" role="dialog" aria-modal="true">
      <div class="head">
        <h3 class="title">{{ title }}</h3>
        <button class="x" type="button" aria-label="닫기" @click="emit('close')">✕</button>
      </div>

      <div class="body">
        <p v-if="description" class="desc">{{ description }}</p>

        <!-- 상태 목록 -->
        <h4 class="sub">상태</h4>
        <div class="states">
          <span
            v-for="s in states" :key="s.name"
            class="chip" :class="[catClass(s.category), { current: s.isCurrent }]"
            :title="(s.isInitial ? '시작 · ' : '') + (s.isFinal ? '종료 · ' : '') + (s.isCurrent ? '현재 상태' : '')"
          >
            {{ s.name }}
            <span v-if="s.isCurrent" class="now">현재</span>
          </span>
        </div>

        <!-- 전이 목록(상태별) -->
        <h4 class="sub">전이</h4>
        <div class="flow">
          <div v-for="s in states" :key="'f-' + s.name" class="flow-row" :class="{ current: s.isCurrent }">
            <span class="from">{{ s.name }}</span>
            <div class="tos">
              <template v-if="(byFrom.get(s.name) || []).length">
                <span
                  v-for="(e, i) in byFrom.get(s.name)" :key="i"
                  class="edge" :class="{ avail: e.fromCurrent }"
                  :title="e.fromCurrent ? '현재 상태에서 가능' : ''"
                >→ {{ e.name || e.to }}<span v-if="e.name && e.name !== e.to" class="ecode"> ({{ e.to }})</span></span>
              </template>
              <span v-else class="edge none">→ (종료 · 나가는 전이 없음)</span>
            </div>
          </div>
        </div>

        <p class="legend"><span class="dot avail" /> 현재 상태에서 전환 가능</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed; inset: 0; z-index: 130;
  background: rgba(0, 0, 0, 0.55);
  display: flex; align-items: flex-start; justify-content: center; padding: 8vh 16px 16px; overflow-y: auto;
}
.card {
  width: 100%; max-width: 560px; background: var(--panel);
  border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  display: flex; flex-direction: column; max-height: 82vh;
}
.head { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--border); }
.title { font-size: 15px; margin: 0; }
.x { border: 0; background: transparent; color: var(--muted); font-size: 15px; cursor: pointer; padding: 4px; }
.x:hover { color: var(--text); }
.body { padding: 14px 18px; overflow-y: auto; }
.desc { font-size: 12.5px; color: var(--muted); margin: 0 0 12px; }
.sub { font-size: 12px; color: var(--muted); margin: 12px 0 8px; font-weight: 700; }

.states { display: flex; flex-wrap: wrap; gap: 8px; }
.chip {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 999px;
  background: var(--panel-2, var(--bg)); border: 1px solid var(--border); color: var(--text);
}
.chip.cat-todo { color: var(--muted); }
.chip.cat-prog { color: var(--blue, var(--accent)); border-color: var(--blue, var(--accent)); }
.chip.cat-done { color: var(--green); border-color: var(--green); }
.chip.current { outline: 2px solid var(--accent); outline-offset: 1px; }
.now { font-size: 10px; font-weight: 700; color: var(--accent); }

.flow { display: flex; flex-direction: column; gap: 2px; }
.flow-row { display: flex; gap: 12px; padding: 7px 8px; border-radius: 8px; align-items: baseline; }
.flow-row.current { background: rgba(99, 102, 241, 0.08); }
.from { min-width: 84px; font-size: 13px; font-weight: 700; flex-shrink: 0; }
.tos { display: flex; flex-wrap: wrap; gap: 6px 14px; }
.edge { font-size: 12.5px; color: var(--muted); }
.edge.avail { color: var(--accent); font-weight: 600; }
.edge.none { font-style: italic; }
.ecode { color: var(--muted); font-size: 11px; }
.legend { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--muted); margin: 14px 0 0; }
.dot { width: 8px; height: 8px; border-radius: 999px; display: inline-block; }
.dot.avail { background: var(--accent); }
</style>
