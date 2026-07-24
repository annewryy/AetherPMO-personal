<script setup lang="ts">
// 배치23 B안 — 아이템 상세 페이지(URL 진입: /issues/:id · /action-items/:id · /deliverables/:id · /tasks/:id).
// 드로어(DetailPanel)와 동일한 본문(ItemDetailBody)을 재사용한다 — 목록·대시보드·WBS에서 이 페이지로 이동.
// URL 진입 시 dataClient 단건 GET으로 로드 → 소속 프로젝트도 로드(코드 조합 렌더). 404/로딩/에러 처리.
// 쓰기(필드/상태)는 본문이 담당 — 변경 후 재조회한다.
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { dataClient } from '../lib/dataClient';
import type { Issue, ActionItem, Artifact, Task } from '../types';
import ItemDetailBody, { type DetailKind } from '../components/ItemDetailBody.vue';

const props = defineProps<{ kind: DetailKind }>();

const route = useRoute();
const router = useRouter();

const issue = ref<Issue | null>(null);
const action = ref<ActionItem | null>(null);
const artifact = ref<Artifact | null>(null);
const task = ref<Task | null>(null);
const projectId = ref<number | null>(null);
const projectCode = ref<string | null>(null);

const loading = ref(true);
const error = ref<string | null>(null);

const highlightCommentId = computed(() => {
  const c = Number(route.query.comment);
  return Number.isFinite(c) && c > 0 ? c : null;
});

function goBack() {
  // 히스토리에 이전 항목이 있으면 뒤로, 없으면(딥링크 직접 진입) 소속 목록/프로젝트로.
  if (window.history.length > 1) {
    router.back();
    return;
  }
  const pid = projectId.value;
  if (props.kind === 'issue') router.push('/issues');
  else if (props.kind === 'action') router.push('/action-items');
  else if (pid != null) router.push({ path: `/projects/${pid}`, query: { tab: props.kind === 'artifact' ? 'artifacts' : 'tasks' } });
  else router.push('/projects/active');
}

async function load() {
  loading.value = true;
  error.value = null;
  issue.value = action.value = artifact.value = task.value = null;
  projectId.value = null;
  projectCode.value = null;
  const id = Number(route.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    error.value = '잘못된 대상 id';
    loading.value = false;
    return;
  }
  try {
    let pid: number;
    if (props.kind === 'issue') { issue.value = await dataClient.issues.get(id); pid = issue.value.projectId; }
    else if (props.kind === 'action') { action.value = await dataClient.actionItems.get(id); pid = action.value.projectId; }
    else if (props.kind === 'artifact') { artifact.value = await dataClient.artifacts.get(id); pid = artifact.value.projectId; }
    else { task.value = await dataClient.tasks.get(id); pid = task.value.projectId; }
    projectId.value = pid;
    // 프로젝트 코드(조합 표시). 실패해도 본문은 유지(코드만 생략).
    try {
      const proj = await dataClient.projects.get(pid);
      projectCode.value = proj?.projectCode ?? null;
    } catch { /* 코드 생략 */ }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

// URL의 id가 바뀌면(같은 뷰 내 재사용) 재로드.
watch(() => [props.kind, route.params.id], load, { immediate: true });

async function onChanged() {
  // 필드/상태 변경 후 단건 재조회(최신 상태 반영).
  const id = Number(route.params.id);
  if (!Number.isFinite(id)) return;
  try {
    if (props.kind === 'issue') issue.value = await dataClient.issues.get(id);
    else if (props.kind === 'action') action.value = await dataClient.actionItems.get(id);
    else if (props.kind === 'artifact') artifact.value = await dataClient.artifacts.get(id);
    else task.value = await dataClient.tasks.get(id);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}

const loaded = computed(() =>
  issue.value || action.value || artifact.value || task.value,
);
</script>

<template>
  <div class="detail-page">
    <button class="back" type="button" @click="goBack">← 목록</button>

    <div v-if="loading" class="notice">불러오는 중…</div>
    <div v-else-if="error" class="notice err">
      상세를 불러오지 못했습니다.
      <span class="detail">({{ error }})</span>
    </div>
    <template v-else-if="loaded && projectId != null">
      <div class="card">
        <ItemDetailBody
          :kind="kind" :issue="issue" :action="action" :artifact="artifact" :task="task"
          :project-id="projectId" :project-code="projectCode"
          :highlight-comment-id="highlightCommentId"
          @changed="onChanged"
        />
      </div>
    </template>
    <div v-else class="notice">대상을 찾을 수 없습니다.</div>
  </div>
</template>

<style scoped>
.detail-page { display: flex; flex-direction: column; gap: 14px; max-width: 860px; }
.back {
  align-self: flex-start; border: 1px solid var(--border); background: var(--panel);
  color: var(--text); font-size: 13px; padding: 5px 12px; border-radius: 8px; cursor: pointer;
}
.back:hover { background: var(--panel-2); }
.card { background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 18px 20px; }
.notice {
  padding: 16px; border-radius: 8px;
  background: var(--panel); border: 1px solid var(--border); color: var(--muted); font-size: 13px;
}
.notice.err { color: var(--red); }
.notice .detail { opacity: 0.7; }
</style>
