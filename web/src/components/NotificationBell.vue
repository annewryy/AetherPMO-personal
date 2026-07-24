<script setup lang="ts">
// 0012 C-3 알림 벨 — 미읽음 카운트 뱃지 + 드롭다운(내가 태깅된 코멘트).
//  - 현재 사용자(X-User-Id) 기준 GET /api/notifications. 진입·현재 사용자 변경 시 + 30초 폴링.
//  - 항목 클릭 → 해당 엔티티 상세 패널+코멘트로 이동(딥링크), PATCH read.
//  - 폴백(API_BASE 없음) 또는 현재 사용자 미선택: 비활성 + 안내.
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { dataClient } from '../lib/dataClient';
import { currentUserId } from '../lib/currentUser';
import type { AppNotification, CommentEntityType } from '../types';

const router = useRouter();
const apiMode = computed(() => !!window.API_BASE);
const enabled = computed(() => apiMode.value && !!currentUserId.value);

const items = ref<AppNotification[]>([]);
const open = ref(false);
const loadError = ref<string | null>(null);

const unreadCount = computed(() => items.value.filter((n) => !n.isRead).length);

// 엔티티 타입 → 상세 패널 kind + 프로젝트 상세 탭
const KIND: Record<string, { kind: string; tab: string }> = {
  ISSUE: { kind: 'issue', tab: 'issues' },
  ACTION_ITEM: { kind: 'action', tab: 'action-items' },
  DELIVERABLE: { kind: 'artifact', tab: 'artifacts' },
  TASK: { kind: 'task', tab: 'tasks' },
};
// 프로젝트 폴백이 필요할 때(projectId 없음) 전역 목록 경로
const GLOBAL_ROUTE: Partial<Record<CommentEntityType | string, string>> = {
  ISSUE: '/issues', ACTION_ITEM: '/action-items',
};

async function load() {
  if (!enabled.value) { items.value = []; return; }
  loadError.value = null;
  try {
    items.value = await dataClient.notifications.list();
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  }
}

async function onClick(n: AppNotification) {
  open.value = false;
  // 읽음 처리(실패해도 이동은 진행)
  if (!n.isRead) {
    try { await dataClient.notifications.read(n.id); n.isRead = true; } catch { /* 무시 */ }
  }
  const map = KIND[n.entityType];
  if (map && n.projectId != null) {
    router.push({
      path: `/projects/${n.projectId}`,
      query: {
        tab: map.tab,
        panel: `${map.kind}:${n.entityId}`,
        ...(n.commentId != null ? { comment: String(n.commentId) } : {}),
      },
    });
  } else {
    // projectId 미제공 → 전역 목록으로 폴백(거기서 프로젝트 진입)
    const path = GLOBAL_ROUTE[n.entityType];
    if (path) router.push(path);
  }
}

async function markAll() {
  try { await dataClient.notifications.readAll(); await load(); } catch { /* 무시 */ }
}

function fmtTime(v: string): string {
  const s = String(v);
  return s.includes('T') ? s.replace('T', ' ').slice(0, 16) : s;
}

// 폴링(30초) — 현재 사용자/모드 바뀌면 즉시 재조회
let timer: number | undefined;
onMounted(() => {
  load();
  timer = window.setInterval(() => { if (enabled.value && !open.value) load(); }, 30000);
});
onBeforeUnmount(() => { if (timer) window.clearInterval(timer); });
watch([currentUserId, apiMode], () => { open.value = false; load(); });

function toggle() {
  if (!enabled.value) return;
  open.value = !open.value;
  if (open.value) load();
}
</script>

<template>
  <div class="bell-wrap">
    <button
      class="bell" type="button"
      :class="{ disabled: !enabled }"
      :title="enabled ? '알림' : (apiMode ? '현재 사용자를 선택하세요' : '알림은 백엔드(API_BASE) 연결 후 활성화')"
      @click="toggle"
    >
      🔔
      <span v-if="enabled && unreadCount > 0" class="badge">{{ unreadCount > 99 ? '99+' : unreadCount }}</span>
    </button>

    <div v-if="open" class="dropdown">
      <div class="dd-head">
        <span class="dd-title">알림</span>
        <button v-if="unreadCount > 0" class="dd-all" type="button" @click="markAll">모두 읽음</button>
      </div>
      <div v-if="loadError" class="dd-err">{{ loadError }}</div>
      <div v-else-if="items.length === 0" class="dd-empty">알림이 없습니다.</div>
      <ul v-else class="dd-list">
        <li
          v-for="n in items" :key="n.id"
          class="dd-item" :class="{ unread: !n.isRead }"
          @click="onClick(n)"
        >
          <div class="dd-item-head">
            <span class="dd-actor">{{ n.actorName || '누군가' }}</span>
            <span class="dd-type">{{ n.type === 'REPLY' ? '답글' : '멘션' }}</span>
            <span class="dd-time">{{ fmtTime(n.createdAt) }}</span>
          </div>
          <p class="dd-preview">{{ n.preview || '코멘트에서 회원님을 언급했습니다.' }}</p>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.bell-wrap { position: relative; }
.bell {
  position: relative; border: 1px solid var(--border); background: var(--panel-2);
  border-radius: 8px; padding: 5px 9px; cursor: pointer; font-size: 16px; line-height: 1;
}
.bell:hover { border-color: var(--accent); }
.bell.disabled { opacity: 0.5; cursor: not-allowed; }
.badge {
  position: absolute; top: -6px; right: -6px;
  min-width: 16px; height: 16px; padding: 0 4px; box-sizing: border-box;
  background: var(--red); color: #fff; border-radius: 999px;
  font-size: 11px; font-weight: 700; line-height: 16px; text-align: center;
}
.dropdown {
  position: absolute; right: 0; top: calc(100% + 6px); z-index: 80;
  width: 320px; max-height: 420px; overflow-y: auto;
  background: var(--panel); border: 1px solid var(--border); border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
}
.dd-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px; border-bottom: 1px solid var(--border);
}
.dd-title { font-size: 14px; font-weight: 600; }
.dd-all {
  border: 0; background: transparent; color: var(--accent);
  font-size: 13px; cursor: pointer; font-family: inherit;
}
.dd-all:hover { text-decoration: underline; }
.dd-err { padding: 14px; font-size: 13px; color: var(--red); }
.dd-empty { padding: 18px 14px; font-size: 13px; color: var(--muted); }
.dd-list { list-style: none; margin: 0; padding: 0; }
.dd-item { padding: 10px 14px; border-bottom: 1px solid var(--border); cursor: pointer; }
.dd-item:last-child { border-bottom: 0; }
.dd-item:hover { background: var(--panel-2); }
.dd-item.unread { background: rgba(139, 92, 246, 0.07); }
.dd-item-head { display: flex; align-items: center; gap: 8px; margin-bottom: 3px; }
.dd-actor { font-size: 13px; font-weight: 600; }
.dd-type {
  font-size: 11px; font-weight: 600; color: var(--accent);
  border: 1px solid var(--accent); border-radius: 999px; padding: 0 6px;
}
.dd-time { margin-left: auto; font-size: 12px; color: var(--muted); }
.dd-preview { margin: 0; font-size: 13px; color: var(--muted); word-break: break-word; }
</style>
