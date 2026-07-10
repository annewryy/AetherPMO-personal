<script setup lang="ts">
// 배치21 — 참여인력 등록 폼 (POST /api/projects/:id/members).
//  - 필수 name + 선택 필드(구분·인력구분·소속·직급·부서·참여역할·PM여부).
//  - 백엔드가 pms_person에 find-or-insert 후 프로젝트에 연결(0005 §D).
//  - 쓰기는 백엔드 전용(dataClient가 API_BASE 게이트). 오류는 서버 {message} 그대로.
import { ref, computed } from 'vue';
import { dataClient } from '../lib/dataClient';
import { EMPLOYMENT_TYPES } from '../lib/personLabels';
import type { ProjectMemberInput, ProjectMemberType, EmploymentType, OrgPick, ProjectMemberDetail } from '../types';
import ModalShell from './ModalShell.vue';
import OrgPickerModal from './OrgPickerModal.vue';

// member 있으면 수정 모드(PATCH), 없으면 등록 모드(POST).
const props = defineProps<{ projectId: number; member?: ProjectMemberDetail | null }>();
const emit = defineEmits<{ (e: 'saved'): void; (e: 'close'): void }>();

const isEdit = computed(() => !!props.member);

// 참여역할(0014) — PM·PL·PMO·TA·AA·DA·DBA·SE·DEV·QA·CT·ETC.
const PARTICIPATION_ROLES = ['PM', 'PL', 'PMO', 'TA', 'AA', 'DA', 'DBA', 'SE', 'DEV', 'QA', 'CT', 'ETC'] as const;

const name = ref('');
const memberType = ref<ProjectMemberType>('INTERNAL');
const employmentType = ref<EmploymentType | ''>('');
const company = ref('');
const position = ref('');
const department = ref('');
const roleName = ref('');
const participationRole = ref('');
const isProjectManager = ref(false);

// 조직도 선택(0020) — 재사용 OrgPickerModal로 내부/외부 인력을 트리·검색으로 선택.
const amaranthEmpNo = ref('');
const showOrgPicker = ref(false);
// 선택된 인력 표시 칩(내부/기존 외부). null이면 직접 입력(성명 텍스트).
const picked = ref<{ name: string; sub: string; src: ProjectMemberType } | null>(null);

// 수정 모드 프리필.
const m = props.member;
if (m) {
  name.value = m.name ?? '';
  memberType.value = (m.memberType as ProjectMemberType) || 'INTERNAL';
  employmentType.value = (m.employmentType as EmploymentType) || '';
  company.value = m.company ?? '';
  position.value = m.position ?? '';
  department.value = m.department ?? '';
  roleName.value = m.roleName ?? '';
  participationRole.value = m.participationRole ?? '';
  isProjectManager.value = !!m.isProjectManager;
}

function onOrgPick(p: OrgPick) {
  showOrgPicker.value = false;
  if (p.source === 'NEW_EXTERNAL') {
    // 신규 외부 인력 → 직접 입력 유도(성명·소속 비움, 구분 외부).
    memberType.value = 'EXTERNAL';
    picked.value = null;
    amaranthEmpNo.value = '';
    if (!isEdit.value) name.value = '';
    return;
  }
  memberType.value = p.source; // INTERNAL / EXTERNAL
  name.value = p.name ?? '';
  amaranthEmpNo.value = p.amaranthEmpNo ?? '';
  if (p.department) department.value = p.department;
  if (p.position) position.value = p.position;
  if (p.source === 'EXTERNAL') {
    if (p.companyName) company.value = p.companyName;
    if (p.employmentType) employmentType.value = p.employmentType as EmploymentType;
  }
  picked.value = {
    name: p.name ?? '',
    src: p.source,
    sub: p.source === 'INTERNAL'
      ? [p.department, p.position].filter(Boolean).join(' · ')
      : [p.companyName, p.position].filter(Boolean).join(' · '),
  };
}
function clearPicked() {
  picked.value = null;
  amaranthEmpNo.value = '';
  if (!isEdit.value) { name.value = ''; department.value = ''; position.value = ''; company.value = ''; }
}

const submitting = ref(false);
const error = ref<string | null>(null);

async function submit() {
  if (!name.value.trim()) { error.value = '성명은 필수입니다.'; return; }
  submitting.value = true;
  error.value = null;
  const input: ProjectMemberInput = {
    name: name.value.trim(),
    memberType: memberType.value,
    isProjectManager: isProjectManager.value,
  };
  if (amaranthEmpNo.value) input.amaranthEmpNo = amaranthEmpNo.value;
  input.employmentType = (employmentType.value || null) as EmploymentType | null;
  input.company = company.value.trim() || null;
  input.position = position.value.trim() || null;
  input.department = department.value.trim() || null;
  input.roleName = roleName.value.trim() || null;
  input.participationRole = participationRole.value || null;
  try {
    if (isEdit.value && props.member) {
      await dataClient.projectMembers.update(props.projectId, props.member.memberId, input);
    } else {
      await dataClient.projectMembers.add(props.projectId, input);
    }
    emit('saved');
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <ModalShell :title="isEdit ? '참여인력 수정' : '참여인력 등록'" @close="emit('close')">
    <label class="label">성명 <span class="req">*</span></label>
    <!-- 조직도에서 선택 완료(내부/기존 외부) -->
    <div v-if="picked" class="picked">
      <span class="picked-nm">{{ name }}</span>
      <span class="picked-sub">{{ picked.sub }}</span>
      <span class="picked-id">{{ picked.src === 'INTERNAL' ? '내부' : '외부' }}</span>
      <button class="btn-link" type="button" :disabled="submitting" @click="clearPicked">다시 선택</button>
    </div>
    <!-- 직접 입력 + 조직도 열기 버튼 -->
    <template v-else>
      <div class="name-row">
        <input v-model="name" class="input name-in" type="text" placeholder="성명" :disabled="submitting" />
        <button class="btn-outline" type="button" :disabled="submitting" @click="showOrgPicker = true">조직도에서 선택</button>
      </div>
    </template>

    <label class="label">구분</label>
    <select v-model="memberType" class="input" :disabled="submitting">
      <option value="INTERNAL">내부</option>
      <option value="EXTERNAL">외부</option>
    </select>

    <div class="row2">
      <div>
        <label class="label">인력구분</label>
        <select v-model="employmentType" class="input" :disabled="submitting">
          <option value="">선택 안 함</option>
          <option v-for="t in EMPLOYMENT_TYPES" :key="t.code" :value="t.code">{{ t.label }}</option>
        </select>
      </div>
      <div>
        <label class="label">참여역할</label>
        <select v-model="participationRole" class="input" :disabled="submitting">
          <option value="">선택 안 함</option>
          <option v-for="r in PARTICIPATION_ROLES" :key="r" :value="r">{{ r }}</option>
        </select>
      </div>
    </div>

    <div class="row2">
      <div>
        <label class="label">소속</label>
        <input v-model="company" class="input" type="text" placeholder="소속 (선택)" :disabled="submitting" />
      </div>
      <div>
        <label class="label">직급/직책</label>
        <input v-model="position" class="input" type="text" placeholder="직급/직책 (선택)" :disabled="submitting" />
      </div>
    </div>

    <label class="label">부서</label>
    <input v-model="department" class="input" type="text"
           :placeholder="memberType === 'INTERNAL' ? '조직도 선택 시 자동' : '부서 (선택)'" :disabled="submitting" />

    <label class="label">직책(역할명)</label>
    <input v-model="roleName" class="input" type="text" placeholder="직책/역할명 (선택)" :disabled="submitting" />

    <label class="chk">
      <input v-model="isProjectManager" type="checkbox" :disabled="submitting" />
      프로젝트 관리자(PM)
    </label>

    <div v-if="error" class="err">{{ error }}</div>

    <template #footer>
      <button class="btn btn-sm" type="button" :disabled="submitting" @click="emit('close')">취소</button>
      <button class="btn btn-primary btn-sm" type="button" :disabled="submitting || !name.trim()" @click="submit">
        {{ submitting ? '저장 중…' : (isEdit ? '저장' : '등록') }}
      </button>
    </template>
  </ModalShell>

  <!-- 재사용 조직도 선택 모달(내부/외부 트리 + 검색) -->
  <OrgPickerModal v-if="showOrgPicker" @select="onOrgPick" @close="showOrgPicker = false" />
</template>

<style scoped>
.label { font-size: 12px; color: var(--muted); }
.req { color: var(--red); }
.input {
  background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); font-size: 13px; padding: 8px 10px; outline: none;
  font-family: inherit; width: 100%;
}
.input:focus { border-color: var(--accent); }
.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.row2 > div { display: flex; flex-direction: column; gap: 4px; }
.name-row { display: flex; gap: 8px; align-items: center; }
.name-in { flex: 1; }
.btn-outline {
  flex-shrink: 0; border: 1px solid var(--accent); background: transparent; color: var(--accent);
  font-size: 12.5px; font-weight: 600; padding: 8px 12px; border-radius: 8px; cursor: pointer; white-space: nowrap;
}
.btn-outline:hover:not(:disabled) { background: rgba(99, 102, 241, 0.12); }
.btn-outline:disabled { opacity: 0.5; cursor: default; }
.chk { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; }
.err { color: var(--red); font-size: 12px; }

/* 조직도 선택 완료 칩 */
.picked {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  border: 1px solid var(--accent); border-radius: 8px; padding: 8px 10px; background: var(--panel);
}
.picked-nm { font-size: 13px; font-weight: 700; }
.picked-sub { font-size: 12px; color: var(--muted); flex: 1; }
.picked-id { font-size: 11px; color: var(--muted); font-family: ui-monospace, monospace; }
.btn-link {
  border: 0; background: transparent; color: var(--accent);
  font-size: 12px; font-weight: 600; cursor: pointer; padding: 2px 4px;
}
.btn-link:disabled { opacity: 0.5; cursor: default; }
.hint-line { font-size: 11.5px; color: var(--muted); margin: 4px 0 0; }
</style>
