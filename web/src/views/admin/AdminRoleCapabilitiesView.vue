<script setup lang="ts">
// 0034 §2·§4 — 관리자 콘솔 > 프로젝트 역할 권한(④ participation_role 전역 기본 capability).
//   행=참여역할, 열=capability. 3단계 키(task/issue/action/deliverable.edit)는 all/own/false,
//   이진 키(project.edit/member.manage/meeting.write/doc.write)는 켜기/끄기.
import { onMounted, ref } from 'vue';
import { dataClient } from '../../lib/dataClient';
import type { ProjectRole } from '../../types';
import ModalShell from '../../components/ModalShell.vue';

// 0039 — 역할은 하드코딩 목록이 아니라 마스터(pms_role_capability)에서 온다.
//   표시명·정렬도 마스터 값이고, 추가·수정·삭제를 이 화면에서 한다.
//   경영진(EXEC)은 직급이라 여기서 제외한다 — 전사 권한은 접근 규칙의 직책 축이 담당.
type RoleRow = ProjectRole;
const CAP_LABELS: Record<string, string> = {
  'project.edit': '프로젝트 수정', 'member.manage': '참여인력 관리',
  'task.edit': '태스크', 'issue.edit': '이슈/리스크', 'action.edit': '액션아이템',
  'deliverable.edit': '산출물', 'meeting.write': '회의록 작성', 'doc.write': '공문 작성',
};

const roles = ref<RoleRow[]>([]);
const capKeys = ref<string[]>([]);
const tristateKeys = ref<string[]>([]);
const loading = ref(true);
const loadError = ref('');
const saving = ref<string | null>(null);
const saveError = ref('');

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    const r = await dataClient.roleCapabilities.list();
    roles.value = r.roles;
    capKeys.value = r.capabilityKeys;
    tristateKeys.value = r.tristateKeys;
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

function isTristate(key: string) {
  return tristateKeys.value.includes(key);
}

// ---- 역할 추가/수정/삭제 -------------------------------------------------------
const roleModal = ref<{ mode: 'create' | 'edit'; role: RoleRow | null } | null>(null);
const fCode = ref('');
const fLabel = ref('');
const fSort = ref(500);
const modalError = ref('');

function openCreate() {
  fCode.value = ''; fLabel.value = ''; fSort.value = 500;
  modalError.value = '';
  roleModal.value = { mode: 'create', role: null };
}
function openEdit(r: RoleRow) {
  fCode.value = r.roleCode; fLabel.value = r.label ?? ''; fSort.value = r.sortOrder ?? 500;
  modalError.value = '';
  roleModal.value = { mode: 'edit', role: r };
}
async function submitRole() {
  const m = roleModal.value;
  if (!m) return;
  modalError.value = '';
  saving.value = '__modal__';
  try {
    if (m.mode === 'create') {
      await dataClient.roleCapabilities.create({
        roleCode: fCode.value.trim(), label: fLabel.value.trim() || undefined, sortOrder: fSort.value,
      });
    } else {
      await dataClient.roleCapabilities.update(m.role!.roleCode, {
        label: fLabel.value.trim(), sortOrder: fSort.value,
      });
    }
    roleModal.value = null;
    await load();
  } catch (e) {
    modalError.value = e instanceof Error ? e.message : String(e);
  } finally {
    saving.value = null;
  }
}
async function removeRole(r: RoleRow) {
  if (!window.confirm(`역할 "${r.label || r.roleCode}"을(를) 삭제할까요?`)) return;
  saveError.value = '';
  try {
    await dataClient.roleCapabilities.remove(r.roleCode);
    await load();
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : String(e);
  }
}

async function setValue(role: RoleRow, key: string, value: unknown) {
  saving.value = role.roleCode + key;
  saveError.value = '';
  const prev = role.capabilities[key];
  role.capabilities[key] = value; // 낙관적 갱신
  try {
    await dataClient.roleCapabilities.update(role.roleCode, { [key]: value });
  } catch (e) {
    role.capabilities[key] = prev;
    saveError.value = e instanceof Error ? e.message : String(e);
  } finally {
    saving.value = null;
  }
}
function cycleTristate(role: RoleRow, key: string) {
  const cur = role.capabilities[key];
  const next = cur === 'all' ? 'own' : cur === 'own' ? false : 'all';
  void setValue(role, key, next);
}
function toggleBool(role: RoleRow, key: string) {
  void setValue(role, key, !role.capabilities[key]);
}

onMounted(load);
</script>

<template>
  <div>
    <div class="head-row">
      <h2 class="sect">프로젝트 역할 권한 <span class="hint">— ④ 참여역할별 전역 관리포인트 권한(0034)</span></h2>
    <p class="desc">
      프로젝트 참여인력의 역할(PM·DEV 등)에 따른 기본 권한입니다. ③ 접근 규칙의 capability와
      <b>더 허용적인 쪽으로 합쳐집니다(OR 결합)</b>. 3단계 항목은 클릭할 때마다
      <b>전체 → 본인 담당 → 불가</b> 순으로 바뀝니다.
    </p>
      <button class="btn btn-primary btn-sm" type="button" @click="openCreate">+ 역할 추가</button>
    </div>
    <p v-if="loadError" class="msg err">{{ loadError }}</p>
    <p v-if="saveError" class="msg err">{{ saveError }}</p>
    <p v-if="loading" class="msg">불러오는 중…</p>

    <table v-else class="tbl">
      <thead>
        <tr>
          <th>역할</th>
          <th v-for="k in capKeys" :key="k">{{ CAP_LABELS[k] ?? k }}</th>
          <th>작업</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in roles" :key="r.roleCode">
          <td class="name">
            {{ r.label || r.roleCode }}
            <span class="code">{{ r.roleCode }}</span>
          </td>
          <td v-for="k in capKeys" :key="k" class="cell">
            <button
              v-if="isTristate(k)" type="button" class="tri" :class="'tri-' + (r.capabilities[k] || 'false')"
              :disabled="saving === r.roleCode + k" @click="cycleTristate(r, k)"
            >{{ r.capabilities[k] === 'all' ? '전체' : r.capabilities[k] === 'own' ? '본인' : '불가' }}</button>
            <input
              v-else type="checkbox" :checked="!!r.capabilities[k]"
              :disabled="saving === r.roleCode + k" @change="toggleBool(r, k)"
            />
          </td>
          <td class="row-actions">
            <button class="btn-link" type="button" @click="openEdit(r)">수정</button>
            <button class="btn-link danger" type="button" @click="removeRole(r)">삭제</button>
          </td>
        </tr>
      </tbody>
    </table>

    <ModalShell v-if="roleModal" :title="roleModal.mode === 'create' ? '역할 추가' : '역할 수정'" @close="roleModal = null">
      <label class="f-label">역할 코드 <span class="req">*</span></label>
      <input
        v-model="fCode" class="f-input" type="text" placeholder="예: BA"
        :disabled="saving === '__modal__' || roleModal.mode === 'edit'"
      />
      <p class="f-hint">
        참여인력 행에 저장되는 식별자입니다(영문 대문자·숫자·밑줄). 만든 뒤에는 바꿀 수 없습니다.
      </p>
      <label class="f-label">표시명</label>
      <input v-model="fLabel" class="f-input" type="text" placeholder="예: BA(업무 분석가)" :disabled="saving === '__modal__'" />
      <label class="f-label">정렬 순서</label>
      <input v-model.number="fSort" class="f-input" type="number" :disabled="saving === '__modal__'" />
      <p v-if="modalError" class="msg err">{{ modalError }}</p>
      <template #footer>
        <button class="btn btn-sm" type="button" :disabled="saving === '__modal__'" @click="roleModal = null">취소</button>
        <button
          class="btn btn-primary btn-sm" type="button"
          :disabled="saving === '__modal__' || !fCode.trim()" @click="submitRole"
        >{{ saving === '__modal__' ? '저장 중…' : '저장' }}</button>
      </template>
    </ModalShell>
  </div>
</template>

<style scoped>
.sect { font-size: 17px; margin: 0 0 4px; }
.hint { font-size: 12px; color: var(--muted); font-weight: 500; }
.desc { color: var(--muted); font-size: 13px; margin: 0 0 14px; max-width: 700px; }
.msg { font-size: 12.5px; }
.msg.err { color: var(--red); }
.tbl { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.tbl th, .tbl td { border-bottom: 1px solid var(--border); padding: 7px 10px; text-align: center; }
.tbl th { color: var(--muted); font-weight: 600; font-size: 11.5px; }
.tbl td.name { text-align: left; font-weight: 600; }
.tri {
  border: 1px solid var(--border); background: var(--panel-2, var(--panel)); color: var(--muted);
  font-size: 11.5px; font-weight: 700; padding: 3px 10px; border-radius: 999px; cursor: pointer; font-family: inherit;
}
.tri-all { color: var(--green); border-color: var(--green); }
.tri-own { color: var(--yellow); border-color: var(--yellow); }
.tri-false { color: var(--muted); }

/* 0039 — 역할 추가/수정/삭제 */
.head-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.tbl td.name .code {
  margin-left: 6px; font-family: ui-monospace, monospace; font-size: 11px; color: var(--muted); font-weight: 400;
}
.row-actions { display: flex; gap: 8px; justify-content: center; }
.btn-link { border: 0; background: transparent; color: var(--accent); font-size: 12px; cursor: pointer; font-family: inherit; padding: 0; }
.btn-link:hover { text-decoration: underline; }
.btn-link.danger { color: var(--red); }
.f-label { font-size: 13px; color: var(--muted); }
.req { color: var(--red); }
.f-hint { margin: 0; font-size: 11.5px; color: var(--muted); }
.f-input {
  background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); font-size: 14px; padding: 8px 10px; outline: none;
  font-family: inherit; width: 100%; box-sizing: border-box;
}
.f-input:focus { border-color: var(--accent); }
</style>
