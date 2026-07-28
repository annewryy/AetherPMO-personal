<script setup lang="ts">
// 0039 — 폼/상세패널의 "관련 항목" 등 선택 섹션을 접어둔다(타이틀만 보이다가 클릭 시 펼침).
//   필요한 항목만 입력하는 폼이라 기본은 접힘 상태 — count가 있으면 배지로 몇 개 선택됐는지 표시.
import { ref } from 'vue';

const props = defineProps<{
  title: string;
  count?: number;
  defaultOpen?: boolean;
}>();

const open = ref(!!props.defaultOpen);
</script>

<template>
  <div class="collapsible" :class="{ open }">
    <button type="button" class="head" @click="open = !open">
      <span class="chevron">▸</span>
      <span class="title">{{ title }}</span>
      <span v-if="count" class="count">{{ count }}</span>
    </button>
    <div v-if="open" class="body">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.collapsible { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.head {
  width: 100%; display: flex; align-items: center; gap: 7px;
  background: var(--panel); border: 0; padding: 8px 10px; cursor: pointer;
  font-family: inherit; font-size: 13px; color: var(--text); text-align: left;
}
.head:hover { background: var(--panel-2, var(--panel)); }
.chevron { color: var(--muted); font-size: 11px; transition: transform 0.15s; flex-shrink: 0; }
.collapsible.open .chevron { transform: rotate(90deg); }
.title { flex: 1; font-weight: 600; }
.count {
  font-size: 11px; font-weight: 700; color: var(--accent);
  background: rgba(139, 92, 246, 0.14); border-radius: 999px; padding: 1px 8px;
}
.body { padding: 10px; border-top: 1px solid var(--border); }
</style>
