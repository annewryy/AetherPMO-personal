<script setup lang="ts">
// 0011 B-7 액션아이템 신규 등록 폼 (A-3 POST /api/action-items).
// 쓰기는 백엔드 전용(dataClient가 API_BASE 게이트). 오류는 서버 {message} 그대로.
import { ref, computed, watch } from 'vue';
import { dataClient } from '../lib/dataClient';
import type { ActionItemCreateInput, MeetingMinute, Project } from '../types';
import ModalShell from './ModalShell.vue';
import OrgPersonField from './OrgPersonField.vue';

const props = defineProps<{ projectId?: number; projects?: Project[] }>();
const emit = defineEmits<{ (e: 'created'): void; (e: 'close'): void }>();

const pickedProjectId = ref<number | null>(props.projectId ?? props.projects?.[0]?.id ?? null);
const title = ref('');
const assignee = ref('');
const dueDate = ref('');
const sourceMeetingId = ref<number | null>(null);
const submitting = ref(false);
const error = ref<string | null>(null);

// 0039 — 이 조치가 어느 회의의 결과인지(선택). 프로젝트 회의록 목록에서 고른다.
const meetings = ref<MeetingMinute[]>([]);
const meetingOptions = computed(() =>
  [...meetings.value].sort((a, b) => String(b.meetDate).localeCompare(String(a.meetDate))));
watch(pickedProjectId, async (pid) => {
  sourceMeetingId.value = null;
  meetings.value = pid != null ? await dataClient.meetingMinutes.listByProject(pid).catch(() => []) : [];
}, { immediate: true });

async function submit() {
  if (pickedProjectId.value == null) { error.value = '프로젝트를 선택하세요.'; return; }
  if (!title.value.trim()) { error.value = '제목은 필수입니다.'; return; }
  submitting.value = true;
  error.value = null;
  const input: ActionItemCreateInput = {
    project_id: pickedProjectId.value,
    title: title.value.trim(),
    assignee_name: assignee.value.trim() || null,
    due_date: dueDate.value || null,
    source_meeting_id: sourceMeetingId.value,
  };
  try {
    await dataClient.actionItems.create(input);
    emit('created');
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <ModalShell title="액션아이템 등록" @close="emit('close')">
    <template v-if="props.projects">
      <label class="label">프로젝트 <span class="req">*</span></label>
      <select v-model.number="pickedProjectId" class="input" :disabled="submitting">
        <option v-for="p in props.projects" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
    </template>

    <label class="label">제목 <span class="req">*</span></label>
    <input v-model="title" class="input" type="text" placeholder="제목" :disabled="submitting" />

    <div class="row2">
      <div>
        <label class="label">담당</label>
        <OrgPersonField v-model="assignee" placeholder="담당자명 (선택)" :disabled="submitting" title="담당자 선택" :project-id="pickedProjectId" />
      </div>
      <div>
        <label class="label">마감일</label>
        <input v-model="dueDate" class="input" type="date" :disabled="submitting" />
      </div>
    </div>

    <label class="label">관련 회의 <span class="hint">(선택 — 이 조치를 만든 회의)</span></label>
    <select v-model.number="sourceMeetingId" class="input" :disabled="submitting">
      <option :value="null">— 없음(독립 조치) —</option>
      <option v-for="m in meetingOptions" :key="m.id" :value="m.id">
        {{ m.title }} ({{ String(m.meetDate).split('T')[0] }})
      </option>
    </select>

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
.label { font-size: 13px; color: var(--muted); }
.req { color: var(--red); }
.hint { color: var(--muted); font-weight: 400; }
.input {
  background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); font-size: 14px; padding: 8px 10px; outline: none;
  font-family: inherit; width: 100%;
}
.input:focus { border-color: var(--accent); }
.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.row2 > div { display: flex; flex-direction: column; gap: 4px; }
.err { color: var(--red); font-size: 13px; }
</style>
