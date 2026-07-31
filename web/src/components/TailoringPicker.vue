<script setup lang="ts">
// 테일러링 선택 공용 컴포넌트 — 사업 유형 필터 + 계약금액 규모 판정 + 규모별 필수 자동 선택 + CatalogSelector.
//   원래 ExecConvertWizard(입찰→수행 전환)에만 있던 0029 Phase B 컨트롤을 뽑아, 프로젝트를 만드는
//   3경로가 전부 같은 UI·같은 규칙을 쓰도록 한다:
//     - ExecConvertWizard        입찰 → 수행 전환
//     - BidProjectCreateWizard   나라장터 공고 → 입찰 프로젝트 생성
//     - ProjectFormModal         입찰 프로젝트 직접 생성
//   선택 집합(Set<number>)은 **부모가 소유**한다(제출 시 조상 전개에 필요). 이 컴포넌트는 변경을
//   emit으로만 요청한다 — add/remove/clear/toggle.
import { ref, computed, watch } from 'vue';
import type { CatalogNode } from '../types';
import { BIZ_TYPES, filterTreeByBizType, flattenNodes, sizeOf } from '../lib/tailoring';
import { useCodes, fallbackCodes } from '../lib/codes';
import CatalogSelector from './CatalogSelector.vue';

const props = defineProps<{
  tree: CatalogNode[];               // 필터 전 전체 트리
  selected: Set<number>;             // 부모 소유 선택 집합
  contractAmount: number | null;     // 규모 판정 입력
  disabled?: boolean;
  /**
   * 0039 — 프로젝트 단계(BIDDING·EXECUTION). 주면 그 단계의 PHASE만 노출한다
   * (입찰 프로젝트에 수행 단계 산출물을 전개하지 않도록). 미지정이면 전부 노출.
   */
  stage?: 'BIDDING' | 'EXECUTION' | 'COMPLETED' | null;
}>();

const emit = defineEmits<{
  (e: 'toggle', node: CatalogNode, checked: boolean): void;
  (e: 'add', ids: number[]): void;
  (e: 'remove', ids: number[]): void;
  (e: 'clear'): void;
}>();

const bizType = ref('SI');

// 0044 §E — 고객사 분류(공통코드 CLIENT_CATEGORY) 필터. 분류가 2개 이상일 때만 선택 노출.
const CLIENT_CATEGORIES = useCodes('CLIENT_CATEGORY',
  fallbackCodes('CLIENT_CATEGORY', [{ code: 'default', label: '표준' }]));
const clientCategory = ref('default');
const visibleCategories = computed(() =>
  CLIENT_CATEGORIES.filter((c) =>
    props.tree.some((n) => (n.clientCategory ?? 'default') === c.code)));
const categoryScoped = computed(() =>
  props.tree.filter((n) => (n.clientCategory ?? 'default') === clientCategory.value));

// 분류 → 단계 필터 → 유형 필터 순으로 좁힌다. stage 미지정 노드는 '수행'으로 본다(V36 백필 기준).
const stageScoped = computed(() => {
  const want = props.stage === 'BIDDING' ? 'BIDDING' : props.stage ? 'EXECUTION' : null;
  if (!want) return categoryScoped.value;
  return categoryScoped.value.filter((n) => (n.stage ?? 'EXECUTION') === want);
});
const filteredTree = computed(() => filterTreeByBizType(stageScoped.value, bizType.value));

// 분류·유형 변경 시 필터 밖 노드는 선택에서 제거(전개 대상 오염 방지).
watch([bizType, clientCategory, () => props.stage], () => {
  const allowed = new Set(flattenNodes(filteredTree.value).map((n) => n.id));
  const stale = [...props.selected].filter((id) => !allowed.has(id));
  if (stale.length) emit('remove', stale);
});

const sizeInfo = computed(() => sizeOf(props.contractAmount));
const requiredNodes = computed<CatalogNode[]>(() => {
  const s = sizeInfo.value;
  if (!s) return [];
  return flattenNodes(filteredTree.value).filter((n) => n[s.field] === true);
});
const requiredSelectedCount = computed(
  () => requiredNodes.value.filter((n) => props.selected.has(n.id)).length,
);
function autoSelectRequired() {
  emit('add', requiredNodes.value.map((n) => n.id));
}
</script>

<template>
  <div class="tailor">
    <!-- 0029 Phase B — 유형·규모 연동 자동 전개 -->
    <div class="tailor-ctl">
      <!-- 0044 §E — 고객사 분류(2개 이상일 때만) -->
      <div v-if="visibleCategories.length > 1" class="ctl-row">
        <span class="ctl-key">고객사 분류</span>
        <button
          v-for="c in visibleCategories" :key="c.code" type="button"
          class="type-chip" :class="{ on: clientCategory === c.code }" :disabled="disabled"
          @click="clientCategory = c.code"
        >{{ c.label }}</button>
      </div>
      <div class="ctl-row">
        <span class="ctl-key">사업 유형</span>
        <button
          v-for="t in BIZ_TYPES" :key="t.key" type="button"
          class="type-chip" :class="{ on: bizType === t.key }" :disabled="disabled"
          @click="bizType = t.key"
        >{{ t.label }}</button>
      </div>
      <div class="ctl-row">
        <span class="ctl-key">규모 판정</span>
        <template v-if="sizeInfo">
          <span class="size-badge">{{ sizeInfo.label }}</span>
          <span class="ctl-note">필수 산출물 {{ requiredNodes.length }}건 중 {{ requiredSelectedCount }}건 선택됨</span>
          <button
            type="button" class="btn-mini btn-mini-primary"
            :disabled="disabled || requiredNodes.length === 0 || requiredSelectedCount === requiredNodes.length"
            @click="autoSelectRequired"
          >규모별 필수 자동 선택</button>
        </template>
        <span v-else class="ctl-note">계약금액을 입력하면 규모(소/중/대)를 판정해 필수 산출물을 자동 선택할 수 있습니다.</span>
      </div>
    </div>

    <CatalogSelector
      :tree="filteredTree"
      :selected="selected"
      :disabled="disabled"
      @toggle="(node, ck) => emit('toggle', node, ck)"
      @select-all="(ids) => emit('add', ids)"
      @clear="emit('clear')"
    />
  </div>
</template>

<style scoped>
.tailor { display: flex; flex-direction: column; gap: 8px; }

/* 0029 Phase B — 유형·규모 연동 컨트롤 */
.tailor-ctl {
  display: flex; flex-direction: column; gap: 6px;
  border: 1px solid var(--border); border-radius: 8px; background: var(--panel-2, var(--panel));
  padding: 8px 10px;
}
.ctl-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.ctl-key { font-size: 12px; color: var(--muted); width: 66px; flex-shrink: 0; }
.type-chip {
  border: 1px solid var(--border); background: var(--panel); color: var(--muted);
  font-size: 12px; padding: 3px 10px; border-radius: 999px; cursor: pointer; font-family: inherit;
}
.type-chip:hover:not(:disabled) { color: var(--text); }
.type-chip.on { background: var(--accent); color: #fff; border-color: var(--accent); }
.type-chip:disabled { opacity: 0.5; cursor: not-allowed; }
.size-badge {
  font-size: 12px; font-weight: 700; color: var(--accent);
  border: 1px solid var(--accent); border-radius: 999px; padding: 2px 10px;
}
.ctl-note { font-size: 12px; color: var(--muted); }
.btn-mini {
  border: 1px solid var(--border); background: var(--panel); color: var(--text);
  font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 6px;
  cursor: pointer; font-family: inherit;
}
.btn-mini-primary { background: var(--accent); color: #fff; border-color: var(--accent); }
.btn-mini:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
