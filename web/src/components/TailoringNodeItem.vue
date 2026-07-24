<script setup lang="ts">
// 0017 §C 테일러링 선택 트리의 한 노드(재귀). CatalogSelector(§C-1)와 입찰 프로젝트 등록 폼에서 사용.
//  - 체크박스 트리(PHASE→ACTIVITY→TASK→DELIVERABLE). CatalogNodeItem 트리 관례 참고.
//  - 부모/자식 정책: cascade — 부모 체크 시 하위 전체 포함, 해제 시 하위 전체 해제.
//    일부 하위만 선택되면 부모는 indeterminate(부분 선택) 표시. 개별 체크도 물론 가능.
//  - 상태(선택 집합)는 부모가 소유(selected: Set<number>). 이 컴포넌트는 토글만 emit.
//  - §C-1 확장(추가형, 기존 계약 무영향):
//     · visibleIds(선택적): 검색·필터 결과 표시할 id 집합. 없으면 전부 표시(회귀 없음).
//       매칭 노드 + 그 조상 경로가 보이도록 CatalogSelector가 집합을 구성.
//     · focusedId(선택적): 미리보기 대상 노드 하이라이트.
//     · 행 클릭(체크박스 외) → select emit(미리보기용). 체크박스는 종전대로 toggle.
import { computed } from 'vue';
import type { CatalogNode, CatalogNodeType } from '../types';

const props = defineProps<{
  node: CatalogNode;
  selected: Set<number>;         // 현재 선택된 노드 id 집합(부모 소유)
  depth: number;                 // 들여쓰기용(0=PHASE)
  visibleIds?: Set<number> | null; // 검색·필터 표시 집합(null/undefined=전부 표시)
  focusedId?: number | null;     // 미리보기 하이라이트 대상
}>();

const emit = defineEmits<{
  // 이 노드(와 cascade 대상 하위 전체)를 checked 상태로 토글
  (e: 'toggle', node: CatalogNode, checked: boolean): void;
  // 이 노드를 미리보기 대상으로 선택(행 클릭)
  (e: 'select', node: CatalogNode): void;
}>();

const TYPE_LABEL: Record<CatalogNodeType, string> = {
  PHASE: '단계', ACTIVITY: '활동', TASK: '태스크', DELIVERABLE: '산출물',
};

// 이 노드 + 모든 후손 id
function subtreeIds(n: CatalogNode, acc: number[] = []): number[] {
  acc.push(n.id);
  for (const c of n.children) subtreeIds(c, acc);
  return acc;
}

const allIds = computed(() => subtreeIds(props.node));
// 완전 선택: 서브트리 전체가 선택 집합 안 → checked
const checked = computed(() => allIds.value.every((id) => props.selected.has(id)));
// 부분 선택: 일부만 선택 → indeterminate(부모 체크박스에 반영)
const indeterminate = computed(
  () => !checked.value && allIds.value.some((id) => props.selected.has(id)),
);

// 표시 여부: visibleIds가 있으면 그 집합에 있을 때만 이 행을 렌더.
const visible = computed(() => !props.visibleIds || props.visibleIds.has(props.node.id));

function onToggle(e: Event) {
  const target = e.target as HTMLInputElement;
  emit('toggle', props.node, target.checked);
}
</script>

<template>
  <li v-if="visible" class="tnode">
    <div
      class="row"
      :style="{ paddingLeft: depth * 16 + 'px' }"
      :class="[node.nodeType, { focused: focusedId === node.id }]"
      @click="emit('select', node)"
    >
      <input
        class="cb"
        type="checkbox"
        :checked="checked"
        :indeterminate.prop="indeterminate"
        @click.stop
        @change="onToggle"
      />
      <span class="type">{{ TYPE_LABEL[node.nodeType] }}</span>
      <span v-if="node.code" class="code">{{ node.code }}</span>
      <span class="name">{{ node.name }}</span>
      <span v-if="node.isOptional" class="opt">선택</span>
    </div>
    <ul v-if="node.children.length" class="children">
      <TailoringNodeItem
        v-for="c in node.children"
        :key="c.id"
        :node="c"
        :selected="selected"
        :depth="depth + 1"
        :visible-ids="visibleIds"
        :focused-id="focusedId"
        @toggle="(n, ck) => emit('toggle', n, ck)"
        @select="(n) => emit('select', n)"
      />
    </ul>
  </li>
</template>

<style scoped>
.tnode { list-style: none; margin: 0; padding: 0; }
.row {
  display: flex; align-items: center; gap: 7px;
  padding: 4px 6px; border-radius: 6px; cursor: pointer; font-size: 13px;
}
.row:hover { background: var(--panel-2); }
.row.focused { background: color-mix(in srgb, var(--accent) 16%, transparent); box-shadow: inset 2px 0 0 var(--accent); }
.cb { flex-shrink: 0; cursor: pointer; margin: 0; }
.type {
  font-size: 11px; color: var(--muted); border: 1px solid var(--border);
  border-radius: 4px; padding: 0 5px; flex-shrink: 0;
}
.row.PHASE .type { color: var(--accent); border-color: var(--accent); }
.code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: var(--muted); }
.name { color: var(--text); }
.row.PHASE .name { font-weight: 600; }
.opt {
  font-size: 11px; color: var(--muted); background: var(--panel-2);
  border-radius: 999px; padding: 0 6px;
}
.children { margin: 0; padding: 0; }
</style>
