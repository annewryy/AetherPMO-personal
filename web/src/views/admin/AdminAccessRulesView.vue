<script setup lang="ts">
// 0034 §1·§4 — 관리자 콘솔 > 접근 규칙(③ 부서×직책×인력구분 → 메뉴 접근, 2단계에서 관리포인트도).
//   좌: 조직도 트리(부서 선택, 기존 OrgDeptTree 재사용) — 규칙 폼의 부서 선택 보조.
//   우: 규칙 목록(우선순위순) + 편집 폼(메뉴 체크리스트) + 판정 시뮬레이터(인력 검색).
import { computed, onMounted, ref } from 'vue';
import { dataClient } from '../../lib/dataClient';
import { EMPLOYMENT_TYPES } from '../../lib/personLabels';
import OrgDeptTree from '../../components/OrgDeptTree.vue';
import type { AccessRule, AccessRuleInput, Person, AccessRuleSimulation } from '../../types';

const rules = ref<AccessRule[]>([]);
const menuKeys = ref<string[]>([]);
const menuLabels = ref<Record<string, string>>({});
const positionCodes = ref<string[]>([]);
const loading = ref(true);
const loadError = ref('');
const saving = ref(false);
const actionError = ref('');

const POSITION_LABELS: Record<string, string> = {
  STAFF: '직책 없음(실무자)', PART_LEAD: '파트장', TEAM_LEAD: '팀장',
  DIV_HEAD: '본부장·실장', EXEC: '임원',
};

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    const [r, mk] = await Promise.all([dataClient.accessRules.list(), dataClient.accessRules.menuKeys()]);
    rules.value = r;
    menuKeys.value = mk.keys;
    menuLabels.value = mk.labels;
    positionCodes.value = mk.positionCodes;
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

// ---- 편집 폼 ----
const editingId = ref<number | null>(null);
const form = ref<AccessRuleInput>(blankForm());
function blankForm(): AccessRuleInput {
  return {
    name: '', deptCode: null, includeSub: true, positionCode: null, employmentType: null,
    menuKeys: ['dashboard'], projectScope: 'PARTICIPATING', priority: 100, enabled: true,
    personIds: [],
  };
}
const selectedDeptName = ref('');
function openCreate() {
  editingId.value = null;
  form.value = blankForm();
  selectedDeptName.value = '';
  personQuery.value = '';
}
function openEdit(r: AccessRule) {
  editingId.value = r.ruleId;
  form.value = {
    name: r.name ?? '', deptCode: r.deptCode, includeSub: r.includeSub, positionCode: r.positionCode,
    employmentType: r.employmentType, menuKeys: [...r.menuKeys], projectScope: r.projectScope,
    priority: r.priority, enabled: r.enabled, personIds: [...(r.personIds ?? [])],
  };
  selectedDeptName.value = '';
  personQuery.value = '';
}

// ---- 인력 지정 축 ----
//   부서·직책으로 묶이지 않는 집단(여러 부서에 흩어진 무직책 영업 인력 등)을 이름으로 골라 배정한다.
//   비워두면 이 축은 판정하지 않는다 = 조직 축(부서·직책·인력구분)만으로 결정되는 기존 규칙.
const personQuery = ref('');
const personById = computed(() => new Map(persons.value.map((p) => [p.personId, p])));
const selectedPersons = computed(() =>
  form.value.personIds.map((id) => {
    const p = personById.value.get(id);
    // 인력 목록이 아직 안 왔거나 삭제된 인력이면 id라도 보여준다(무음 소실 방지).
    return { personId: id, name: p?.name ?? `#${id}`, dept: p?.department ?? null };
  }),
);
const personCandidates = computed(() => {
  const q = personQuery.value.trim();
  if (!q) return [];
  return persons.value
    .filter((p) => p.name.includes(q) && !form.value.personIds.includes(p.personId))
    .slice(0, 8);
});
function addPerson(id: number) {
  if (!form.value.personIds.includes(id)) form.value.personIds.push(id);
  personQuery.value = '';
}
function removePerson(id: number) {
  const i = form.value.personIds.indexOf(id);
  if (i >= 0) form.value.personIds.splice(i, 1);
}
function onDeptPick(v: { deptCode: string | null; deptNames: string[] }) {
  form.value.deptCode = v.deptCode;
  selectedDeptName.value = v.deptCode ? (v.deptNames[0] ?? '') : '';
}
function toggleMenu(key: string) {
  const i = form.value.menuKeys.indexOf(key);
  if (i >= 0) form.value.menuKeys.splice(i, 1);
  else form.value.menuKeys.push(key);
}

async function save() {
  saving.value = true;
  actionError.value = '';
  try {
    const body = { ...form.value, name: form.value.name?.trim() || null };
    if (editingId.value == null) await dataClient.accessRules.create(body);
    else await dataClient.accessRules.update(editingId.value, body);
    await load();
    openCreate();
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : String(e);
  } finally {
    saving.value = false;
  }
}
async function remove(r: AccessRule) {
  if (!window.confirm(`"${r.name || '이름 없는 규칙'}"을 삭제할까요?`)) return;
  try {
    await dataClient.accessRules.remove(r.ruleId);
    await load();
    if (editingId.value === r.ruleId) openCreate();
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : String(e);
  }
}
async function toggleEnabled(r: AccessRule) {
  try {
    await dataClient.accessRules.update(r.ruleId, { enabled: !r.enabled } as Partial<AccessRuleInput>);
    await load();
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : String(e);
  }
}

// ---- 판정 시뮬레이터 ----
const persons = ref<Person[]>([]);
const simQuery = ref('');
const simResult = ref<AccessRuleSimulation | null>(null);
const simError = ref('');
const simMatches = computed(() => {
  const q = simQuery.value.trim();
  if (!q) return [];
  return persons.value.filter((p) => p.name.includes(q)).slice(0, 8);
});
async function runSimulate(personId: number) {
  simError.value = '';
  simResult.value = null;
  try {
    simResult.value = await dataClient.accessRules.simulate(personId);
  } catch (e) {
    simError.value = e instanceof Error ? e.message : String(e);
  }
}

onMounted(async () => {
  await load();
  try { persons.value = await dataClient.persons.list(); } catch { persons.value = []; }
});
</script>

<template>
  <div>
    <h2 class="sect">접근 규칙 <span class="hint">— 부서×직책×인력구분 → 메뉴 접근(0034)</span></h2>
    <p class="desc">
      메뉴 접근은 이 규칙만으로 결정됩니다. 한 사람에게 여러 규칙이 매칭되면
      <b>메뉴는 합집합</b>으로 부여됩니다. 매칭되는 규칙이 하나도 없으면 <b>대시보드만</b> 보입니다.
    </p>
    <p v-if="loadError" class="msg err">{{ loadError }}</p>

    <div class="cols">
      <!-- 좌: 조직도 트리(부서 선택 보조) -->
      <aside class="org-side">
        <div class="org-side-title">조직도 <span class="hint">— 클릭해 부서 선택</span></div>
        <OrgDeptTree @select="onDeptPick" />
      </aside>

      <div class="main">
        <!-- 규칙 목록 -->
        <section class="card">
          <div class="card-head">
            <h3 class="card-title">규칙 목록 <span class="hint">우선순위순</span></h3>
            <button class="btn btn-sm btn-primary" @click="openCreate">+ 규칙 추가</button>
          </div>
          <p v-if="loading" class="msg">불러오는 중…</p>
          <table v-else class="tbl">
            <thead>
              <tr>
                <th class="num">순위</th><th>이름</th><th>부서</th><th>직책</th><th>인력구분</th>
                <th>인력 지정</th><th>메뉴</th><th>범위</th><th>활성</th><th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in rules" :key="r.ruleId" :class="{ inactive: !r.enabled }">
                <td class="num">{{ r.priority }}</td>
                <td class="name">{{ r.name || '—' }}</td>
                <td>{{ r.deptCode ? (r.deptCode + (r.includeSub ? ' (하위 포함)' : '')) : '전체' }}</td>
                <td>{{ r.positionCode ? (POSITION_LABELS[r.positionCode] ?? r.positionCode) : '전체' }}</td>
                <td>{{ r.employmentType || '전체' }}</td>
                <td class="person-cell">
                  <template v-if="(r.persons ?? []).length">
                    {{ r.persons.slice(0, 3).map((p) => p.name).join(', ')
                    }}<span v-if="r.persons.length > 3" class="muted"> 외 {{ r.persons.length - 3 }}명</span>
                  </template>
                  <span v-else class="muted">전체</span>
                </td>
                <td class="menu-cell">{{ r.menuKeys.map((k) => menuLabels[k] ?? k).join(', ') }}</td>
                <td>{{ r.projectScope }}</td>
                <td><input type="checkbox" :checked="r.enabled" @change="toggleEnabled(r)" /></td>
                <td class="actions">
                  <button class="btn btn-sm" @click="openEdit(r)">수정</button>
                  <button class="btn btn-sm btn-danger" @click="remove(r)">삭제</button>
                </td>
              </tr>
              <tr v-if="rules.length === 0"><td colspan="10" class="empty">등록된 규칙이 없습니다.</td></tr>
            </tbody>
          </table>
        </section>

        <!-- 편집 폼 -->
        <section class="card">
          <h3 class="card-title">{{ editingId == null ? '규칙 추가' : '규칙 수정 #' + editingId }}</h3>
          <div class="form-grid">
            <label class="field">
              <span class="label">규칙 이름</span>
              <input v-model="form.name" type="text" class="input" placeholder="예: 공공사업본부 팀장" />
            </label>
            <label class="field">
              <span class="label">우선순위(낮을수록 우선 표시)</span>
              <input v-model.number="form.priority" type="number" class="input" />
            </label>
            <label class="field wide">
              <span class="label">부서 <span class="hint">(좌측 조직도에서 선택, 비우면 전 부서)</span></span>
              <div class="dept-row">
                <span v-if="form.deptCode" class="chip">{{ selectedDeptName || form.deptCode }}</span>
                <span v-else class="muted">전 부서</span>
                <label class="chk-inline"><input v-model="form.includeSub" type="checkbox" /> 하위 부서 포함</label>
                <button v-if="form.deptCode" class="btn btn-sm" type="button" @click="form.deptCode = null">해제</button>
              </div>
            </label>
            <label class="field">
              <span class="label">직책</span>
              <select v-model="form.positionCode" class="input">
                <option :value="null">전 직책</option>
                <option v-for="c in positionCodes" :key="c" :value="c">{{ POSITION_LABELS[c] ?? c }}</option>
              </select>
            </label>
            <label class="field">
              <span class="label">인력구분</span>
              <select v-model="form.employmentType" class="input">
                <option :value="null">전체</option>
                <option v-for="t in EMPLOYMENT_TYPES" :key="t.code" :value="t.code">{{ t.label }}</option>
              </select>
            </label>
            <div class="field wide">
              <span class="label">
                인력 지정
                <span class="hint">(비우면 안 따짐 — 부서·직책으로 안 묶이는 사람을 직접 지정)</span>
              </span>
              <div class="person-pick">
                <input
                  v-model="personQuery" class="input" type="text"
                  placeholder="이름으로 검색해 추가…"
                />
                <ul v-if="personCandidates.length" class="cand">
                  <li v-for="p in personCandidates" :key="p.personId">
                    <button type="button" class="cand-btn" @click="addPerson(p.personId)">
                      {{ p.name }}
                      <span class="muted">{{ p.department || '부서 없음' }} · {{ p.position || '직책 없음' }}</span>
                    </button>
                  </li>
                </ul>
                <p v-else-if="personQuery.trim()" class="hint">일치하는 인력이 없습니다.</p>
                <div v-if="selectedPersons.length" class="chips">
                  <span v-for="p in selectedPersons" :key="p.personId" class="person-chip">
                    {{ p.name }}
                    <span v-if="p.dept" class="muted">{{ p.dept }}</span>
                    <button type="button" class="chip-x" :aria-label="`${p.name} 제외`" @click="removePerson(p.personId)">✕</button>
                  </span>
                  <button type="button" class="chip-clear" @click="form.personIds = []">전체 해제</button>
                </div>
                <p v-else class="hint">지정된 인력 없음 — 부서·직책·인력구분 조건만으로 판정합니다.</p>
              </div>
            </div>
            <label class="field">
              <span class="label">관리포인트 조회 범위 <span class="hint">(2단계에서 적용)</span></span>
              <select v-model="form.projectScope" class="input">
                <option value="PARTICIPATING">참여 프로젝트만</option>
                <option value="DEPT">부서 담당 프로젝트</option>
                <option value="ALL">전사</option>
              </select>
            </label>
            <label class="field">
              <span class="label">활성</span>
              <input v-model="form.enabled" type="checkbox" class="check" />
            </label>
            <div class="field wide">
              <span class="label">부여 메뉴</span>
              <div class="menu-checks">
                <label v-for="k in menuKeys" :key="k" class="chk-inline">
                  <input type="checkbox" :checked="form.menuKeys.includes(k)" @change="toggleMenu(k)" />
                  {{ menuLabels[k] ?? k }}
                </label>
              </div>
            </div>
          </div>
          <div class="form-actions">
            <button class="btn btn-primary" :disabled="saving" @click="save">
              {{ saving ? '저장 중…' : (editingId == null ? '추가' : '저장') }}
            </button>
            <button v-if="editingId != null" class="btn" :disabled="saving" @click="openCreate">취소</button>
            <span v-if="actionError" class="msg err">{{ actionError }}</span>
          </div>
        </section>

        <!-- 판정 시뮬레이터 -->
        <section class="card">
          <h3 class="card-title">판정 시뮬레이터 <span class="hint">— 이 사람이 보는 메뉴 미리보기</span></h3>
          <input v-model="simQuery" class="input" type="text" placeholder="인력 이름 검색…" />
          <ul v-if="simMatches.length" class="cand">
            <li v-for="p in simMatches" :key="p.personId">
              <button class="cand-btn" @click="runSimulate(p.personId)">{{ p.name }} <span class="muted">#{{ p.personId }}</span></button>
            </li>
          </ul>
          <p v-if="simError" class="msg err">{{ simError }}</p>
          <div v-if="simResult" class="sim-result">
            <p>
              <b>{{ simResult.person.name }}</b> — {{ simResult.person.department || '부서 없음' }} ·
              {{ POSITION_LABELS[simResult.person.positionCode] ?? simResult.person.positionCode }} ·
              {{ simResult.person.employmentType || '인력구분 없음' }}
            </p>
            <p>매칭 규칙: {{ simResult.matchedRules.length ? simResult.matchedRules.map((r) => r.name || ('#' + r.ruleId)).join(', ') : '없음(기본값 적용)' }}</p>
            <p>유효 메뉴: <b>{{ simResult.effectiveMenus.map((k) => menuLabels[k] ?? k).join(', ') }}</b></p>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sect { font-size: 17px; margin: 0 0 4px; }
.hint { font-size: 12px; color: var(--muted); font-weight: 500; }
.desc { color: var(--muted); font-size: 13px; margin: 0 0 14px; max-width: 700px; }
.cols { display: flex; gap: 14px; align-items: flex-start; }
.org-side {
  width: 220px; flex-shrink: 0; position: sticky; top: 12px;
  border: 1px solid var(--border); border-radius: 10px; background: var(--panel); padding: 10px;
  max-height: 70vh; overflow-y: auto;
}
.org-side-title { font-size: 12.5px; font-weight: 700; color: var(--muted); margin: 0 0 8px 4px; }
.main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 14px; }
.card { border: 1px solid var(--border); border-radius: 10px; background: var(--panel); padding: 12px 14px; }
.card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.card-title { font-size: 14px; margin: 0 0 8px; }
.tbl { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.tbl th, .tbl td { border-bottom: 1px solid var(--border); padding: 6px 8px; text-align: left; }
.tbl th { color: var(--muted); font-weight: 600; font-size: 11.5px; }
.num { width: 50px; }
.inactive td { opacity: 0.5; }
.menu-cell { max-width: 260px; }
.actions { display: flex; gap: 6px; white-space: nowrap; }
.empty { text-align: center; color: var(--muted); padding: 16px 0; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; }
.field { display: flex; flex-direction: column; gap: 5px; }
.field.wide { grid-column: 1 / -1; }
.label { font-size: 12px; color: var(--muted); }
.input {
  background: var(--panel-2, var(--panel)); border: 1px solid var(--border); border-radius: 6px;
  color: var(--text); font-size: 13px; padding: 6px 8px; font-family: inherit;
}
.dept-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.chip { font-size: 12px; padding: 2px 9px; border-radius: 999px; border: 1px solid var(--accent); color: var(--accent); }
.chk-inline { display: flex; align-items: center; gap: 5px; font-size: 12.5px; }
.menu-checks { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 6px 12px; }
.form-actions { display: flex; align-items: center; gap: 10px; margin-top: 12px; }
.cand { list-style: none; margin: 8px 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.cand-btn {
  width: 100%; text-align: left; background: none; border: 0; border-radius: 6px;
  color: var(--text); font-size: 13px; padding: 5px 8px; cursor: pointer; font-family: inherit;
}
.cand-btn:hover { background: var(--panel-2); }
.sim-result { font-size: 13px; line-height: 1.7; }
.msg { font-size: 12.5px; }
.msg.err { color: var(--red); }
.muted { color: var(--muted); }

/* 인력 지정 축 */
.person-pick { display: flex; flex-direction: column; gap: 2px; }
.person-cell { max-width: 200px; }
.chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 6px; }
.person-chip {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 12px; padding: 3px 6px 3px 10px; border-radius: 999px;
  border: 1px solid var(--border); background: var(--panel-2); color: var(--text);
}
.person-chip .muted { font-size: 11px; }
.chip-x {
  border: 0; background: none; color: var(--muted); cursor: pointer;
  font-size: 11px; line-height: 1; padding: 2px 3px; font-family: inherit;
}
.chip-x:hover { color: var(--red); }
.chip-clear {
  border: 1px solid var(--border); background: none; color: var(--muted);
  font-size: 11.5px; padding: 2px 8px; border-radius: 999px; cursor: pointer; font-family: inherit;
}
.chip-clear:hover { color: var(--text); }
</style>
