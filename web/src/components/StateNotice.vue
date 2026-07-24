<script setup lang="ts">
// 로딩/오류/빈 상태 공통 안내 박스 — 수용 기준: 설정 없어도 "에러 화면"이 아닌 빈 상태 안내.
defineProps<{
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyText?: string;
}>();
</script>

<template>
  <div v-if="loading" class="notice">불러오는 중…</div>
  <div v-else-if="error" class="notice">
    데이터를 불러오지 못했습니다. 백엔드(API_BASE) 또는 Supabase 설정을 확인하세요.
    <span class="detail">({{ error }})</span>
  </div>
  <div v-else-if="empty" class="notice">
    {{ emptyText || '데이터가 없습니다 — 데이터 소스(백엔드 API 또는 Supabase 시드) 연결 후 표시됩니다.' }}
  </div>
</template>

<style scoped>
.notice {
  padding: 16px; border-radius: 8px;
  background: var(--panel); border: 1px solid var(--border); color: var(--muted); font-size: 14px;
}
.notice .detail { opacity: 0.7; }
</style>
