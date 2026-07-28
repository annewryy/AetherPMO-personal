<script setup lang="ts">
// 0011 B-7 액션아이템 신규 등록 폼 (A-3 POST /api/action-items).
// 쓰기는 백엔드 전용(dataClient가 API_BASE 게이트). 오류는 서버 {message} 그대로.
// 0039 — 관련항목(태스크·산출물·이슈/리스크·회의록) 다중 매핑. 접힌 섹션 + 검색 가능한 체크리스트.
import { ref, computed, watch } from 'vue';
import { dataClient } from '../lib/dataClient';
import type { ActionItemCreateInput, Artifact, Issue, MeetingMinute, Project, Task } from '../types';
import ModalShell from './ModalShell.vue';
import OrgPersonField from './OrgPersonField.vue';
import MultiSelectChecklist from './MultiSelectChecklist.vue';
import CollapsibleSection from './CollapsibleSection.vue';

const props = defineProps<{ projectId?: number; projects?: Project[] }>();
const emit = defineEmits<{ (e: 'created'): void; (e: 'close'): void }>();

const pickedProjectId = ref<number | null>(props.projectId ?? props.projects?.[0]?.id ?? null);
const title = ref('');
const assignee = ref('');
const dueDate = ref('');
const taskIds = ref<number[]>([]);
const deliverableIds = ref<number[]>([]);
const issueIds = ref<number[]>([]);
const meetingIds = ref<number[]>([]);
const submitting = ref(false);
const error = ref<string | null>(null);

// 0039 — 관련항목 후보(선택된 프로젝트 범위).
const tasks = ref<Task[]>([]);
const deliverables = ref<Artifact[]>([]);
const issues = ref<Issue[]>([]);
const meetings = ref<MeetingMinute[]>([]);
const taskOptions = computed(() => tasks.value.map((t) => ({ id: t.id, label: t.name })));
const deliverableOptions = computed(() => deliverables.value.map((d) => ({ id: d.id, label: d.name })));
const issueOptions = computed(() => issues.value.map((i) => ({ id: i.id, label: i.title, sub: i.type })));
const meetingOptions = computed(() =>
  [...meetings.value]
    .sort((a, b) => String(b.meetDate).localeCompare(String(a.meetDate)))
    .map((m) => ({ id: m.id, label: m.title, sub: String(m.meetDate).split('T')[0] })));

watch(pickedProjectId, async (pid) => {
  taskIds.value = []; deliverableIds.value = []; issueIds.value = []; meetingIds.value = [];
  if (pid == null) { tasks.value = []; deliverables.value = []; issues.value = []; meetings.value = []; return; }
  [tasks.value, deliverables.value, issues.value, meetings.value] = await Promise.all([
    dataClient.tasks.listByProject(pid).catch(() => []),
    dataClient.artifacts.listByProject(pid).catch(() => []),
    dataClient.issues.listByProject(pid).catch(() => []),
    dataClient.meetingMinutes.listByProject(pid).catch(() => []),
  ]);
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
    task_ids: taskIds.value,
    deliverable_ids: deliverableIds.value,
    issue_ids: issueIds.value,
    meeting_ids: meetingIds.value,
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

    <CollapsibleSection title="관련 태스크" :count="taskIds.length">
      <MultiSelectChecklist
        v-model="taskIds" :items="taskOptions" :disabled="submitting" search-placeholder="태스크 검색…"
        empty-text="이 프로젝트에 전개된 태스크가 없습니다."
      />
    </CollapsibleSection>
    <CollapsibleSection title="관련 산출물" :count="deliverableIds.length">
      <MultiSelectChecklist
        v-model="deliverableIds" :items="deliverableOptions" :disabled="submitting" search-placeholder="산출물 검색…"
        empty-text="등록된 산출물이 없습니다."
      />
    </CollapsibleSection>
    <CollapsibleSection title="관련 이슈/리스크" :count="issueIds.length">
      <MultiSelectChecklist
        v-model="issueIds" :items="issueOptions" :disabled="submitting" search-placeholder="이슈/리스크 검색…"
        empty-text="등록된 이슈/리스크가 없습니다."
      />
    </CollapsibleSection>
    <CollapsibleSection title="관련 회의록" :count="meetingIds.length">
      <MultiSelectChecklist
        v-model="meetingIds" :items="meetingOptions" :disabled="submitting" search-placeholder="회의록 검색…"
        empty-text="등록된 회의록이 없습니다."
      />
    </CollapsibleSection>

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
