<script setup lang="ts">
// 0034 §2·§4 — 관리자 콘솔 > 프로젝트 역할 권한(④ participation_role 전역 기본 capability).
//   행=참여역할, 열=capability. 3단계 키(task/issue/action/deliverable.edit)는 all/own/false,
//   이진 키(project.edit/member.manage/meeting.write/doc.write)는 켜기/끄기.
import { onMounted, ref } from 'vue';
import { dataClient } from '../../lib/dataClient';

interface RoleRow { roleCode: string; capabilities: Record<string, unknown> }

const ROLE_LABELS: Record<string, string> = {
  EXEC: '경영진(EXEC)', PM: 'PM', PL: 'PL', PMO: 'PMO', TA: 'TA', AA: 'AA',
  DA: 'DA', DBA: 'DBA', SE: 'SE', DEV: 'DEV', QA: 'QA', CT: 'CT', ETC: 'ETC(기타)',
};
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
    <h2 class="sect">프로젝트 역할 권한 <span class="hint">— ④ 참여역할별 전역 관리포인트 권한(0034)</span></h2>
    <p class="desc">
      프로젝트 참여인력의 역할(PM·DEV 등)에 따른 기본 권한입니다. ③ 접근 규칙의 capability와
      <b>더 허용적인 쪽으로 합쳐집니다(OR 결합)</b>. 3단계 항목은 클릭할 때마다
      <b>전체 → 본인 담당 → 불가</b> 순으로 바뀝니다.
    </p>
    <p v-if="loadError" class="msg err">{{ loadError }}</p>
    <p v-if="saveError" class="msg err">{{ saveError }}</p>
    <p v-if="loading" class="msg">불러오는 중…</p>

    <table v-else class="tbl">
      <thead>
        <tr>
          <th>역할</th>
          <th v-for="k in capKeys" :key="k">{{ CAP_LABELS[k] ?? k }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in roles" :key="r.roleCode">
          <td class="name">{{ ROLE_LABELS[r.roleCode] ?? r.roleCode }}</td>
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
        </tr>
      </tbody>
    </table>
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
</style>
