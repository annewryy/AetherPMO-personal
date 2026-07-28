<script setup lang="ts">
// 0011 작업 화면 공통 모달 셸 — 오버레이 + 카드 + 헤더/본문/푸터 슬롯.
// 등록 폼·전이 코멘트·상태 변경 등 여러 작업 화면에서 재사용(스타일 산발 방지).
// 닫기: 오버레이 클릭·Esc·✕ 버튼 → close 이벤트(부모가 v-if로 제어).
// 0039 — 본문(입력창 등)에서 텍스트를 드래그 선택하다 마우스가 오버레이 위에서 떼어지면
//   click의 target이 오버레이가 되어 @click.self만으로는 오발생(선택 중 모달 닫힘)했다.
//   mousedown도 오버레이 자체였을 때만 닫도록 페어링해서 드래그 종료는 무시한다.
import { onMounted, onBeforeUnmount, ref } from 'vue';

defineProps<{ title: string }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const downOnOverlay = ref(false);
function onOverlayMousedown(ev: MouseEvent) {
  downOnOverlay.value = ev.target === ev.currentTarget;
}
function onOverlayClick(ev: MouseEvent) {
  if (downOnOverlay.value && ev.target === ev.currentTarget) emit('close');
  downOnOverlay.value = false;
}

function onKey(ev: KeyboardEvent) {
  if (ev.key === 'Escape') emit('close');
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="overlay" @mousedown="onOverlayMousedown" @click="onOverlayClick">
    <div class="card" role="dialog" aria-modal="true">
      <div class="head">
        <h3 class="title">{{ title }}</h3>
        <button class="x" type="button" aria-label="닫기" @click="emit('close')">✕</button>
      </div>
      <div class="body">
        <slot />
      </div>
      <div v-if="$slots.footer" class="foot">
        <slot name="footer" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(0, 0, 0, 0.55);
  display: flex; align-items: flex-start; justify-content: center;
  padding: 8vh 16px 16px;
  overflow-y: auto;
}
.card {
  width: 100%; max-width: 480px;
  background: var(--panel); border: 1px solid var(--border); border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
}
.head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px; border-bottom: 1px solid var(--border);
}
.title { font-size: 16px; margin: 0; }
.x {
  border: 0; background: transparent; color: var(--muted);
  font-size: 16px; cursor: pointer; line-height: 1; padding: 4px;
}
.x:hover { color: var(--text); }
.body { padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; }
.foot {
  display: flex; align-items: center; justify-content: flex-end; gap: 10px;
  padding: 12px 18px; border-top: 1px solid var(--border);
}
</style>
