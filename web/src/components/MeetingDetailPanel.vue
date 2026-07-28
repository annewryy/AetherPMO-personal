<script setup lang="ts">
// 0039 — 회의록 상세 패널(사이드 드로어). 목록 표(일자·참석자만)로는 부족하다는 요청에 따라
//   내용 조회/수정 + 이슈·태스크·산출물 매핑 + 회의결과 액션아이템 + 댓글(멘션)을 한 화면에 제공.
import { ref, computed, onMounted } from 'vue';
import { dataClient } from '../lib/dataClient';
import type { ActionItem, Artifact, Issue, MeetingMinute, Task } from '../types';
import CommentThread from './CommentThread.vue';
import MultiSelectChecklist from './MultiSelectChecklist.vue';
import CollapsibleSection from './CollapsibleSection.vue';

const props = defineProps<{ meetingId: number; projectId: number; highlightCommentId?: number | null }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'changed'): void }>();

const apiMode = computed(() => !!window.API_BASE);

const meeting = ref<MeetingMinute | null>(null);
const loading = ref(true);
const loadError = ref<string | null>(null);

const issues = ref<Issue[]>([]);
const tasks = ref<Task[]>([]);
const deliverables = ref<Artifact[]>([]);
const actionItems = ref<ActionItem[]>([]);

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    const [m, is, tk, dv, ai] = await Promise.all([
      dataClient.meetingMinutes.get(props.meetingId),
      dataClient.issues.listByProject(props.projectId).catch(() => []),
      dataClient.tasks.listByProject(props.projectId).catch(() => []),
      dataClient.artifacts.listByProject(props.projectId).catch(() => []),
      dataClient.actionItems.listByProject(props.projectId).catch(() => []),
    ]);
    meeting.value = m;
    issues.value = is; tasks.value = tk; deliverables.value = dv; actionItems.value = ai;
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const issueOptions = computed(() => issues.value.map((i) => ({ id: i.id, label: i.title, sub: i.type })));
const taskOptions = computed(() => tasks.value.map((t) => ({ id: t.id, label: t.name })));
const deliverableOptions = computed(() => deliverables.value.map((d) => ({ id: d.id, label: d.name })));

const linkedIssues = computed(() => issues.value.filter((i) => (meeting.value?.issueIds ?? []).includes(i.id)));
const linkedTasks = computed(() => tasks.value.filter((t) => (meeting.value?.taskIds ?? []).includes(t.id)));
const linkedDeliverables = computed(() =>
  deliverables.value.filter((d) => (meeting.value?.deliverableIds ?? []).includes(d.id)));
const actionOptions = computed(() => actionItems.value.map((a) => ({ id: a.id, label: a.title })));
const linkedActionItems = computed(() =>
  actionItems.value.filter((a) => (meeting.value?.actionItemIds ?? []).includes(a.id)));

// ---- 편집 모드 ------------------------------------------------------------
const editing = ref(false);
const eContent = ref('');
const eRemarks = ref('');
const eAttendees = ref('');
const eIssueIds = ref<number[]>([]);
const eTaskIds = ref<number[]>([]);
const eDeliverableIds = ref<number[]>([]);
const eActionIds = ref<number[]>([]);
const saving = ref(false);
const saveError = ref<string | null>(null);

function attendeesText(list: unknown[] | undefined): string {
  return (list ?? []).map((a) => (typeof a === 'string' ? a : (a as any)?.name ?? '')).filter(Boolean).join(', ') || '—';
}

function startEdit() {
  if (!meeting.value) return;
  eContent.value = meeting.value.content || '';
  eRemarks.value = meeting.value.remarks || '';
  eAttendees.value = attendeesText(meeting.value.attendees) === '—' ? '' : attendeesText(meeting.value.attendees);
  eIssueIds.value = [...(meeting.value.issueIds ?? [])];
  eTaskIds.value = [...(meeting.value.taskIds ?? [])];
  eDeliverableIds.value = [...(meeting.value.deliverableIds ?? [])];
  eActionIds.value = [...(meeting.value.actionItemIds ?? [])];
  saveError.value = null;
  editing.value = true;
}

async function saveEdit() {
  if (!meeting.value) return;
  saving.value = true;
  saveError.value = null;
  try {
    meeting.value = await dataClient.meetingMinutes.update(meeting.value.id, {
      content: eContent.value.trim() || null,
      remarks: eRemarks.value.trim() || null,
      attendees: eAttendees.value.split(',').map((s) => s.trim()).filter(Boolean),
      issue_ids: eIssueIds.value,
      task_ids: eTaskIds.value,
      deliverable_ids: eDeliverableIds.value,
      action_ids: eActionIds.value,
    });
    editing.value = false;
    emit('changed');
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : String(e);
  } finally {
    saving.value = false;
  }
}

function fmtDate(v: string | null | undefined): string {
  return v ? String(v).split('T')[0] : '—';
}
</script>

<template>
  <aside class="drawer">
    <div class="dr-close">
      <button class="x" type="button" aria-label="닫기" @click="emit('close')">✕</button>
    </div>

    <div v-if="loading" class="dim">불러오는 중…</div>
    <div v-else-if="loadError" class="err">{{ loadError }}</div>
    <template v-else-if="meeting">
      <h2 class="ttl">{{ meeting.title }}</h2>
      <dl class="meta">
        <div><dt>회의일</dt><dd>{{ fmtDate(meeting.meetDate) }}</dd></div>
        <div><dt>참석자</dt><dd>{{ attendeesText(meeting.attendees) }}</dd></div>
      </dl>

      <template v-if="!editing">
        <section class="sect">
          <div class="sect-head"><h3>내용</h3><button v-if="apiMode" class="btn-link" type="button" @click="startEdit">편집</button></div>
          <p class="body-text">{{ meeting.content || '작성된 내용이 없습니다.' }}</p>
        </section>
        <section v-if="meeting.remarks" class="sect">
          <h3>비고</h3>
          <p class="body-text">{{ meeting.remarks }}</p>
        </section>

        <CollapsibleSection title="관련 이슈/리스크" :count="linkedIssues.length">
          <ul v-if="linkedIssues.length" class="chip-list">
            <li v-for="i in linkedIssues" :key="i.id" class="chip" :class="{ risk: i.type === '리스크' }">{{ i.title }}</li>
          </ul>
          <p v-else class="dim sm">없음</p>
        </CollapsibleSection>
        <CollapsibleSection title="관련 태스크" :count="linkedTasks.length">
          <ul v-if="linkedTasks.length" class="chip-list">
            <li v-for="t in linkedTasks" :key="t.id" class="chip">{{ t.name }}</li>
          </ul>
          <p v-else class="dim sm">없음</p>
        </CollapsibleSection>
        <CollapsibleSection title="관련 산출물" :count="linkedDeliverables.length">
          <ul v-if="linkedDeliverables.length" class="chip-list">
            <li v-for="d in linkedDeliverables" :key="d.id" class="chip">{{ d.name }}</li>
          </ul>
          <p v-else class="dim sm">없음</p>
        </CollapsibleSection>
        <CollapsibleSection title="관련 액션아이템" :count="linkedActionItems.length">
          <ul v-if="linkedActionItems.length" class="chip-list">
            <li v-for="a in linkedActionItems" :key="a.id" class="chip action">{{ a.title }} — {{ a.status }}</li>
          </ul>
          <p v-else class="dim sm">없음</p>
        </CollapsibleSection>
      </template>

      <template v-else>
        <section class="sect edit-form">
          <label class="label">내용</label>
          <textarea v-model="eContent" class="input" rows="4" :disabled="saving" />
          <label class="label">비고</label>
          <input v-model="eRemarks" class="input" type="text" :disabled="saving" />
          <label class="label">참석자 <span class="hint">(쉼표로 구분)</span></label>
          <input v-model="eAttendees" class="input" type="text" :disabled="saving" />

          <CollapsibleSection title="관련 이슈/리스크" :count="eIssueIds.length" default-open>
            <MultiSelectChecklist v-model="eIssueIds" :items="issueOptions" :disabled="saving" search-placeholder="이슈/리스크 검색…" />
          </CollapsibleSection>
          <CollapsibleSection title="관련 태스크" :count="eTaskIds.length" default-open>
            <MultiSelectChecklist v-model="eTaskIds" :items="taskOptions" :disabled="saving" search-placeholder="태스크 검색…" />
          </CollapsibleSection>
          <CollapsibleSection title="관련 산출물" :count="eDeliverableIds.length" default-open>
            <MultiSelectChecklist v-model="eDeliverableIds" :items="deliverableOptions" :disabled="saving" search-placeholder="산출물 검색…" />
          </CollapsibleSection>
          <CollapsibleSection title="관련 액션아이템" :count="eActionIds.length" default-open>
            <MultiSelectChecklist v-model="eActionIds" :items="actionOptions" :disabled="saving" search-placeholder="액션아이템 검색…" />
          </CollapsibleSection>

          <div v-if="saveError" class="err">{{ saveError }}</div>
          <div class="edit-actions">
            <button class="btn btn-sm" type="button" :disabled="saving" @click="editing = false">취소</button>
            <button class="btn btn-primary btn-sm" type="button" :disabled="saving" @click="saveEdit">
              {{ saving ? '저장 중…' : '저장' }}
            </button>
          </div>
        </section>
      </template>

      <section class="sect">
        <h3>댓글</h3>
        <CommentThread
          entity-type="MEETING_MINUTES" :entity-id="meeting.id" :project-id="projectId"
          :highlight-comment-id="highlightCommentId"
        />
      </section>
    </template>
  </aside>
</template>

<style scoped>
.drawer { display: flex; flex-direction: column; gap: 12px; padding: 18px 20px; height: 100%; overflow-y: auto; box-sizing: border-box; }
.dr-close { display: flex; justify-content: flex-end; }
.x { border: 0; background: transparent; color: var(--muted); font-size: 16px; cursor: pointer; padding: 4px; }
.x:hover { color: var(--text); }
.dim { color: var(--muted); font-size: 13px; }
.dim.sm { font-size: 12.5px; }
.err { color: var(--red); font-size: 13px; }
.ttl { font-size: 18px; margin: 0; }
.meta { display: flex; gap: 20px; margin: 0; font-size: 13px; }
.meta div { display: flex; flex-direction: column; gap: 2px; }
.meta dt { color: var(--muted); font-size: 11.5px; }
.meta dd { margin: 0; }
.sect { display: flex; flex-direction: column; gap: 6px; }
.sect-head { display: flex; align-items: center; justify-content: space-between; }
.sect h3 { font-size: 13px; color: var(--muted); margin: 0; font-weight: 600; }
.cnt { color: var(--text); font-weight: 700; }
.body-text { margin: 0; white-space: pre-wrap; word-break: break-word; font-size: 14px; }
.chip-list { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
  font-size: 12.5px; padding: 3px 9px; border-radius: 999px;
  background: var(--panel); border: 1px solid var(--border); color: var(--text);
}
.chip.risk { border-color: var(--yellow); color: var(--yellow); }
.chip.action { border-color: var(--blue); color: var(--blue); }
.btn-link { border: 0; background: transparent; color: var(--accent); font-size: 12.5px; cursor: pointer; font-family: inherit; padding: 0; }
.btn-link:hover { text-decoration: underline; }
.edit-form { gap: 8px; }
.label { font-size: 12.5px; color: var(--muted); }
.hint { font-weight: 400; }
.input {
  background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); font-size: 14px; padding: 7px 9px; outline: none; font-family: inherit; width: 100%; resize: vertical;
  box-sizing: border-box;
}
.input:focus { border-color: var(--accent); }
.edit-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
</style>
