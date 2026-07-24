<script setup lang="ts">
// 0017 §C-1 카탈로그 선택기(P4 — 검색·필터·내용 미리보기).
//  batch12의 순수 체크박스 트리를 재사용 가능한 선택기로 고도화. 입찰 프로젝트 등록 마법사(Step 2)가 사용.
//  레이아웃(패널 폭 620px 내부, 좁음 → 세로 스택):
//   1) 검색바 — 이름·code·deliverableCategory·templateTags 부분일치.
//   2) 필터칩 — stage / deliverableCategory / templateTag. 값이 없는 축은 렌더 안 함(더미 금지).
//   3) 트리 — 검색·필터 매칭 노드 + 조상 경로만 표시(TailoringNodeItem visibleIds).
//   4) 하단 미리보기(접이식) — 행 클릭 시 노드 메타 표시. DELIVERABLE이면 templateFileRef(파일명)만 표시.
//      실제 파일 열람/다운로드는 FilePort/NAS 미구현 → 버튼 없음, "파일 열람 준비중"(0017 §C-1).
//  선택 상태(Set<number>)는 부모가 소유. cascade down은 TailoringNodeItem, cascade up은 부모(생성 시).
//  더미데이터 금지: 필터 옵션·미리보기는 실제 카탈로그 값만. 빈 값은 "—"/"설명 없음" 등 빈 상태 안내.
import { ref, computed } from 'vue';
import type { CatalogNode, CatalogNodeType } from '../types';
import TailoringNodeItem from './TailoringNodeItem.vue';

const props = defineProps<{
  tree: CatalogNode[];
  selected: Set<number>;         // 부모 소유 선택 집합
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggle', node: CatalogNode, checked: boolean): void;
  (e: 'clear'): void;
}>();

const TYPE_LABEL: Record<CatalogNodeType, string> = {
  PHASE: '단계', ACTIVITY: '활동', TASK: '태스크', DELIVERABLE: '산출물',
};
const STAGE_LABEL: Record<string, string> = { BIDDING: '입찰', EXECUTION: '수행' };

// templateTags 관용 파싱: 백엔드 jsonAny가 배열/객체/문자열/null 반환 → string[]로 정규화.
//   문자열이면 콤마/세미콜론 분리, 객체면 값들 문자열화. 빈 값은 [].
function parseTags(raw: CatalogNode['templateTags']): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.map((t) => String(t).trim()).filter(Boolean);
  if (typeof raw === 'object') {
    return Object.values(raw).map((v) => String(v).trim()).filter(Boolean);
  }
  return String(raw).split(/[,;]/).map((t) => t.trim()).filter(Boolean);
}

// --- 트리 평탄화(축별 옵션 수집·검색 매칭) ---
function flatten(nodes: CatalogNode[], acc: CatalogNode[] = []): CatalogNode[] {
  for (const n of nodes) { acc.push(n); flatten(n.children, acc); }
  return acc;
}
const flat = computed(() => flatten(props.tree));

// 부모 맵(조상 경로 계산용)
const parentOf = computed(() => {
  const map = new Map<number, number | null>();
  const walk = (n: CatalogNode, pid: number | null) => {
    map.set(n.id, pid);
    for (const c of n.children) walk(c, n.id);
  };
  for (const r of props.tree) walk(r, null);
  return map;
});

// --- 필터 옵션(실제 값만; 없으면 축 숨김) ---
const stageOptions = computed(() =>
  [...new Set(flat.value.map((n) => n.stage).filter((s): s is string => !!s))].sort(),
);
const categoryOptions = computed(() =>
  [...new Set(flat.value.map((n) => n.deliverableCategory).filter((c): c is string => !!c))].sort(),
);
const tagOptions = computed(() => {
  const set = new Set<string>();
  for (const n of flat.value) for (const t of parseTags(n.templateTags)) set.add(t);
  return [...set].sort();
});

// --- 검색·필터 상태 ---
const query = ref('');
const stageFilter = ref<string | null>(null);
const categoryFilter = ref<string | null>(null);
const tagFilter = ref<string | null>(null);

const hasFilters = computed(() =>
  !!query.value.trim() || !!stageFilter.value || !!categoryFilter.value || !!tagFilter.value,
);

// 단일 노드가 (검색+필터)에 매칭되는지. 필터 미설정 축은 통과.
function matches(n: CatalogNode): boolean {
  const q = query.value.trim().toLowerCase();
  if (q) {
    const hay = [
      n.name, n.code, n.deliverableCategory, ...parseTags(n.templateTags),
    ].filter(Boolean).join(' ').toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (stageFilter.value && n.stage !== stageFilter.value) return false;
  if (categoryFilter.value && n.deliverableCategory !== categoryFilter.value) return false;
  if (tagFilter.value && !parseTags(n.templateTags).includes(tagFilter.value)) return false;
  return true;
}

// 표시 집합: 매칭 노드 + 그 조상 경로(트리 문맥 유지). 필터 없으면 null(전부 표시).
const visibleIds = computed<Set<number> | null>(() => {
  if (!hasFilters.value) return null;
  const out = new Set<number>();
  for (const n of flat.value) {
    if (!matches(n)) continue;
    let cur: number | null | undefined = n.id;
    while (cur != null && !out.has(cur)) {
      out.add(cur);
      cur = parentOf.value.get(cur) ?? null;
    }
  }
  return out;
});

const matchCount = computed(() => (hasFilters.value ? flat.value.filter(matches).length : 0));
const noMatches = computed(() => hasFilters.value && matchCount.value === 0);

function resetFilters() {
  query.value = '';
  stageFilter.value = null;
  categoryFilter.value = null;
  tagFilter.value = null;
}

// 칩 토글: 같은 값 재클릭 시 해제(단일 선택 필터).
function toggleStage(v: string) { stageFilter.value = stageFilter.value === v ? null : v; }
function toggleCategory(v: string) { categoryFilter.value = categoryFilter.value === v ? null : v; }
function toggleTag(v: string) { tagFilter.value = tagFilter.value === v ? null : v; }

// --- 미리보기 ---
const focused = ref<CatalogNode | null>(null);
const previewOpen = ref(true);
function selectNode(n: CatalogNode) {
  focused.value = n;
  previewOpen.value = true;
}
const focusedTags = computed(() => (focused.value ? parseTags(focused.value.templateTags) : []));
const stageText = (s: string | null) => (s ? STAGE_LABEL[s] ?? s : '—');

const selectedCount = computed(() => props.selected.size);
</script>

<template>
  <div class="selector">
    <!-- 1) 검색 + 선택 요약 -->
    <div class="toolbar">
      <div class="search">
        <input
          v-model="query"
          class="search-in"
          type="text"
          placeholder="이름·코드·구분·태그 검색…"
          :disabled="disabled"
        />
        <button v-if="hasFilters" type="button" class="chip-reset" :disabled="disabled" @click="resetFilters">
          필터 초기화
        </button>
      </div>
      <div class="count">
        <span>{{ selectedCount > 0 ? `${selectedCount}개 선택` : '선택 안 함' }}</span>
        <button
          v-if="selectedCount > 0"
          type="button"
          class="clear"
          :disabled="disabled"
          @click="emit('clear')"
        >모두 해제</button>
      </div>
    </div>

    <!-- 2) 필터칩 (값 있는 축만; 더미 금지) -->
    <div v-if="stageOptions.length || categoryOptions.length || tagOptions.length" class="filters">
      <div v-if="stageOptions.length" class="frow">
        <span class="fkey">단계</span>
        <button
          v-for="s in stageOptions" :key="'st-' + s" type="button"
          class="chip" :class="{ on: stageFilter === s }" :disabled="disabled"
          @click="toggleStage(s)"
        >{{ STAGE_LABEL[s] ?? s }}</button>
      </div>
      <div v-if="categoryOptions.length" class="frow">
        <span class="fkey">산출물 구분</span>
        <button
          v-for="c in categoryOptions" :key="'ct-' + c" type="button"
          class="chip" :class="{ on: categoryFilter === c }" :disabled="disabled"
          @click="toggleCategory(c)"
        >{{ c }}</button>
      </div>
      <div v-if="tagOptions.length" class="frow">
        <span class="fkey">태그</span>
        <button
          v-for="t in tagOptions" :key="'tg-' + t" type="button"
          class="chip" :class="{ on: tagFilter === t }" :disabled="disabled"
          @click="toggleTag(t)"
        >{{ t }}</button>
      </div>
    </div>

    <!-- 3) 트리(검색·필터 적용) -->
    <p v-if="hasFilters" class="match-note">
      {{ noMatches ? '검색·필터에 맞는 항목이 없습니다.' : `매칭 ${matchCount}개(조상 경로 포함 표시)` }}
    </p>
    <ul v-if="tree.length && !noMatches" class="tree">
      <TailoringNodeItem
        v-for="n in tree"
        :key="n.id"
        :node="n"
        :selected="selected"
        :depth="0"
        :visible-ids="visibleIds"
        :focused-id="focused?.id ?? null"
        @toggle="(node, ck) => emit('toggle', node, ck)"
        @select="selectNode"
      />
    </ul>

    <!-- 4) 미리보기(접이식 하단 패널) -->
    <div v-if="focused" class="preview" :class="{ collapsed: !previewOpen }">
      <button type="button" class="pv-head" @click="previewOpen = !previewOpen">
        <span class="pv-title">
          <span class="pv-type" :class="focused.nodeType">{{ TYPE_LABEL[focused.nodeType] }}</span>
          {{ focused.name }}
        </span>
        <span class="pv-toggle">{{ previewOpen ? '▾' : '▸' }}</span>
      </button>
      <dl v-if="previewOpen" class="pv-body">
        <div v-if="focused.code"><dt>코드</dt><dd class="mono">{{ focused.code }}</dd></div>
        <div class="wide">
          <dt>설명</dt>
          <dd :class="{ empty: !focused.description }">{{ focused.description || '설명 없음' }}</dd>
        </div>
        <div><dt>단계</dt><dd>{{ stageText(focused.stage) }}</dd></div>
        <div v-if="focused.deliverableCategory"><dt>산출물 구분</dt><dd>{{ focused.deliverableCategory }}</dd></div>
        <div><dt>순번(seqNo)</dt><dd>{{ focused.seqNo ?? '—' }}</dd></div>
        <div><dt>선택 항목</dt><dd>{{ focused.isOptional ? '예(선택)' : '아니오(필수)' }}</dd></div>
        <div v-if="focusedTags.length" class="wide">
          <dt>태그</dt>
          <dd class="tags"><span v-for="t in focusedTags" :key="t" class="tag">{{ t }}</span></dd>
        </div>
        <!-- DELIVERABLE 템플릿: 파일명만 표시. 실열람은 FilePort 미구현(0017 §C-1) → 버튼 없음. -->
        <div v-if="focused.nodeType === 'DELIVERABLE'" class="wide">
          <dt>템플릿 파일</dt>
          <dd v-if="focused.templateFileRef" class="tmpl">
            <span class="mono">{{ focused.templateFileRef }}</span>
            <span class="tmpl-note">파일 열람 준비중</span>
          </dd>
          <dd v-else class="empty">템플릿 없음</dd>
        </div>
      </dl>
    </div>
    <p v-else class="pv-hint">항목을 클릭하면 내용(설명·구분·태그·템플릿)을 미리 볼 수 있습니다.</p>
  </div>
</template>

<style scoped>
.selector { display: flex; flex-direction: column; gap: 8px; }

/* 1) 툴바 */
.toolbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.search { display: flex; align-items: center; gap: 6px; flex: 1 1 200px; }
.search-in {
  flex: 1; min-width: 0;
  background: var(--panel-2, var(--panel)); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); font-size: 13px; padding: 6px 10px; outline: none;
}
.search-in:focus { border-color: var(--accent); }
.chip-reset {
  border: 1px solid var(--border); background: var(--panel-2); color: var(--muted);
  font-size: 12px; padding: 4px 8px; border-radius: 6px; cursor: pointer; white-space: nowrap;
}
.chip-reset:hover:not(:disabled) { color: var(--text); }
.count { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); }
.clear {
  border: 1px solid var(--border); background: var(--panel-2); color: var(--muted);
  font-size: 12px; padding: 2px 8px; border-radius: 6px; cursor: pointer;
}
.clear:hover:not(:disabled) { color: var(--text); }
.chip-reset:disabled, .clear:disabled, .chip:disabled { opacity: 0.5; cursor: not-allowed; }

/* 2) 필터 */
.filters { display: flex; flex-direction: column; gap: 5px; }
.frow { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
.fkey { font-size: 12px; color: var(--muted); width: 66px; flex-shrink: 0; }
.chip {
  border: 1px solid var(--border); background: var(--panel-2); color: var(--muted);
  font-size: 12px; padding: 2px 9px; border-radius: 999px; cursor: pointer;
}
.chip:hover:not(:disabled) { color: var(--text); }
.chip.on { background: var(--accent); color: #fff; border-color: var(--accent); }

/* 3) 트리 */
.match-note { margin: 2px 0 0; font-size: 12px; color: var(--muted); }
.tree {
  margin: 2px 0 0; padding: 8px; list-style: none;
  border: 1px solid var(--border); border-radius: 8px; background: var(--panel-2, var(--panel));
  max-height: 300px; overflow-y: auto;
}

/* 4) 미리보기 */
.preview { border: 1px solid var(--border); border-radius: 8px; background: var(--panel); overflow: hidden; }
.pv-head {
  width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 8px;
  background: var(--panel-2); border: 0; border-bottom: 1px solid var(--border);
  padding: 7px 10px; cursor: pointer; color: var(--text); font-size: 13px; text-align: left;
}
.preview.collapsed .pv-head { border-bottom: 0; }
.pv-title { display: flex; align-items: center; gap: 6px; font-weight: 600; min-width: 0; }
.pv-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pv-type {
  font-size: 11px; color: var(--muted); border: 1px solid var(--border);
  border-radius: 4px; padding: 0 5px; flex-shrink: 0; font-weight: 500;
}
.pv-type.PHASE { color: var(--accent); border-color: var(--accent); }
.pv-toggle { color: var(--muted); flex-shrink: 0; }
.pv-body { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; margin: 0; padding: 10px; }
.pv-body .wide { grid-column: 1 / -1; }
.pv-body dt { color: var(--muted); font-size: 11px; margin-bottom: 2px; }
.pv-body dd { margin: 0; font-size: 13px; color: var(--text); }
.pv-body dd.empty { color: var(--muted); font-style: italic; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
.tags { display: flex; flex-wrap: wrap; gap: 4px; }
.tags .tag {
  font-size: 11px; color: var(--muted); background: var(--panel-2);
  border: 1px solid var(--border); border-radius: 999px; padding: 1px 7px;
}
.tmpl { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.tmpl-note {
  font-size: 11px; color: var(--muted); background: var(--panel-2);
  border: 1px solid var(--border); border-radius: 999px; padding: 1px 7px;
}
.pv-hint { margin: 0; font-size: 12px; color: var(--muted); opacity: 0.8; }
</style>
