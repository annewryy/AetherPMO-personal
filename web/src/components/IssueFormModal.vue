<script setup lang="ts">
// 0011 B-7 이슈/리스크 신규 등록 폼 (A-3 POST /api/issues).
//  - type 선택(이슈/리스크) — 리스크로 등록하면 type=리스크, source_rule_id=null(수동).
//  - 쓰기는 백엔드 전용(dataClient가 API_BASE 게이트). 오류는 서버 {message} 그대로.
import { ref } from 'vue';
import { dataClient } from '../lib/dataClient';
import type { IssueCreateInput, Project } from '../types';
import ModalShell from './ModalShell.vue';
import OrgPersonField from './OrgPersonField.vue';

// projectId 고정(상세 탭) 또는 projects 목록 제공(전역 목록 — 프로젝트 선택 드롭다운) 중 하나.
const props = defineProps<{ projectId?: number; projects?: Project[] }>();
const emit = defineEmits<{ (e: 'created'): void; (e: 'close'): void }>();

const pickedProjectId = ref<number | null>(props.projectId ?? props.projects?.[0]?.id ?? null);
const title = ref('');
const type = ref<'이슈' | '리스크'>('이슈');
const priority = ref('보통');
const owner = ref('');
const dueDate = ref('');
const submitting = ref(false);
const error = ref<string | null>(null);

async function submit() {
  if (pickedProjectId.value == null) { error.value = '프로젝트를 선택하세요.'; return; }
  if (!title.value.trim()) { error.value = '제목은 필수입니다.'; return; }
  submitting.value = true;
  error.value = null;
  const input: IssueCreateInput = {
    project_id: pickedProjectId.value,
    title: title.value.trim(),
    type: type.value,
    priority: priority.value || null,
    owner_name: owner.value.trim() || null,
    due_date: dueDate.value || null,
  };
  try {
    await dataClient.issues.create(input);
    emit('created');
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <ModalShell title="이슈/리스크 등록" @close="emit('close')">
    <template v-if="props.projects">
      <label class="label">프로젝트 <span class="req">*</span></label>
      <select v-model.number="pickedProjectId" class="input" :disabled="submitting">
        <option v-for="p in props.projects" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
    </template>

    <label class="label">유형</label>
    <div class="seg">
      <button type="button" class="seg-btn" :class="{ on: type === '이슈' }" @click="type = '이슈'">이슈</button>
      <button type="button" class="seg-btn" :class="{ on: type === '리스크' }" @click="type = '리스크'">리스크</button>
    </div>

    <label class="label">제목 <span class="req">*</span></label>
    <input v-model="title" class="input" type="text" placeholder="제목" :disabled="submitting" />

    <div class="row2">
      <div>
        <label class="label">우선순위</label>
        <select v-model="priority" class="input" :disabled="submitting">
          <option value="높음">높음</option><option value="보통">보통</option><option value="낮음">낮음</option>
        </select>
      </div>
      <div>
        <label class="label">목표해결일</label>
        <input v-model="dueDate" class="input" type="date" :disabled="submitting" />
      </div>
    </div>

    <label class="label">담당</label>
    <OrgPersonField v-model="owner" placeholder="담당자명 (선택)" :disabled="submitting" title="담당자 선택" />

    <div v-if="error" class="err">{{ error }}</div>

    <template #footer>
      <button class="btn btn-sm" type="button" :disabled="submitting" @click="emit('close')">취소</button>
      <button class="btn btn-primary btn-sm" type="button" :disabled="submitting || !title.trim()" @click="submit">
        {{ submitting ? '등록 중…' : '등록' }}
      </button>
    </template>
  </ModalShell>
</template>

<style scoped>
.label { font-size: 12px; color: var(--muted); }
.req { color: var(--red); }
.input {
  background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); font-size: 13px; padding: 8px 10px; outline: none;
  font-family: inherit; width: 100%;
}
.input:focus { border-color: var(--accent); }
.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.row2 > div { display: flex; flex-direction: column; gap: 4px; }
.seg { display: flex; gap: 6px; }
.seg-btn {
  flex: 1; border: 1px solid var(--border); background: var(--panel); color: var(--muted);
  border-radius: 8px; padding: 7px; font-size: 13px; cursor: pointer; font-family: inherit;
}
.seg-btn.on { border-color: var(--accent); color: var(--text); background: rgba(139, 92, 246, 0.12); }
.err { color: var(--red); font-size: 12px; }
</style>
