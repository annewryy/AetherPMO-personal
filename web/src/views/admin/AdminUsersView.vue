<script setup lang="ts">
// 0032 §6 — 사용자 관리(SYS_ADMIN): 목록(검색·역할 필터·페이징 규약) + 행 편집
//   역할 변경 / 활성 토글 / person(인력) 연결(참여 스코프 판정 키) / 비밀번호 발급(0034).
//   자기 자신의 SYS_ADMIN 해제·비활성화는 서버가 400으로 차단한다.
import { computed, onMounted, ref } from 'vue';
import { dataClient, type AdminUser } from '../../lib/dataClient';
import type { Person } from '../../types';
import { currentUser } from '../../lib/auth';

const ROLES = ['SYS_ADMIN', 'EXEC_ADMIN', 'PM', 'WORKER', 'VIEWER'];
const PAGE_SIZES = [10, 20, 50, 100];

const items = ref<AdminUser[]>([]);
const total = ref(0);
const page = ref(1);
const size = ref(20);
const q = ref('');
const roleFilter = ref('');
const loading = ref(false);
const error = ref('');
const notice = ref('');

// 확장 행(인력 연결·비번 발급 폼)
const openUserId = ref<number | null>(null);
const personQuery = ref('');
const newPassword = ref('');
const persons = ref<Person[]>([]);

const pageCount = computed(() => Math.max(1, Math.ceil(total.value / size.value)));
const personMatches = computed(() => {
  const kw = personQuery.value.trim();
  if (!kw) return [];
  return persons.value.filter((p) => p.name?.includes(kw)).slice(0, 8);
});

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const r = await dataClient.adminUsers.list({
      q: q.value.trim() || undefined,
      role: roleFilter.value || undefined,
      page: page.value,
      size: size.value,
    });
    items.value = r.items;
    total.value = r.total;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

function search() {
  page.value = 1;
  void load();
}

function go(p: number) {
  if (p < 1 || p > pageCount.value) return;
  page.value = p;
  void load();
}

function toggleRow(u: AdminUser) {
  openUserId.value = openUserId.value === u.userId ? null : u.userId;
  personQuery.value = '';
  newPassword.value = '';
  notice.value = '';
}

async function patchUser(u: AdminUser, body: { role?: string; isActive?: boolean; personId?: number | null }) {
  error.value = '';
  notice.value = '';
  try {
    await dataClient.adminUsers.patch(u.userId, body);
    notice.value = `${u.username} 변경 저장됨`;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
    await load(); // 실패 시 서버 상태로 복원
  }
}

async function linkPerson(u: AdminUser, p: Person) {
  await patchUser(u, { personId: p.personId });
  personQuery.value = '';
}

async function issuePassword(u: AdminUser) {
  if (newPassword.value.length < 8) {
    error.value = '비밀번호는 8자 이상이어야 합니다.';
    return;
  }
  error.value = '';
  try {
    await dataClient.adminUsers.setPassword(u.username, newPassword.value);
    notice.value = `${u.username} 비밀번호 발급 완료 — 사용자에게 전달 후 변경을 안내하세요.`;
    newPassword.value = '';
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}

onMounted(async () => {
  await load();
  try {
    persons.value = await dataClient.persons.list();
  } catch {
    persons.value = [];
  }
});
</script>

<template>
  <div>
    <h2 class="sect">사용자 관리</h2>
    <p class="desc">
      계정(pms_user)의 역할·활성·인력 연결을 관리합니다. <b>인력 연결</b>은 PM/WORKER의
      참여 프로젝트 판정 키입니다(미연결이면 참여 프로젝트가 비어 보입니다 — 0032 §2).
    </p>

    <div class="toolbar">
      <input v-model="q" class="inp" placeholder="아이디 · 이름 · 이메일 검색" @keyup.enter="search" />
      <select v-model="roleFilter" class="inp sel" @change="search">
        <option value="">전체 역할</option>
        <option v-for="r in ROLES" :key="r" :value="r">{{ r }}</option>
      </select>
      <button class="btn btn-sm" @click="search">검색</button>
      <span class="spacer" />
      <select v-model.number="size" class="inp sel" @change="search">
        <option v-for="s in PAGE_SIZES" :key="s" :value="s">{{ s }}개씩</option>
      </select>
    </div>

    <p v-if="error" class="msg err">{{ error }}</p>
    <p v-else-if="notice" class="msg ok">{{ notice }}</p>

    <table class="tbl">
      <thead>
        <tr>
          <th class="num">No</th>
          <th>아이디</th>
          <th>이름</th>
          <th>역할</th>
          <th>인력 연결</th>
          <th>아마란스</th>
          <th>PW</th>
          <th>활성</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <template v-for="(u, i) in items" :key="u.userId">
          <tr :class="{ inactive: !u.isActive }">
            <td class="num">{{ (page - 1) * size + i + 1 }}</td>
            <td class="mono">{{ u.username }}</td>
            <td>{{ u.name || '—' }}</td>
            <td>
              <select
                class="inp sel role" :value="u.role"
                :disabled="u.userId === currentUser?.id"
                @change="patchUser(u, { role: ($event.target as HTMLSelectElement).value })"
              >
                <option v-for="r in ROLES" :key="r" :value="r">{{ r }}</option>
              </select>
            </td>
            <td>
              <span v-if="u.personId" class="chip on">{{ u.personName }}</span>
              <span v-else class="chip">미연결</span>
            </td>
            <td><span class="chip" :class="{ on: u.amaranthLinked }">{{ u.amaranthLinked ? '연동' : '—' }}</span></td>
            <td><span class="chip" :class="{ on: u.hasPassword }">{{ u.hasPassword ? '설정' : '미설정' }}</span></td>
            <td>
              <input
                type="checkbox" :checked="u.isActive"
                :disabled="u.userId === currentUser?.id"
                @change="patchUser(u, { isActive: ($event.target as HTMLInputElement).checked })"
              />
            </td>
            <td>
              <button class="btn btn-sm" @click="toggleRow(u)">
                {{ openUserId === u.userId ? '닫기' : '편집' }}
              </button>
            </td>
          </tr>
          <tr v-if="openUserId === u.userId" class="expand">
            <td colspan="9">
              <div class="edit-grid">
                <div class="edit-box">
                  <div class="edit-title">인력(person) 연결</div>
                  <div class="edit-row">
                    <input v-model="personQuery" class="inp" placeholder="이름으로 검색" />
                    <button v-if="u.personId" class="btn btn-sm" @click="patchUser(u, { personId: null })">연결 해제</button>
                  </div>
                  <ul v-if="personMatches.length" class="cand">
                    <li v-for="p in personMatches" :key="p.personId">
                      <button class="cand-btn" @click="linkPerson(u, p)">
                        {{ p.name }} <span class="muted">#{{ p.personId }}</span>
                      </button>
                    </li>
                  </ul>
                </div>
                <div class="edit-box">
                  <div class="edit-title">비밀번호 발급</div>
                  <div class="edit-row">
                    <input v-model="newPassword" type="text" class="inp" placeholder="새 비밀번호(8자 이상)" />
                    <button class="btn btn-sm btn-primary" @click="issuePassword(u)">발급</button>
                  </div>
                  <p class="muted small">발급 즉시 적용됩니다. 전달 후 본인 변경을 안내하세요.</p>
                </div>
              </div>
            </td>
          </tr>
        </template>
        <tr v-if="!loading && items.length === 0">
          <td colspan="9" class="empty">조건에 맞는 사용자가 없습니다.</td>
        </tr>
      </tbody>
    </table>

    <div class="pager">
      <button class="btn btn-sm" :disabled="page <= 1" @click="go(page - 1)">이전</button>
      <span class="muted">{{ page }} / {{ pageCount }} · 총 {{ total }}명</span>
      <button class="btn btn-sm" :disabled="page >= pageCount" @click="go(page + 1)">다음</button>
    </div>
  </div>
</template>

<style scoped>
.sect { font-size: 17px; margin: 0 0 4px; }
.desc { color: var(--muted); font-size: 13px; margin: 0 0 14px; }
.toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
.toolbar .spacer { flex: 1; }
.inp {
  background: var(--panel); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); font-size: 13px; padding: 6px 10px; font-family: inherit;
}
.sel { padding-right: 6px; }
.tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
.tbl th, .tbl td { border-bottom: 1px solid var(--border); padding: 7px 8px; text-align: left; }
.tbl th { color: var(--muted); font-weight: 600; font-size: 12px; }
.num { width: 44px; color: var(--muted); }
.mono { font-family: ui-monospace, monospace; }
.inactive td { opacity: 0.5; }
.role { font-size: 12px; padding: 3px 4px; }
.chip {
  display: inline-block; font-size: 11.5px; padding: 2px 8px; border-radius: 999px;
  background: var(--panel-2); color: var(--muted); border: 1px solid var(--border);
}
.chip.on { color: var(--green); border-color: rgba(52, 211, 153, 0.4); background: rgba(52, 211, 153, 0.08); }
.expand td { background: var(--panel); }
.edit-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; padding: 6px 2px; }
.edit-box { border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; }
.edit-title { font-size: 12.5px; font-weight: 700; margin-bottom: 8px; }
.edit-row { display: flex; gap: 8px; align-items: center; }
.edit-row .inp { flex: 1; }
.cand { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.cand-btn {
  width: 100%; text-align: left; background: none; border: 1px solid transparent; border-radius: 6px;
  color: var(--text); font-size: 13px; padding: 5px 8px; cursor: pointer; font-family: inherit;
}
.cand-btn:hover { background: var(--panel-2); border-color: var(--border); }
.muted { color: var(--muted); }
.small { font-size: 12px; margin: 8px 0 0; }
.msg { font-size: 13px; margin: 6px 0; }
.err { color: var(--red); }
.ok { color: var(--green); }
.empty { text-align: center; color: var(--muted); padding: 22px 0; }
.pager { display: flex; gap: 10px; align-items: center; justify-content: center; margin-top: 14px; }
</style>
