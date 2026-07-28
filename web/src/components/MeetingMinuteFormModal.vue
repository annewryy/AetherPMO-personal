<script setup lang="ts">
// 0011 B-7 회의록 신규 등록 폼 (A-3 POST /api/meeting-minutes).
// 참석자는 쉼표 구분 입력 → 문자열 배열로 전송. 쓰기는 백엔드 전용.
import { ref, computed, watch } from 'vue';
import { dataClient } from '../lib/dataClient';
import type { Artifact, Issue, MeetingMinuteCreateInput, Project, Task } from '../types';
import ModalShell from './ModalShell.vue';
import MultiSelectChecklist from './MultiSelectChecklist.vue';

const props = defineProps<{ projectId?: number; projects?: Project[] }>();
const emit = defineEmits<{ (e: 'created'): void; (e: 'close'): void }>();

const pickedProjectId = ref<number | null>(props.projectId ?? props.projects?.[0]?.id ?? null);
const title = ref('');
const meetDate = ref('');
const attendees = ref('');
const content = ref('');
const remarks = ref('');
const issueIds = ref<number[]>([]);
const taskIds = ref<number[]>([]);
const deliverableIds = ref<number[]>([]);
const submitting = ref(false);
const error = ref<string | null>(null);

// 0039 — 이 회의와 연관된 이슈/리스크·태스크·산출물(다중선택).
const issues = ref<Issue[]>([]);
const tasks = ref<Task[]>([]);
const deliverables = ref<Artifact[]>([]);
const issueOptions = computed(() => issues.value.map((i) => ({ id: i.id, label: i.title, sub: i.type })));
const taskOptions = computed(() => tasks.value.map((t) => ({ id: t.id, label: t.name })));
const deliverableOptions = computed(() => deliverables.value.map((d) => ({ id: d.id, label: d.name })));
watch(pickedProjectId, async (pid) => {
  issueIds.value = []; taskIds.value = []; deliverableIds.value = [];
  if (pid == null) { issues.value = []; tasks.value = []; deliverables.value = []; return; }
  [issues.value, tasks.value, deliverables.value] = await Promise.all([
    dataClient.issues.listByProject(pid).catch(() => []),
    dataClient.tasks.listByProject(pid).catch(() => []),
    dataClient.artifacts.listByProject(pid).catch(() => []),
  ]);
}, { immediate: true });

async function submit() {
  if (pickedProjectId.value == null) { error.value = '프로젝트를 선택하세요.'; return; }
  if (!title.value.trim()) { error.value = '제목은 필수입니다.'; return; }
  submitting.value = true;
  error.value = null;
  const input: MeetingMinuteCreateInput = {
    project_id: pickedProjectId.value,
    title: title.value.trim(),
    meet_date: meetDate.value || null,
    attendees: attendees.value.split(',').map((s) => s.trim()).filter(Boolean),
    content: content.value.trim() || null,
    remarks: remarks.value.trim() || null,
    issue_ids: issueIds.value,
    task_ids: taskIds.value,
    deliverable_ids: deliverableIds.value,
  };
  try {
    await dataClient.meetingMinutes.create(input);
    emit('created');
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <ModalShell title="회의록 등록" @close="emit('close')">
    <template v-if="props.projects">
      <label class="label">프로젝트 <span class="req">*</span></label>
      <select v-model.number="pickedProjectId" class="input" :disabled="submitting">
        <option v-for="p in props.projects" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
    </template>

    <label class="label">제목 <span class="req">*</span></label>
    <input v-model="title" class="input" type="text" placeholder="제목" :disabled="submitting" />

    <label class="label">회의일</label>
    <input v-model="meetDate" class="input" type="date" :disabled="submitting" />

    <label class="label">참석자 <span class="hint">(쉼표로 구분)</span></label>
    <input v-model="attendees" class="input" type="text" placeholder="홍길동, 김철수" :disabled="submitting" />

    <label class="label">내용</label>
    <textarea v-model="content" class="input" rows="3" placeholder="회의 내용 (선택)" :disabled="submitting" />

    <label class="label">비고</label>
    <input v-model="remarks" class="input" type="text" placeholder="비고 (선택)" :disabled="submitting" />

    <label class="label">관련 이슈/리스크 <span class="hint">(선택, 여러 개 가능 — 이 회의를 여는 사유)</span></label>
    <MultiSelectChecklist
      v-model="issueIds" :items="issueOptions" :disabled="submitting"
      empty-text="등록된 이슈/리스크가 없습니다."
    />

    <label class="label">관련 태스크 <span class="hint">(선택, 여러 개 가능)</span></label>
    <MultiSelectChecklist
      v-model="taskIds" :items="taskOptions" :disabled="submitting"
      empty-text="전개된 태스크가 없습니다."
    />

    <label class="label">관련 산출물 <span class="hint">(선택, 여러 개 가능)</span></label>
    <MultiSelectChecklist
      v-model="deliverableIds" :items="deliverableOptions" :disabled="submitting"
      empty-text="등록된 산출물이 없습니다."
    />

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
  font-family: inherit; width: 100%; resize: vertical;
}
.input:focus { border-color: var(--accent); }
.err { color: var(--red); font-size: 13px; }
</style>
