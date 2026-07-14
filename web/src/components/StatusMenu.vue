<script setup lang="ts">
// 상태 변경 드롭다운(0023) — 재사용. 현재 상태 버튼 → '다음으로 전환:' 목록(가능한 모든 상태) +
//   '워크플로 보기'. 이슈/액션/태스크/산출물 공통. 실제 전이 실행·워크플로 데이터는 부모가 담당.
import { ref, onMounted, onBeforeUnmount } from 'vue';

export interface MenuTarget {
  toStatus: string;
  name?: string | null;        // 전이명(있으면 우선 표기)
  allowed: boolean;            // 조건 충족(비활성 시 사유 툴팁)
  commentRequired?: boolean;
  reason?: string;             // 비활성 사유
  transitionId?: number;       // 워크플로 엔진 전이 id(태스크/산출물)
}

const props = withDefaults(defineProps<{
  currentStatus: string;
  targets: MenuTarget[];
  disabled?: boolean;          // apiMode 게이트 등
  gateMessage?: string;
}>(), { disabled: false, gateMessage: '' });

const emit = defineEmits<{
  (e: 'select', t: MenuTarget): void;
  (e: 'viewWorkflow'): void;
}>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);

function toggle() { if (!props.disabled) open.value = !open.value; }
function choose(t: MenuTarget) {
  if (!t.allowed) return;
  open.value = false;
  emit('select', t);
}
function viewWf() { open.value = false; emit('viewWorkflow'); }

function onDocClick(ev: MouseEvent) {
  if (root.value && !root.value.contains(ev.target as Node)) open.value = false;
}
function onKey(ev: KeyboardEvent) { if (ev.key === 'Escape') open.value = false; }
onMounted(() => { document.addEventListener('click', onDocClick); window.addEventListener('keydown', onKey); });
onBeforeUnmount(() => { document.removeEventListener('click', onDocClick); window.removeEventListener('keydown', onKey); });
</script>

<template>
  <div ref="root" class="sm">
    <button class="trigger" type="button" :disabled="disabled" @click="toggle">
      <span class="cur">{{ currentStatus || '—' }}</span>
      <span class="caret">▾</span>
    </button>

    <div v-if="open" class="menu" role="menu">
      <div class="menu-head">다음으로 전환:</div>
      <div v-if="targets.length === 0" class="menu-empty">전환 가능한 상태가 없습니다.</div>
      <button
        v-for="t in targets" :key="t.toStatus + ':' + (t.transitionId ?? '')"
        class="menu-item" :class="{ disabled: !t.allowed }"
        type="button" :title="!t.allowed ? (t.reason || '전이 조건 미충족') : ''"
        @click="choose(t)"
      >
        <span class="arrow">→</span>
        <span class="to">{{ t.name || t.toStatus }}</span>
        <span v-if="t.name && t.name !== t.toStatus" class="to-code">{{ t.toStatus }}</span>
        <span v-if="t.commentRequired" class="req" title="사유 코멘트 필요">사유</span>
        <span v-if="!t.allowed" class="lock" title="전이 조건 미충족">🔒</span>
      </button>

      <div class="menu-sep" />
      <button class="menu-item wf" type="button" @click="viewWf">
        <span class="wf-ic">⋔</span> 워크플로 보기
      </button>
    </div>

    <p v-if="disabled && gateMessage" class="gate">{{ gateMessage }}</p>
  </div>
</template>

<style scoped>
.sm { position: relative; display: inline-block; }
.trigger {
  display: inline-flex; align-items: center; gap: 8px;
  border: 1px solid var(--border); background: var(--panel-2, var(--panel)); color: var(--text);
  font-size: 13px; font-weight: 600; padding: 6px 12px; border-radius: 8px; cursor: pointer;
}
.trigger:hover:not(:disabled) { border-color: var(--accent); }
.trigger:disabled { opacity: 0.6; cursor: default; }
.caret { font-size: 10px; color: var(--muted); }

.menu {
  position: absolute; z-index: 30; top: calc(100% + 4px); left: 0; min-width: 240px;
  background: var(--panel); border: 1px solid var(--border); border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35); padding: 6px; overflow: hidden;
}
.menu-head { font-size: 11px; color: var(--muted); padding: 6px 8px 4px; font-weight: 600; }
.menu-empty { font-size: 12px; color: var(--muted); padding: 6px 8px; }
.menu-item {
  display: flex; align-items: center; gap: 8px; width: 100%;
  border: 0; background: transparent; color: var(--text); text-align: left;
  font-size: 13px; padding: 8px 8px; border-radius: 7px; cursor: pointer;
}
.menu-item:hover { background: var(--panel-2, var(--bg)); }
.menu-item.disabled { color: var(--muted); cursor: default; }
.menu-item.disabled:hover { background: transparent; }
.arrow { color: var(--muted); flex-shrink: 0; }
.to { font-weight: 600; }
.to-code { font-size: 11px; color: var(--muted); }
.req {
  margin-left: auto; font-size: 10px; font-weight: 700; color: var(--yellow);
  border: 1px solid var(--yellow); border-radius: 999px; padding: 0 6px;
}
.lock { margin-left: auto; font-size: 11px; }
.menu-sep { height: 1px; background: var(--border); margin: 6px 4px; }
.menu-item.wf { color: var(--accent); font-weight: 600; }
.wf-ic { font-size: 14px; }
.gate { font-size: 11px; color: var(--muted); margin: 6px 0 0; }
</style>
