<script setup lang="ts">
// 배치8 — 공통 페이저(이전/다음 + 현재/총 페이지). BidNoticeSearchView pager 마크업/스타일 기준으로 통일.
//  - 총 페이지 1이면 렌더하지 않는다.
//  - page 갱신은 update:page 이벤트로(부모의 goPage/슬라이싱과 연결).
const props = defineProps<{
  page: number;
  totalPages: number;
  disabled?: boolean;
  total?: number; // 선택: 총 건수 표시
}>();

const emit = defineEmits<{ (e: 'update:page', value: number): void }>();

function go(p: number) {
  if (props.disabled) return;
  if (p < 1 || p > props.totalPages || p === props.page) return;
  emit('update:page', p);
}
</script>

<template>
  <div v-if="totalPages > 1" class="pager">
    <button class="btn" :disabled="disabled || page <= 1" @click="go(page - 1)">이전</button>
    <span class="page-info">
      {{ page }} / {{ totalPages }}
      <span v-if="total != null" class="page-total">(총 {{ total.toLocaleString('ko-KR') }}건)</span>
    </span>
    <button class="btn" :disabled="disabled || page >= totalPages" @click="go(page + 1)">다음</button>
  </div>
</template>

<style scoped>
.pager { display: flex; align-items: center; gap: 12px; justify-content: center; margin-top: 16px; }
.page-info { font-size: 13px; color: var(--muted); }
.page-total { opacity: 0.75; margin-left: 4px; }
</style>
