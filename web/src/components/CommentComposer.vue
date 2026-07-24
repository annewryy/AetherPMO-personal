<script setup lang="ts">
// 0012 C-2 코멘트 입력기 — @멘션 자동완성 포함(최상위·답글 공통 재사용).
//  - 입력 중 `@` 뒤 토큰을 감지 → 프로젝트 멤버(members) 이름 접두 필터 드롭다운.
//  - 선택 시 커서 위치의 `@질의`를 `@[이름](uuid) `로 치환(칩은 렌더 단계에서 하이라이트).
//  - 전송 시 body + 실제 등장 멘션 uuid 배열을 emit(부모가 dataClient로 POST).
//  - 멤버 목록이 비면(폴백/조회 실패) 자동완성만 비활성 — 자유 텍스트 입력은 유지.
import { ref, computed } from 'vue';
import type { ProjectMemberRef } from '../types';
import { encodeMention, extractMentionUuids } from '../lib/mentions';

const props = defineProps<{
  members: ProjectMemberRef[];
  posting?: boolean;
  placeholder?: string;
  submitLabel?: string;
  autofocus?: boolean;
}>();

const emit = defineEmits<{
  (e: 'submit', payload: { body: string; mentions: string[] }): void;
  (e: 'cancel'): void;
}>();

const draft = ref('');
const textarea = ref<HTMLTextAreaElement | null>(null);

// @멘션 자동완성 상태
const menuOpen = ref(false);
const query = ref('');
const anchor = ref(0);              // `@`의 위치(치환 시작점)
const activeIdx = ref(0);

const candidates = computed<ProjectMemberRef[]>(() => {
  if (!menuOpen.value) return [];
  const q = query.value.toLowerCase();
  return props.members
    .filter((m) => m.name.toLowerCase().includes(q))
    .slice(0, 8);
});

// 커서 앞부분에서 마지막 `@토큰`을 찾아 자동완성 트리거 판단.
function refreshMention() {
  const el = textarea.value;
  if (!el) { menuOpen.value = false; return; }
  const caret = el.selectionStart ?? draft.value.length;
  const before = draft.value.slice(0, caret);
  // `@` 뒤로 공백·개행 없는 토큰(이름은 한글/영문/숫자 등 허용, `]`·`(`는 제외).
  const m = before.match(/@([^\s@[\]()]*)$/);
  if (m && props.members.length > 0) {
    anchor.value = caret - m[0].length;
    query.value = m[1];
    menuOpen.value = true;
    activeIdx.value = 0;
  } else {
    menuOpen.value = false;
  }
}

function pick(member: ProjectMemberRef) {
  const el = textarea.value;
  const caret = el?.selectionStart ?? draft.value.length;
  const literal = encodeMention(member.name, member.userUid) + ' ';
  draft.value = draft.value.slice(0, anchor.value) + literal + draft.value.slice(caret);
  menuOpen.value = false;
  // 삽입 후 커서를 리터럴 끝으로
  const pos = anchor.value + literal.length;
  requestAnimationFrame(() => {
    el?.focus();
    el?.setSelectionRange(pos, pos);
  });
}

function onKeydown(ev: KeyboardEvent) {
  if (menuOpen.value && candidates.value.length) {
    if (ev.key === 'ArrowDown') { ev.preventDefault(); activeIdx.value = (activeIdx.value + 1) % candidates.value.length; return; }
    if (ev.key === 'ArrowUp') { ev.preventDefault(); activeIdx.value = (activeIdx.value - 1 + candidates.value.length) % candidates.value.length; return; }
    if (ev.key === 'Enter' || ev.key === 'Tab') { ev.preventDefault(); pick(candidates.value[activeIdx.value]); return; }
    if (ev.key === 'Escape') { ev.preventDefault(); menuOpen.value = false; return; }
  }
}

function submit() {
  const body = draft.value.trim();
  if (!body || props.posting) return;
  emit('submit', { body, mentions: extractMentionUuids(body) });
}

function reset() { draft.value = ''; menuOpen.value = false; }
defineExpose({ reset });
</script>

<template>
  <div class="composer">
    <div class="ta-wrap">
      <textarea
        ref="textarea"
        v-model="draft"
        class="input"
        rows="2"
        :placeholder="placeholder || '코멘트 입력…  @로 멤버 멘션'"
        :disabled="posting"
        :autofocus="autofocus"
        @input="refreshMention"
        @keyup="refreshMention"
        @click="refreshMention"
        @keydown="onKeydown"
      />
      <ul v-if="menuOpen && candidates.length" class="mention-menu">
        <li
          v-for="(m, i) in candidates" :key="m.userUid"
          class="mention-item" :class="{ on: i === activeIdx }"
          @mousedown.prevent="pick(m)"
        >
          <span class="mm-name">{{ m.name }}</span>
          <span v-if="m.role" class="mm-role">{{ m.role }}</span>
        </li>
      </ul>
    </div>
    <div class="row">
      <slot name="error" />
      <button v-if="$slots.cancel" class="btn btn-sm" type="button" :disabled="posting" @click="emit('cancel')">취소</button>
      <button class="btn btn-primary btn-sm" type="button" :disabled="posting || !draft.trim()" @click="submit">
        {{ posting ? '등록 중…' : (submitLabel || '코멘트 등록') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.composer { display: flex; flex-direction: column; gap: 6px; }
.ta-wrap { position: relative; }
.input {
  background: var(--panel); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); font-size: 14px; padding: 7px 10px; outline: none;
  font-family: inherit; resize: vertical; width: 100%; box-sizing: border-box;
}
.input:focus { border-color: var(--accent); }
.mention-menu {
  position: absolute; z-index: 20; left: 0; right: 0; top: 100%; margin: 2px 0 0;
  list-style: none; padding: 4px; max-height: 220px; overflow-y: auto;
  background: var(--panel-2); border: 1px solid var(--border); border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}
.mention-item {
  display: flex; align-items: center; gap: 8px; padding: 6px 8px;
  border-radius: 6px; cursor: pointer; font-size: 14px;
}
.mention-item:hover, .mention-item.on { background: var(--accent); color: #fff; }
.mm-name { font-weight: 600; }
.mm-role { font-size: 12px; color: var(--muted); }
.mention-item.on .mm-role, .mention-item:hover .mm-role { color: rgba(255, 255, 255, 0.8); }
.row { display: flex; align-items: center; gap: 10px; justify-content: flex-end; }
</style>
