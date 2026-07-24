<script setup lang="ts">
// 산출물 상태 뱃지 — WF-1 색상(0004 P1-2):
// DRAFT 회색 / SUBMITTED 파랑 / UNDER_REVIEW 노랑 / REJECTED 빨강 / APPROVED 초록.
// DB에 한글 상태가 저장된 과도기 데이터도 같은 색으로 수렴시킨다.
import { computed } from 'vue';

const props = defineProps<{ status: string }>();

const ALIAS: Record<string, string> = {
  '작성중': 'DRAFT', '제출': 'SUBMITTED', '제출됨': 'SUBMITTED',
  '검토중': 'UNDER_REVIEW', '보완요청': 'REJECTED', '반려': 'REJECTED', '승인': 'APPROVED',
};
const kind = computed(() => {
  const s = (props.status || '').toUpperCase();
  if (['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'REJECTED', 'APPROVED'].includes(s)) return s;
  return ALIAS[props.status] ?? 'OTHER';
});
</script>

<template>
  <span class="badge" :class="'k-' + kind">{{ status || '—' }}</span>
</template>

<style scoped>
.badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  background: var(--panel-2);
  color: var(--muted);
}
.k-DRAFT { background: rgba(156, 163, 175, 0.15); color: var(--muted); }
.k-SUBMITTED { background: rgba(59, 130, 246, 0.15); color: var(--blue); }
.k-UNDER_REVIEW { background: rgba(251, 191, 36, 0.15); color: var(--yellow); }
.k-REJECTED { background: rgba(239, 68, 68, 0.15); color: var(--red); }
.k-APPROVED { background: rgba(52, 211, 153, 0.15); color: var(--green); }
</style>
