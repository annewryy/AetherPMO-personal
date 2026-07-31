<script setup lang="ts">
// 0044 §E — 기존 테일러링을 "선택 복사"해 새 고객사 분류를 만드는 모달.
//   프로젝트 생성 마법사와 동일한 테일러링 선택 UI(TailoringPicker 체크박스 트리)를 재사용한다.
//   원본 분류를 고르고 → 체크박스로 복사할 항목 선택(조상 자동 포함) → 새 분류명 입력 → 복사.
import { ref, computed } from 'vue';
import { dataClient } from '../lib/dataClient';
import { useCodes } from '../lib/codes';
import { subtreeIds, expandWithAncestors } from '../lib/tailoring';
import type { CatalogNode } from '../types';
import ModalShell from './ModalShell.vue';
import TailoringPicker from './TailoringPicker.vue';

const props = defineProps<{
  /** 전체 카탈로그 트리(비활성 포함 여부는 호출부 결정) — 분류 필터는 이 컴포넌트가 한다. */
  tree: CatalogNode[];
}>();
const emit = defineEmits<{ (e: 'copied', clientCategory: string): void; (e: 'close'): void }>();

// 원본 분류 선택(기본 표준). 분류 목록은 공통코드 CLIENT_CATEGORY.
const categories = useCodes('CLIENT_CATEGORY');
const sourceCategory = ref('default');
const sourceTree = computed(() =>
  props.tree.filter((n) => (n.clientCategory ?? 'default') === sourceCategory.value));

const targetName = ref('');
const selected = ref(new Set<number>());
const submitting = ref(false);
const error = ref<string | null>(null);

function onSourceChange() {
  selected.value = new Set();   // 원본이 바뀌면 선택 초기화(다른 트리의 id가 섞이지 않게)
}

// TailoringPicker 선택 이벤트(마법사와 동일 계약 — 부모가 Set 소유)
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

const canSubmit = computed(() =>
  !submitting.value && selected.value.size > 0 && targetName.value.trim().length > 0);

async function submit() {
  const target = targetName.value.trim();
  if (!target) { error.value = '새 분류명을 입력하세요.'; return; }
  if (selected.value.size === 0) { error.value = '복사할 항목을 선택하세요.'; return; }
  submitting.value = true;
  error.value = null;
  try {
    const nodeIds = [...expandWithAncestors(selected.value, sourceTree.value)];
    const result = await dataClient.catalog.copy({ targetClientCategory: target, nodeIds });
    emit('copied', result.clientCategory);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <ModalShell title="테일러링 복사 — 새 고객사 분류 만들기" wide @close="emit('close')">
    <div class="row2">
      <div>
        <label class="label">원본 분류</label>
        <select v-model="sourceCategory" class="input" :disabled="submitting" @change="onSourceChange">
          <option v-for="c in categories" :key="c.code" :value="c.code">{{ c.label }}</option>
        </select>
      </div>
      <div>
        <label class="label">새 분류명(고객사) <span class="req">*</span></label>
        <input v-model="targetName" class="input" type="text"
               placeholder="예: 국가정보자원관리원" :disabled="submitting" />
      </div>
    </div>

    <p class="hint">
      복사할 항목을 체크하세요 — 상위(분류·액티비티·태스크)는 자동 포함됩니다.
      복사된 분류는 테일러링·프로젝트 생성 마법사에서 바로 선택할 수 있습니다.
    </p>

    <TailoringPicker
      :tree="sourceTree"
      :selected="selected"
      :contract-amount="null"
      :stage="null"
      :disabled="submitting"
      @toggle="onToggle"
      @add="onAdd"
      @remove="onRemove"
      @clear="onClear"
    />

    <div v-if="error" class="err">{{ error }}</div>

    <template #footer>
      <span class="count">{{ selected.size.toLocaleString('ko-KR') }}개 선택</span>
      <button class="btn btn-sm" type="button" :disabled="submitting" @click="emit('close')">취소</button>
      <button class="btn btn-primary btn-sm" type="button" :disabled="!canSubmit" @click="submit">
        {{ submitting ? '복사 중…' : '복사하여 분류 생성' }}
      </button>
    </template>
  </ModalShell>
</template>

<style scoped>
.label { font-size: 13px; color: var(--muted); }
.req { color: var(--red); }
.input {
  background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); font-size: 14px; padding: 8px 10px; outline: none;
  font-family: inherit; width: 100%; box-sizing: border-box;
}
.input:focus { border-color: var(--accent); }
.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 10px; }
.row2 > div { display: flex; flex-direction: column; gap: 4px; }
.hint { font-size: 12.5px; color: var(--muted); margin: 0 0 8px; }
.err { color: var(--red); font-size: 13px; margin-top: 8px; }
.count { font-size: 12.5px; color: var(--muted); margin-right: auto; }
</style>
