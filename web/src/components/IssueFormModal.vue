<script setup lang="ts">
// 0011 B-7 이슈/리스크 신규 등록 폼 (A-3 POST /api/issues).
//  - type 선택(이슈/리스크) — 리스크로 등록하면 type=리스크, source_rule_id=null(수동).
//  - 쓰기는 백엔드 전용(dataClient가 API_BASE 게이트). 오류는 서버 {message} 그대로.
//  - 0039 — 관련항목(태스크·산출물·회의록·액션아이템)은 접힌 섹션 + 검색 가능한 체크리스트.
import { ref, computed, watch } from 'vue';
import { dataClient } from '../lib/dataClient';
import type { ActionItem, Artifact, IssueCreateInput, MeetingMinute, Project, Task } from '../types';
import ModalShell from './ModalShell.vue';
import OrgPersonField from './OrgPersonField.vue';
import MultiSelectChecklist from './MultiSelectChecklist.vue';
import CollapsibleSection from './CollapsibleSection.vue';

// projectId 고정(상세 탭) 또는 projects 목록 제공(전역 목록 — 프로젝트 선택 드롭다운) 중 하나.
const props = defineProps<{ projectId?: number; projects?: Project[] }>();
const emit = defineEmits<{ (e: 'created'): void; (e: 'close'): void }>();

const pickedProjectId = ref<number | null>(props.projectId ?? props.projects?.[0]?.id ?? null);
const title = ref('');
const type = ref<'이슈' | '리스크'>('이슈');
const priority = ref('중'); // 백엔드 화이트리스트(상/중/하, chk_pms_issue_priority)와 일치
const owner = ref('');
const dueDate = ref('');
const taskIds = ref<number[]>([]);
const deliverableIds = ref<number[]>([]);
const meetingIds = ref<number[]>([]);
const actionIds = ref<number[]>([]);
const submitting = ref(false);
const error = ref<string | null>(null);

// 0039 — 관련항목 후보(선택된 프로젝트 범위).
const tasks = ref<Task[]>([]);
const deliverables = ref<Artifact[]>([]);
const meetings = ref<MeetingMinute[]>([]);
const actionItems = ref<ActionItem[]>([]);
const taskOptions = computed(() => tasks.value.map((t) => ({ id: t.id, label: t.name })));
const deliverableOptions = computed(() => deliverables.value.map((d) => ({ id: d.id, label: d.name })));
const meetingOptions = computed(() => meetings.value.map((m) => ({ id: m.id, label: m.title, sub: String(m.meetDate).split('T')[0] })));
const actionOptions = computed(() => actionItems.value.map((a) => ({ id: a.id, label: a.title })));

watch(pickedProjectId, async (pid) => {
  taskIds.value = []; deliverableIds.value = []; meetingIds.value = []; actionIds.value = [];
  if (pid == null) { tasks.value = []; deliverables.value = []; meetings.value = []; actionItems.value = []; return; }
  [tasks.value, deliverables.value, meetings.value, actionItems.value] = await Promise.all([
    dataClient.tasks.listByProject(pid).catch(() => []),
    dataClient.artifacts.listByProject(pid).catch(() => []),
    dataClient.meetingMinutes.listByProject(pid).catch(() => []),
    dataClient.actionItems.listByProject(pid).catch(() => []),
  ]);
}, { immediate: true });

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
    task_ids: taskIds.value,
    deliverable_ids: deliverableIds.value,
  };
  try {
    const created = await dataClient.issues.create(input);
    // meeting_ids/action_ids는 create 계약 밖(백엔드가 별도 처리) — 등록 직후 PATCH로 반영.
    if (meetingIds.value.length || actionIds.value.length) {
      await dataClient.issues.update(created.id, { meeting_ids: meetingIds.value, action_ids: actionIds.value });
    }
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
          <option value="상">상</option><option value="중">중</option><option value="하">하</option>
        </select>
      </div>
      <div>
        <label class="label">목표해결일</label>
        <input v-model="dueDate" class="input" type="date" :disabled="submitting" />
      </div>
    </div>

    <label class="label">담당</label>
    <OrgPersonField v-model="owner" placeholder="담당자명 (선택)" :disabled="submitting" title="담당자 선택" :project-id="pickedProjectId" />

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
    <CollapsibleSection title="관련 회의록" :count="meetingIds.length">
      <MultiSelectChecklist
        v-model="meetingIds" :items="meetingOptions" :disabled="submitting" search-placeholder="회의록 검색…"
        empty-text="등록된 회의록이 없습니다."
      />
    </CollapsibleSection>
    <CollapsibleSection title="관련 액션아이템" :count="actionIds.length">
      <MultiSelectChecklist
        v-model="actionIds" :items="actionOptions" :disabled="submitting" search-placeholder="액션아이템 검색…"
        empty-text="등록된 액션아이템이 없습니다."
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
.seg { display: flex; gap: 6px; }
.seg-btn {
  flex: 1; border: 1px solid var(--border); background: var(--panel); color: var(--muted);
  border-radius: 8px; padding: 7px; font-size: 14px; cursor: pointer; font-family: inherit;
}
.seg-btn.on { border-color: var(--accent); color: var(--text); background: rgba(139, 92, 246, 0.12); }
.err { color: var(--red); font-size: 13px; }
</style>
