<script setup lang="ts">
// P1-3 카탈로그 상세 패널(3열째) — 2026-07-07 마스터-디테일 개정.
// TASK: 기본정보 + 소속 산출물 목록(파일/버전='아마란스 연동 예정') + 태스크 워크플로 +
//       산출물 공통 워크플로. DELIVERABLE: 기본정보 + 소속 TASK 링크 + 산출물 워크플로.
// 다운로드/일괄 다운로드는 placeholder (b) 아마란스 위임.
import { computed } from 'vue';
import type { CatalogNode, Workflow } from '../types';
import WorkflowDiagram from './WorkflowDiagram.vue';
import { stub, AMARANTH_PENDING } from '../lib/stub';

const props = defineProps<{
  node: CatalogNode;
  path: CatalogNode[];           // 루트(PHASE)→선택 노드까지의 경로(선택 노드 포함)
  workflowsById: Map<number, Workflow>;
}>();

const emit = defineEmits<{ (e: 'select', id: number): void }>();

const isTask = computed(() => props.node.nodeType === 'TASK');

const breadcrumb = computed(() =>
  props.path.slice(0, -1).map((n) => n.name).join(' › ') || '—',
);

const parentTask = computed(() => {
  const parent = props.path[props.path.length - 2];
  return parent && parent.nodeType === 'TASK' ? parent : null;
});

const deliverables = computed(() =>
  isTask.value ? props.node.children.filter((c) => c.nodeType === 'DELIVERABLE') : [],
);

const nodeWorkflow = computed(() =>
  props.node.workflowId != null ? props.workflowsById.get(props.node.workflowId) ?? null : null,
);

// 소속 산출물들이 공통으로 쓰는 워크플로(중복 제거 — 통상 1개)
const deliverableWorkflows = computed(() => {
  const ids = [...new Set(
    deliverables.value.map((d) => d.workflowId).filter((id): id is number => id != null),
  )];
  return ids
    .map((id) => props.workflowsById.get(id))
    .filter((w): w is Workflow => !!w);
});
</script>

<template>
  <div class="panel">
    <div class="head">
      <span class="type" :class="isTask ? 't-TASK' : 't-DELIVERABLE'">
        {{ isTask ? '태스크' : '산출물' }}
      </span>
      <h2 class="name">{{ node.name }}</h2>
    </div>

    <dl class="meta">
      <div><dt>코드</dt><dd class="code">{{ node.code || '—' }}</dd></div>
      <div><dt>필수 여부</dt><dd>{{ node.isOptional ? '선택' : '필수' }}</dd></div>
      <div v-if="!isTask"><dt>분류</dt><dd>{{ node.deliverableCategory || '—' }}</dd></div>
      <div class="wide"><dt>소속 경로</dt><dd class="path">{{ breadcrumb }}</dd></div>
      <div v-if="node.description" class="wide"><dt>설명</dt><dd>{{ node.description }}</dd></div>
    </dl>

    <!-- DELIVERABLE: 소속 TASK 링크 + 다운로드(아마란스 위임) -->
    <template v-if="!isTask">
      <div class="actions">
        <button
          v-if="parentTask" class="btn btn-sm"
          @click="emit('select', parentTask.id)"
        >소속 태스크: {{ parentTask.name }} →</button>
        <button class="btn btn-sm" @click="stub('amaranth', '템플릿 다운로드')">다운로드</button>
      </div>
    </template>

    <!-- TASK: 소속 산출물 목록 -->
    <section v-if="isTask" class="section">
      <div class="section-head">
        <h3 class="section-title">소속 산출물 ({{ deliverables.length }})</h3>
        <button class="btn btn-sm" @click="stub('amaranth', '일괄 다운로드')">일괄 다운로드</button>
      </div>
      <div v-if="deliverables.length === 0" class="empty">소속 산출물이 없습니다.</div>
      <table v-else class="grid">
        <thead>
          <tr><th>코드</th><th>산출물명</th><th>필수</th><th>파일/버전</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="d in deliverables" :key="d.id">
            <td class="code">{{ d.code || '—' }}</td>
            <td><button class="link" @click="emit('select', d.id)">{{ d.name }}</button></td>
            <td>{{ d.isOptional ? '선택' : '필수' }}</td>
            <td class="pending">{{ AMARANTH_PENDING }}</td>
            <td class="cell-action">
              <button class="btn btn-sm" @click="stub('amaranth', '템플릿 다운로드')">다운로드</button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- 워크플로 다이어그램 -->
    <section class="section">
      <h3 class="section-title">{{ isTask ? '태스크 워크플로' : '산출물 워크플로' }}</h3>
      <WorkflowDiagram v-if="nodeWorkflow" :workflow="nodeWorkflow" />
      <div v-else class="empty">연결된 워크플로가 없습니다.</div>
    </section>

    <section v-if="isTask && deliverableWorkflows.length" class="section">
      <h3 class="section-title">산출물 공통 워크플로</h3>
      <WorkflowDiagram v-for="w in deliverableWorkflows" :key="w.id" :workflow="w" class="wf-item" />
    </section>
  </div>
</template>

<style scoped>
.panel { display: flex; flex-direction: column; gap: 16px; }
.head { display: flex; align-items: center; gap: 10px; }
.name { font-size: 17px; margin: 0; }
.type {
  flex-shrink: 0; font-size: 11px; font-weight: 600;
  padding: 2px 8px; border-radius: 999px;
}
.t-TASK { color: var(--green); background: rgba(52, 211, 153, 0.12); }
.t-DELIVERABLE { color: var(--yellow); background: rgba(251, 191, 36, 0.12); }

.meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 18px; margin: 0; }
.meta > div { display: flex; flex-direction: column; gap: 2px; }
.meta .wide { grid-column: 1 / -1; }
.meta dt { font-size: 12px; color: var(--muted); }
.meta dd { margin: 0; font-size: 14px; }
.code { font-family: ui-monospace, monospace; }
.path { color: var(--muted); font-size: 13px; }

.actions { display: flex; gap: 8px; flex-wrap: wrap; }

.section { display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--border); padding-top: 12px; }
.section-head { display: flex; align-items: center; justify-content: space-between; }
.section-title { font-size: 14px; margin: 0; color: var(--text); }
.empty { font-size: 13px; color: var(--muted); }

.grid { border-collapse: collapse; width: 100%; font-size: 13.5px; }
.grid th, .grid td { text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--border); }
.grid th { color: var(--muted); font-weight: 600; font-size: 12px; }
.grid tbody tr:last-child td { border-bottom: 0; }
.pending { color: var(--muted); font-style: italic; }
.cell-action { text-align: right; }
.link {
  border: 0; background: transparent; padding: 0; cursor: pointer;
  color: var(--accent); font-size: 13.5px; font-family: inherit;
}
.link:hover { text-decoration: underline; }
.wf-item + .wf-item { margin-top: 12px; }
</style>
