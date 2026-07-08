<script setup lang="ts">
// 0011 B-2/B-4/B-5 상태 변경·전이 코멘트 모달.
//  - required=true(COMMENT_REQUIRED 전이·상태 변경 사유 필수)면 빈 값 제출을 막는다.
//  - required=false면 코멘트는 선택(빈 값 허용).
//  - 실제 API 호출은 부모가 담당(submit 이벤트로 코멘트 문자열 전달) — 오류/로딩도 부모가 주입.
import { ref } from 'vue';
import ModalShell from './ModalShell.vue';

const props = defineProps<{
  title: string;
  message?: string;         // 안내 문구(예: "제출 → 검토중 전이")
  required?: boolean;       // 코멘트 필수 여부
  submitLabel?: string;     // 확인 버튼 라벨(기본: 확인)
  submitting?: boolean;     // 부모의 진행 상태(버튼 비활성)
  error?: string | null;    // 부모가 서버 {message} 그대로 주입
}>();

const emit = defineEmits<{
  (e: 'submit', comment: string): void;
  (e: 'close'): void;
}>();

const comment = ref('');
const localError = ref<string | null>(null);

function onSubmit() {
  const body = comment.value.trim();
  if (props.required && !body) {
    localError.value = '이 작업은 코멘트(사유)가 필요합니다.';
    return;
  }
  localError.value = null;
  emit('submit', body);
}
</script>

<template>
  <ModalShell :title="title" @close="emit('close')">
    <p v-if="message" class="msg">{{ message }}</p>
    <label class="label">
      코멘트<span v-if="required" class="req"> *</span>
      <span v-else class="opt">(선택)</span>
    </label>
    <textarea
      v-model="comment" class="input" rows="3"
      :placeholder="required ? '사유를 입력하세요' : '코멘트 (선택)'"
      :disabled="submitting"
    />
    <div v-if="localError || error" class="err">{{ localError || error }}</div>

    <template #footer>
      <button class="btn btn-sm" type="button" :disabled="submitting" @click="emit('close')">취소</button>
      <button
        class="btn btn-primary btn-sm" type="button"
        :disabled="submitting || (required && !comment.trim())"
        @click="onSubmit"
      >{{ submitting ? '처리 중…' : (submitLabel || '확인') }}</button>
    </template>
  </ModalShell>
</template>

<style scoped>
.msg { margin: 0; font-size: 13px; color: var(--text); }
.label { font-size: 12px; color: var(--muted); }
.req { color: var(--red); }
.opt { color: var(--muted); font-weight: 400; }
.input {
  background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); font-size: 13px; padding: 8px 10px; outline: none;
  font-family: inherit; resize: vertical;
}
.input:focus { border-color: var(--accent); }
.err { color: var(--red); font-size: 12px; }
</style>
