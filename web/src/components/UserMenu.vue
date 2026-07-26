<script setup lang="ts">
// 0031 §D — 상단바 사용자 메뉴: 이름·역할 칩 + 드롭다운(내정보/개인설정/알림설정/비밀번호 변경/활동이력/로그아웃).
//   로그인 상태에서만 표시. 미로그인 dev는 CurrentUserSelector(기존)가 대신 노출.
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { dataClient } from '../lib/dataClient';
import { useRouter } from 'vue-router';
import { currentUser, logout, changePassword, ROLE_LABELS } from '../lib/auth';

const router = useRouter();
const open = ref(false);
const rootEl = ref<HTMLElement | null>(null);

const user = computed(() => currentUser.value);
const roleLabel = computed(() => (user.value ? ROLE_LABELS[user.value.role] ?? user.value.role : ''));
const initial = computed(() => (user.value?.name ?? '?').trim().charAt(0) || '?');

function toggle() { open.value = !open.value; }
function onDocClick(e: MouseEvent) {
  if (rootEl.value && !rootEl.value.contains(e.target as Node)) open.value = false;
}
onMounted(() => document.addEventListener('click', onDocClick));
onUnmounted(() => document.removeEventListener('click', onDocClick));

// 0033 3차 — 알림 설정 모달(유형별 on/off)
const NOTIF_TYPES: { key: string; label: string; desc: string }[] = [
  { key: 'ASSIGNED', label: '담당 지정', desc: '태스크·액션아이템·이슈·산출물 담당자로 지정되면' },
  { key: 'PROJECT_ASSIGNED', label: '프로젝트 투입', desc: '프로젝트 참여인력으로 등록되면' },
  { key: 'MENTION', label: '멘션', desc: '코멘트에서 나를 언급하면' },
  { key: 'REPLY', label: '답글', desc: '내 코멘트에 답글이 달리면' },
  { key: 'COMMENT_ON_MINE', label: '내 항목 코멘트', desc: '내 담당 항목에 코멘트가 달리면' },
  { key: 'STATUS_CHANGED', label: '반려', desc: '내 담당 항목이 반려되면' },
  { key: 'DUE_SOON', label: '마감 임박', desc: '담당 항목 마감 하루 전·당일(일 1회)' },
  { key: 'OVERDUE', label: '기한 경과', desc: '담당 항목이 기한을 넘기면(일 1회)' },
  { key: 'RULE_RISK', label: '자동 리스크', desc: '담당 프로젝트에 규칙 기반 리스크가 자동 등록되면(PM)' },
];
const showNotif = ref(false);
const notifPrefs = ref<Record<string, boolean>>({});
const notifSaving = ref(false);
const notifError = ref('');
const notifDone = ref(false);
async function openNotif() {
  open.value = false;
  showNotif.value = true;
  notifError.value = '';
  notifDone.value = false;
  try {
    notifPrefs.value = (await dataClient.notificationPrefs.get()).prefs;
  } catch (e) {
    notifError.value = e instanceof Error ? e.message : String(e);
  }
}
async function saveNotif() {
  notifSaving.value = true;
  notifError.value = '';
  try {
    notifPrefs.value = (await dataClient.notificationPrefs.put(notifPrefs.value)).prefs;
    notifDone.value = true;
  } catch (e) {
    notifError.value = e instanceof Error ? e.message : String(e);
  } finally {
    notifSaving.value = false;
  }
}

// 비밀번호 변경 미니 모달
const showPw = ref(false);
const cur = ref(''); const nw = ref(''); const nw2 = ref('');
const pwSaving = ref(false); const pwError = ref<string | null>(null); const pwDone = ref(false);
function openPw() { open.value = false; showPw.value = true; cur.value = nw.value = nw2.value = ''; pwError.value = null; pwDone.value = false; }
async function submitPw() {
  if (nw.value.length < 8) { pwError.value = '새 비밀번호는 8자 이상이어야 합니다.'; return; }
  if (nw.value !== nw2.value) { pwError.value = '새 비밀번호가 일치하지 않습니다.'; return; }
  pwSaving.value = true; pwError.value = null;
  try {
    await changePassword(cur.value, nw.value);
    pwDone.value = true;
    window.setTimeout(() => { showPw.value = false; }, 1200);
  } catch (e) {
    pwError.value = e instanceof Error ? e.message : String(e);
  } finally {
    pwSaving.value = false;
  }
}

// 미구현 항목 안내(placeholder — 개인설정·알림설정·내정보·활동이력 실구현은 후속)
function notReady(label: string) { open.value = false; alert(`${label}은(는) 준비 중입니다.`); }

async function doLogout() {
  open.value = false;
  await logout();
  router.replace('/login');
}
</script>

<template>
  <div v-if="user" ref="rootEl" class="um">
    <button class="chip" @click="toggle">
      <span class="avatar">{{ initial }}</span>
      <span class="who">
        <span class="nm">{{ user.name }}</span>
        <span class="role">{{ roleLabel }}</span>
      </span>
      <span class="caret">▾</span>
    </button>

    <div v-if="open" class="menu">
      <div class="menu-head">
        <div class="mh-name">{{ user.name }}</div>
        <div class="mh-sub">{{ user.username }} · {{ roleLabel }}</div>
      </div>
      <button class="mi" @click="notReady('내 정보')">내 정보</button>
      <button class="mi" @click="notReady('개인 설정')">개인 설정</button>
      <button class="mi" @click="openNotif">알림 설정</button>
      <button class="mi" @click="openPw">비밀번호 변경</button>
      <button class="mi" @click="notReady('활동 이력')">활동 이력</button>
      <div class="sep"></div>
      <button class="mi logout" @click="doLogout">로그아웃</button>
    </div>

    <!-- 0033 — 알림 설정 -->
    <div v-if="showNotif" class="pw-overlay" @click.self="showNotif = false">
      <div class="pw-card notif-card">
        <h3 class="pw-title">알림 설정</h3>
        <p class="notif-sub">끈 유형은 이후 알림이 생성되지 않습니다(이미 받은 알림은 유지).</p>
        <div class="notif-list">
          <label v-for="t in NOTIF_TYPES" :key="t.key" class="notif-row">
            <input v-model="notifPrefs[t.key]" type="checkbox" :disabled="notifSaving" />
            <span class="notif-label">{{ t.label }}</span>
            <span class="notif-desc">{{ t.desc }}</span>
          </label>
        </div>
        <div v-if="notifError" class="pw-err">{{ notifError }}</div>
        <div v-else-if="notifDone" class="notif-ok">저장되었습니다.</div>
        <div class="pw-actions">
          <button class="btn btn-sm" :disabled="notifSaving" @click="showNotif = false">닫기</button>
          <button class="btn btn-primary btn-sm" :disabled="notifSaving" @click="saveNotif">
            {{ notifSaving ? '저장 중…' : '저장' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 비밀번호 변경 -->
    <div v-if="showPw" class="pw-overlay" @click.self="showPw = false">
      <div class="pw-card">
        <h3 class="pw-title">비밀번호 변경</h3>
        <template v-if="!pwDone">
          <input v-model="cur" class="pw-in" type="password" placeholder="현재 비밀번호" :disabled="pwSaving" />
          <input v-model="nw" class="pw-in" type="password" placeholder="새 비밀번호 (8자 이상)" :disabled="pwSaving" />
          <input v-model="nw2" class="pw-in" type="password" placeholder="새 비밀번호 확인" :disabled="pwSaving" />
          <div v-if="pwError" class="pw-err">{{ pwError }}</div>
          <div class="pw-actions">
            <button class="btn btn-sm" :disabled="pwSaving" @click="showPw = false">취소</button>
            <button class="btn btn-primary btn-sm" :disabled="pwSaving" @click="submitPw">
              {{ pwSaving ? '변경 중…' : '변경' }}
            </button>
          </div>
        </template>
        <div v-else class="pw-done">비밀번호가 변경되었습니다.</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.um { position: relative; }
.chip {
  display: flex; align-items: center; gap: 8px; cursor: pointer;
  background: var(--panel-2); border: 1px solid var(--border); border-radius: 999px;
  padding: 4px 10px 4px 4px; color: var(--text); font-family: inherit;
}
.avatar {
  width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
  background: color-mix(in srgb, var(--accent) 25%, transparent); color: var(--accent);
  display: inline-flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700;
}
.who { display: flex; flex-direction: column; line-height: 1.2; text-align: left; }
.nm { font-size: 13px; font-weight: 600; }
.role { font-size: 11px; color: var(--muted); }
.caret { font-size: 10px; color: var(--muted); }

.menu {
  position: absolute; right: 0; top: calc(100% + 6px); z-index: 40; width: 200px;
  background: var(--panel); border: 1px solid var(--border); border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4); padding: 6px;
}
.menu-head { padding: 8px 10px; border-bottom: 1px solid var(--border); margin-bottom: 4px; }
.mh-name { font-size: 13px; font-weight: 700; }
.mh-sub { font-size: 11.5px; color: var(--muted); }
.mi {
  display: block; width: 100%; text-align: left; border: 0; background: transparent;
  color: var(--text); font-size: 13px; padding: 8px 10px; border-radius: 6px; cursor: pointer; font-family: inherit;
}
.mi:hover { background: var(--panel-2); }
.mi.logout { color: var(--red); }
.sep { height: 1px; background: var(--border); margin: 4px 0; }

.pw-overlay { position: fixed; inset: 0; z-index: 50; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; }
.pw-card { width: 300px; background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
.pw-title { font-size: 15px; margin: 0 0 14px; }
.pw-in {
  width: 100%; box-sizing: border-box; background: var(--bg); border: 1px solid var(--border);
  border-radius: 8px; color: var(--text); font-size: 14px; padding: 8px 10px; outline: none; margin-bottom: 8px; font-family: inherit;
}
.pw-in:focus { border-color: var(--accent); }
.pw-err { color: var(--red); font-size: 12.5px; margin-bottom: 8px; }
.pw-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 6px; }
.pw-done { color: var(--green); font-size: 14px; text-align: center; padding: 10px 0; }

/* 0033 — 알림 설정 모달 */
.notif-card { width: 430px; }
.notif-sub { font-size: 12px; color: var(--muted); margin: -4px 0 10px; }
.notif-list { display: flex; flex-direction: column; gap: 7px; max-height: 320px; overflow-y: auto; }
.notif-row { display: grid; grid-template-columns: 18px 96px 1fr; gap: 8px; align-items: baseline; cursor: pointer; }
.notif-label { font-size: 13px; font-weight: 600; }
.notif-desc { font-size: 12px; color: var(--muted); }
.notif-ok { font-size: 12.5px; color: var(--green); margin-top: 8px; }
</style>
