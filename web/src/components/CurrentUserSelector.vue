<script setup lang="ts">
// 0012 C-3 dev "현재 사용자" 선택기 — 임시 신원(X-User-Id 소스).
//  - 후보: 전체 프로젝트 멤버(dataClient.members)에서 user_uid 있는 사용자만 중복 제거.
//  - 선택 uuid는 currentUser 모듈에 저장(localStorage 유지) → dataClient가 헤더로 주입.
//  - 0005 실 로그인(아마란스 SSO) 도입 시 이 선택기 제거.
import { ref, computed, onMounted } from 'vue';
import { dataClient } from '../lib/dataClient';
import { currentUserId, setCurrentUserId } from '../lib/currentUser';

interface UserOption { uid: string; label: string; }

const options = ref<UserOption[]>([]);

const selected = computed({
  get: () => currentUserId.value ?? '',
  set: (v: string) => setCurrentUserId(v || null),
});

onMounted(async () => {
  try {
    const members = await dataClient.members.list();
    const byUid = new Map<string, UserOption>();
    for (const m of members) {
      if (!m.userId) continue;
      if (!byUid.has(m.userId)) {
        const role = m.roleName ? ` · ${m.roleName}` : '';
        byUid.set(m.userId, { uid: m.userId, label: `${m.name || m.userId}${role}` });
      }
    }
    options.value = [...byUid.values()].sort((a, b) => a.label.localeCompare(b.label));
  } catch {
    options.value = []; // 멤버 조회 실패 → 선택기 빈 상태(안내)
  }
});
</script>

<template>
  <label class="cu">
    <span class="cu-label">현재 사용자</span>
    <select v-model="selected" class="cu-select" title="dev 임시 신원 (0005 실 로그인 전)">
      <option value="">(미선택)</option>
      <option v-for="o in options" :key="o.uid" :value="o.uid">{{ o.label }}</option>
    </select>
  </label>
</template>

<style scoped>
.cu { display: flex; align-items: center; gap: 6px; }
.cu-label { font-size: 11px; color: var(--muted); }
.cu-select {
  background: var(--panel-2); border: 1px solid var(--border); border-radius: 6px;
  color: var(--text); font-size: 12px; padding: 4px 8px; font-family: inherit; cursor: pointer;
  max-width: 200px;
}
.cu-select:focus { border-color: var(--accent); outline: none; }
</style>
