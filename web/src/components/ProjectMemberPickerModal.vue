<script setup lang="ts">
// 0038 — 프로젝트 내 담당자 선택(너울님 2026-07-27): 조직도 전체가 아니라
// **이 프로젝트 참여인력 중에서** 고른다. 태스크·이슈·액션·산출물 담당 지정 공용.
// 참여인력 등록 화면(ProjectMemberFormModal)은 계속 조직도(OrgPickerModal)를 쓴다 — 투입 자체는 조직에서.
import { computed, onMounted, ref } from 'vue';
import { dataClient } from '../lib/dataClient';
import type { ProjectMemberDetail } from '../types';

const props = defineProps<{ projectId: number; current?: string | null }>();
const emit = defineEmits<{
  (e: 'select', name: string): void;
  (e: 'clear'): void;
  (e: 'close'): void;
}>();

const members = ref<ProjectMemberDetail[]>([]);
const loading = ref(true);
const error = ref('');
const query = ref('');

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  const list = members.value.filter((m) => m.isActive !== false);
  if (!q) return list;
  return list.filter((m) =>
    [m.name, m.company ?? '', m.roleName ?? '', m.participationRole ?? '', m.department ?? '']
      .join(' ').toLowerCase().includes(q));
});

onMounted(async () => {
  try {
    members.value = await dataClient.projectMembers.listDetail(props.projectId);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="modal" role="dialog" aria-modal="true" aria-label="담당자 선택">
      <header class="head">
        <h3 class="title">담당자 선택 <span class="sub">— 이 프로젝트 참여인력</span></h3>
        <button class="x" type="button" aria-label="닫기" @click="emit('close')">✕</button>
      </header>

      <input v-model="query" class="search" type="search" placeholder="이름 · 회사 · 역할 검색…" />

      <div class="list">
        <p v-if="loading" class="state">참여인력 불러오는 중…</p>
        <p v-else-if="error" class="state err">{{ error }}</p>
        <p v-else-if="members.length === 0" class="state">
          참여인력이 없습니다 — 참여인력 탭에서 먼저 등록하세요.
        </p>
        <p v-else-if="filtered.length === 0" class="state">검색 결과가 없습니다.</p>
        <button
          v-for="m in filtered" :key="m.memberId" type="button"
          class="row" :class="{ current: m.name === props.current }"
          @click="emit('select', m.name)"
        >
          <span class="nm">{{ m.name }}<span v-if="m.isProjectManager" class="pm-tag">PM</span></span>
          <span class="meta">{{ m.memberType === 'EXTERNAL' ? (m.company || '외부') : (m.department || '내부') }}</span>
          <span class="meta">{{ m.participationRole || m.roleName || '—' }}</span>
        </button>
      </div>

      <div class="foot">
        <button v-if="props.current" class="btn btn-sm" type="button" @click="emit('clear')">담당 해제</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed; inset: 0; z-index: 95;
  background: rgba(0, 0, 0, 0.55);
  display: flex; align-items: center; justify-content: center; padding: 24px;
}
.modal {
  width: 440px; max-width: 100%; max-height: 76vh;
  display: flex; flex-direction: column; gap: 10px;
  background: var(--panel); border: 1px solid var(--border); border-radius: 14px; padding: 16px 18px;
}
.head { display: flex; align-items: center; justify-content: space-between; }
.title { font-size: 15px; margin: 0; }
.sub { font-size: 12px; color: var(--muted); font-weight: 500; }
.x { background: none; border: 0; color: var(--muted); font-size: 15px; cursor: pointer; }
.x:hover { color: var(--text); }
.search {
  background: var(--panel-2, var(--panel)); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); font-size: 13.5px; padding: 8px 12px; outline: none; font-family: inherit;
}
.search:focus { border-color: var(--accent); }
.list {
  overflow-y: auto; min-height: 120px; max-height: 48vh;
  border: 1px solid var(--border); border-radius: 8px; padding: 4px;
  display: flex; flex-direction: column; gap: 1px;
}
.row {
  display: grid; grid-template-columns: 1fr 110px 90px; gap: 8px; align-items: center;
  background: none; border: 0; border-radius: 6px; color: var(--text);
  font-size: 13px; padding: 7px 9px; cursor: pointer; text-align: left; font-family: inherit;
}
.row:hover { background: var(--panel-2); }
.row.current { outline: 1px solid var(--accent); }
.nm { font-weight: 600; display: flex; align-items: center; gap: 6px; }
.pm-tag {
  font-size: 10px; font-weight: 700; color: var(--accent);
  border: 1px solid var(--accent); border-radius: 4px; padding: 0 4px;
}
.meta { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.state { color: var(--muted); font-size: 12.5px; text-align: center; margin: 16px 0; }
.state.err { color: var(--red); }
.foot { display: flex; justify-content: flex-end; min-height: 10px; }
</style>
