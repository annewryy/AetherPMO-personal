<script setup lang="ts">
// 0012 C-1 공통 상세 패널(우측 사이드 드로어) — 4도메인 재사용(이슈·액션·산출물·태스크).
// 배치23 B안: 본문 알맹이는 ItemDetailBody(공용)로 추출됨 — 이 컴포넌트는 드로어 chrome
//   (aside 래퍼 + 닫기 ✕ 버튼)만 담당하고 본문은 재사용한다. 상세 페이지도 같은 본문을 쓴다(중복 금지).
import ItemDetailBody, { type DetailKind } from './ItemDetailBody.vue';
import type { Issue, ActionItem, Artifact, Task } from '../types';

// 하위 호환: ProjectDetailView 등이 DetailPanel에서 DetailKind를 import 함.
export type { DetailKind };

defineProps<{
  kind: DetailKind;
  issue?: Issue | null;
  action?: ActionItem | null;
  artifact?: Artifact | null;
  task?: Task | null;
  projectId: number;
  projectCode?: string | null;
  highlightCommentId?: number | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'changed'): void;
}>();
</script>

<template>
  <aside class="drawer">
    <div class="dr-close">
      <button class="x" type="button" aria-label="닫기" @click="emit('close')">✕</button>
    </div>
    <ItemDetailBody
      :kind="kind" :issue="issue" :action="action" :artifact="artifact" :task="task"
      :project-id="projectId" :project-code="projectCode" :highlight-comment-id="highlightCommentId"
      @changed="emit('changed')"
    />
  </aside>
</template>

<style scoped>
.drawer {
  display: flex; flex-direction: column; gap: 12px;
  padding: 18px 20px; height: 100%; overflow-y: auto; box-sizing: border-box;
}
.dr-close { display: flex; justify-content: flex-end; }
.x { border: 0; background: transparent; color: var(--muted); font-size: 15px; cursor: pointer; padding: 4px; }
.x:hover { color: var(--text); }
</style>
