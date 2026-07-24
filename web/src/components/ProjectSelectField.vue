<script setup lang="ts">
// 0028 — 프로젝트 검색 선택(콤보박스): 프로젝트가 많아지면 plain select로는 고르기 어려움(너울님 피드백).
//   입력에 타이핑 → 코드·이름 부분일치로 걸러진 드롭다운에서 선택. 선택 후엔 라벨 표시.
//   modelValue: 프로젝트 id(number) 또는 null(미선택). clearable=true면 × 로 해제(필터 용도).
import { ref, computed, watch } from 'vue';
import type { Project } from '../types';

const props = defineProps<{
  modelValue: number | null;
  projects: Project[];
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
}>();
const emit = defineEmits<{ (e: 'update:modelValue', v: number | null): void }>();

const open = ref(false);
const query = ref('');
const inputEl = ref<HTMLInputElement | null>(null);

function label(p: Project): string {
  return p.projectCode ? `${p.projectCode} - ${p.name}` : p.name;
}

const selected = computed(() =>
  props.modelValue == null ? null : props.projects.find((p) => p.id === props.modelValue) ?? null);

// 표시 텍스트: 드롭다운 열림 = 검색어, 닫힘 = 선택 라벨.
const display = computed(() => (open.value ? query.value : selected.value ? label(selected.value) : ''));

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return props.projects;
  return props.projects.filter(
    (p) => (p.name ?? '').toLowerCase().includes(q) || (p.projectCode ?? '').toLowerCase().includes(q),
  );
});

function onFocus() {
  if (props.disabled) return;
  query.value = '';
  open.value = true;
}
function onInput(e: Event) {
  query.value = (e.target as HTMLInputElement).value;
  if (!open.value) open.value = true;
}
function pick(p: Project) {
  emit('update:modelValue', p.id);
  open.value = false;
  query.value = '';
  inputEl.value?.blur();
}
function clear() {
  emit('update:modelValue', null);
  query.value = '';
}
// 옵션 클릭(mousedown)이 blur보다 먼저 처리되도록 mousedown.prevent 사용 → blur 닫기 안전.
function onBlur() {
  window.setTimeout(() => { open.value = false; }, 120);
}

watch(() => props.modelValue, () => { if (!open.value) query.value = ''; });
</script>

<template>
  <div class="psf" :class="{ disabled }">
    <input
      ref="inputEl"
      class="psf-input"
      type="text"
      :value="display"
      :placeholder="selected ? label(selected) : (placeholder ?? '프로젝트 검색 (코드·이름)')"
      :disabled="disabled"
      @focus="onFocus"
      @input="onInput"
      @blur="onBlur"
    />
    <button
      v-if="clearable && selected && !disabled"
      class="psf-clear" type="button" title="선택 해제" @mousedown.prevent="clear"
    >×</button>
    <div v-if="open" class="psf-drop">
      <div v-if="filtered.length === 0" class="psf-empty">일치하는 프로젝트가 없습니다.</div>
      <button
        v-for="p in filtered" :key="p.id"
        class="psf-opt" :class="{ on: p.id === modelValue }"
        type="button"
        @mousedown.prevent="pick(p)"
      >
        <span class="psf-code">{{ p.projectCode || `#${p.id}` }}</span>
        <span class="psf-name">{{ p.name }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.psf { position: relative; min-width: 240px; }
.psf.disabled { opacity: 0.6; }
.psf-input {
  width: 100%; box-sizing: border-box;
  background: var(--panel); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); font-size: 14px; padding: 7px 30px 7px 12px; outline: none;
  font-family: inherit;
}
.psf-input:focus { border-color: var(--accent); }
.psf-clear {
  position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
  border: 0; background: transparent; color: var(--muted); font-size: 15px; cursor: pointer;
  padding: 2px 6px; border-radius: 4px;
}
.psf-clear:hover { color: var(--text); background: var(--panel-2); }
.psf-drop {
  position: absolute; z-index: 30; top: calc(100% + 4px); left: 0; right: 0;
  max-height: 260px; overflow-y: auto;
  background: var(--panel); border: 1px solid var(--border); border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}
.psf-empty { padding: 10px 12px; font-size: 13px; color: var(--muted); }
.psf-opt {
  display: flex; align-items: baseline; gap: 8px; width: 100%;
  border: 0; background: transparent; color: var(--text); text-align: left;
  font-size: 13.5px; padding: 8px 12px; cursor: pointer; font-family: inherit;
}
.psf-opt:hover { background: var(--panel-2); }
.psf-opt.on { background: color-mix(in srgb, var(--accent) 16%, transparent); }
.psf-code { color: var(--muted); font-family: ui-monospace, monospace; font-size: 12px; flex-shrink: 0; }
.psf-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
