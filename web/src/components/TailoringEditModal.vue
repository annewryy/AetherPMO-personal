<script setup lang="ts">
// 0044 §C — 테일러링 편집 모달(전개 "후" 추가/삭제).
//   프로젝트 생성 마법사와 동일한 선택 UI(TailoringPicker)를 현재 전개 상태로 프리로드하고,
//   저장 시 변경분(diff: add/remove)만 서버로 보낸다. 진행된 항목의 삭제는 서버가 409로
//   거부하며 사유 메시지를 그대로 표시한다(작업 이력 보호).
import { ref, computed, onMounted } from 'vue';
import { dataClient } from '../lib/dataClient';
import { subtreeIds, expandWithAncestors } from '../lib/tailoring';
import type { CatalogNode, Project } from '../types';
import ModalShell from './ModalShell.vue';
import TailoringPicker from './TailoringPicker.vue';

const props = defineProps<{ project: Project }>();
const emit = defineEmits<{ (e: 'saved'): void; (e: 'close'): void }>();

const tree = ref<CatalogNode[]>([]);
const selected = ref(new Set<number>());
const baseline = ref(new Set<number>());
const loading = ref(true);
const loadError = ref<string | null>(null);
const submitting = ref(false);
const error = ref<string | null>(null);

onMounted(async () => {
  try {
    const [t, state] = await Promise.all([
      dataClient.catalog.tree(),
      dataClient.projects.tailoringState(props.project.id),
    ]);
    tree.value = t;
    baseline.value = new Set(state.selectedNodeIds);
    selected.value = new Set(state.selectedNodeIds);
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
});

// TailoringPicker 계약(부모가 Set 소유)
function onToggle(node: CatalogNode, checked: boolean) {
  const ids = subtreeIds(node);
  const next = new Set(selected.value);
  ids.forEach((id) => (checked ? next.add(id) : next.delete(id)));
  selected.value = next;
}
function onAdd(ids: number[]) {
  const next = new Set(selected.value);
  ids.forEach((id) => next.add(id));
  selected.value = next;
}
function onRemove(ids: number[]) {
  const next = new Set(selected.value);
  ids.forEach((id) => next.delete(id));
  selected.value = next;
}
function onClear() { selected.value = new Set(); }

// diff — 저장 대상. add는 조상 포함 전개(신규 노드의 단계/활동 tailoring 기록).
const diff = computed(() => {
  const withAncestors = expandWithAncestors(selected.value, tree.value);
  const add = [...withAncestors].filter((id) => !baseline.value.has(id));
  const remove = [...baseline.value].filter((id) => !withAncestors.has(id));
  return { add, remove };
});
const isDirty = computed(() => diff.value.add.length > 0 || diff.value.remove.length > 0);

async function submit() {
  if (!isDirty.value) return;
  submitting.value = true;
  error.value = null;
  try {
    const r = await dataClient.projects.editTailoring(props.project.id, diff.value);
    window.alert(`테일러링이 변경되었습니다 — 태스크 +${r.addedTasks}/−${r.removedTasks} · 산출물 +${r.addedDeliverables}/−${r.removedDeliverables}`);
    emit('saved');
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);   // 409 가드 사유 그대로
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <ModalShell title="테일러링 편집" wide @close="emit('close')">
    <p class="hint">
      체크를 추가하면 태스크·산출물이 새로 전개되고, 해제하면 삭제됩니다.
      이미 진행된 항목(상태 변경·파일 업로드·진척 입력·관련항목 참조)은 삭제가 거부됩니다.
    </p>

    <div v-if="loading" class="notice">불러오는 중…</div>
    <div v-else-if="loadError" class="notice err-box">{{ loadError }}</div>
    <TailoringPicker
      v-else
      :tree="tree"
      :selected="selected"
      :contract-amount="project.projectBudget ?? null"
      :stage="project.stage"
      :disabled="submitting"
      @toggle="onToggle"
      @add="onAdd"
      @remove="onRemove"
      @clear="onClear"
    />

    <div v-if="error" class="err">{{ error }}</div>

    <template #footer>
      <span class="count">
        추가 {{ diff.add.length.toLocaleString('ko-KR') }} · 삭제 {{ diff.remove.length.toLocaleString('ko-KR') }}
      </span>
      <button class="btn btn-sm" type="button" :disabled="submitting" @click="emit('close')">취소</button>
      <button class="btn btn-primary btn-sm" type="button" :disabled="submitting || !isDirty" @click="submit">
        {{ submitting ? '저장 중…' : '변경 적용' }}
      </button>
    </template>
  </ModalShell>
</template>

<style scoped>
.hint { font-size: 12.5px; color: var(--muted); margin: 0 0 8px; }
.notice {
  padding: 14px; border-radius: 8px; font-size: 14px;
  background: var(--panel); border: 1px solid var(--border); color: var(--muted);
}
.err-box { color: var(--red); border-color: var(--red); }
.err { color: var(--red); font-size: 13px; margin-top: 8px; white-space: pre-line; }
.count { font-size: 12.5px; color: var(--muted); margin-right: auto; }
</style>
