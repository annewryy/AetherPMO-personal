<script setup lang="ts">
// 담당자/PM 입력 필드(0020) — 재사용.
//   텍스트 입력(직접 타이핑 가능) + '조직도' 버튼 → OrgPickerModal로 조직도에서 선택.
//   선택 시 이름을 v-model로 채우고, 필요하면 pick 이벤트로 전체 OrgPick도 전달.
//   PM·프로젝트 담당자·이슈/액션/태스크/산출물 담당자 등 이름 기반 필드 어디서든 사용.
import { ref } from 'vue';
import OrgPickerModal from './OrgPickerModal.vue';
import type { OrgPick } from '../types';

withDefaults(defineProps<{
  modelValue: string;
  placeholder?: string;
  disabled?: boolean;
  roots?: 'both' | 'internal' | 'external';
  allowNewExternal?: boolean;
  title?: string;
}>(), { placeholder: '이름', disabled: false, roots: 'both', allowNewExternal: false, title: '담당자 선택' });

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void;
  (e: 'pick', p: OrgPick): void;
}>();

const show = ref(false);

function onPick(p: OrgPick) {
  show.value = false;
  if (p.source === 'NEW_EXTERNAL') return; // 신규 외부는 직접 타이핑 유도(입력은 그대로 둠)
  emit('update:modelValue', p.name ?? '');
  emit('pick', p);
}
</script>

<template>
  <div class="opf">
    <input
      class="input opf-in" type="text"
      :value="modelValue" :placeholder="placeholder" :disabled="disabled"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <button class="opf-btn" type="button" :disabled="disabled" @click="show = true">조직도</button>
  </div>

  <OrgPickerModal
    v-if="show"
    :roots="roots" :allow-new-external="allowNewExternal" :title="title"
    @select="onPick" @close="show = false"
  />
</template>

<style scoped>
.opf { display: flex; gap: 8px; align-items: center; }
.opf-in { flex: 1; }
/* .input 스타일은 각 폼에서 전역 정의된 것을 따르되, 없으면 최소 스타일 보강 */
.opf-in {
  background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); font-size: 13px; padding: 8px 10px; outline: none; width: 100%; box-sizing: border-box;
}
.opf-in:focus { border-color: var(--accent); }
.opf-btn {
  flex-shrink: 0; border: 1px solid var(--accent); background: transparent; color: var(--accent);
  font-size: 12.5px; font-weight: 600; padding: 8px 12px; border-radius: 8px; cursor: pointer; white-space: nowrap;
}
.opf-btn:hover:not(:disabled) { background: rgba(99, 102, 241, 0.12); }
.opf-btn:disabled { opacity: 0.5; cursor: default; }
</style>
