<script setup lang="ts">
// 배치21 — 참여인력 등록 폼 (POST /api/projects/:id/members).
//  - 필수 name + 선택 필드(구분·인력구분·소속·직급·부서·참여역할·PM여부).
//  - 백엔드가 pms_person에 find-or-insert 후 프로젝트에 연결(0005 §D).
//  - 쓰기는 백엔드 전용(dataClient가 API_BASE 게이트). 오류는 서버 {message} 그대로.
import { ref, computed, onMounted } from 'vue';
import { dataClient } from '../lib/dataClient';
import { EMPLOYMENT_TYPES, isOutsourcedType } from '../lib/personLabels';
import type { ProjectMemberInput, ProjectMemberType, EmploymentType, OrgPick, ProjectMemberDetail, Company, Project } from '../types';
import ModalShell from './ModalShell.vue';
import OrgPickerModal from './OrgPickerModal.vue';
import ProjectSelectField from './ProjectSelectField.vue';

// member 있으면 수정 모드(PATCH), 없으면 등록 모드(POST).
// 0028 §C: projectSelectable=true(참여인력 관리)면 폼 안에서 투입 프로젝트를 선택/변경한다.
//   등록 = 선택한 프로젝트로 POST, 수정 = 프로젝트 변경 시 PATCH projectId(이동).
const props = defineProps<{
  projectId?: number | null;
  member?: ProjectMemberDetail | null;
  projectSelectable?: boolean;
}>();
const emit = defineEmits<{ (e: 'saved'): void; (e: 'close'): void }>();

const isEdit = computed(() => !!props.member);

// 0039 — 참여역할은 관리자가 편집하는 마스터(관리자 콘솔 > 역할 권한)에서 불러온다.
//   하드코딩하면 역할을 추가해도 이 폼에 안 나온다. 로드 실패 시엔 선택지를 비운다(더미 금지).
const participationRoles = ref<{ code: string; label: string }[]>([]);

const name = ref('');
const memberType = ref<ProjectMemberType>('INTERNAL');
const employmentType = ref<EmploymentType | ''>('');

// 0027 결정4 — 소속회사: 자유 텍스트 → 회사 기준정보(pms_company) 선택.
//   '__new__' 선택 시 신규 회사명을 입력받아 저장 시점에 companies.create 후 연결.
//   외주 계열(project_contract/turnkey/freelancer)은 소속회사 필수.
const companies = ref<Company[]>([]);
const companySelect = ref<number | '' | '__new__'>('');
const newCompanyName = ref('');
const company = ref('');   // 표시명(제출 본문 company) — select/신규 입력에서 파생

// 0044 — 외주 계열 판정은 인력구분 마스터(isOutsourced)를 따른다.
const companyRequired = computed(() => isOutsourcedType(employmentType.value));

// 0028 §C — 투입 프로젝트 선택(참여인력 관리 전용). 등록: 필수 선택, 수정: 변경 시 이동.
//   프로젝트 수가 많아도 고를 수 있게 검색형 콤보박스(ProjectSelectField) 사용.
const projectList = ref<Project[]>([]);
const selectedProjectId = ref<number | null>(props.projectId ?? null);

onMounted(async () => {
  try {
    companies.value = (await dataClient.companies.list()).filter((c) => c.isActive !== false);
    syncCompanySelect();
  } catch (e) {
    console.error('[member-form] 회사 목록 로드 실패:', e);
  }
  try {
    const r = await dataClient.roleCapabilities.list();
    participationRoles.value = r.roles.map((x) => ({ code: x.roleCode, label: x.label || x.roleCode }));
  } catch (e) {
    console.error('[member-form] 참여역할 목록 로드 실패:', e);
  }
  if (props.projectSelectable) {
    try {
      projectList.value = await dataClient.projects.list();
    } catch (e) {
      console.error('[member-form] 프로젝트 목록 로드 실패:', e);
    }
  }
});

/** 프리필/조직도 선택으로 들어온 company(명)·companyId를 select 상태에 반영. */
function syncCompanySelect() {
  const m2 = props.member;
  const byId = m2?.companyId != null ? companies.value.find((c) => c.id === m2.companyId) : null;
  if (byId) { companySelect.value = byId.id; return; }
  const nm = (company.value || '').trim();
  if (!nm) return;
  const byName = companies.value.find((c) => c.name === nm);
  if (byName) companySelect.value = byName.id;
  else { companySelect.value = '__new__'; newCompanyName.value = nm; }
}
const position = ref('');
const department = ref('');
// 0042 — 표시용 부서명과 별개로 조직도 부서 코드를 들고 간다(부서 필터의 축).
const deptCode = ref<string | null>(null);
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
    deptCode.value = null;
    if (!isEdit.value) name.value = '';
    return;
  }
  memberType.value = p.source; // INTERNAL / EXTERNAL
  name.value = p.name ?? '';
  amaranthEmpNo.value = p.amaranthEmpNo ?? '';
  if (p.department) department.value = p.department;
  deptCode.value = p.deptCode;
  if (p.position) position.value = p.position;
  if (p.source === 'EXTERNAL') {
    if (p.companyName) { company.value = p.companyName; syncCompanySelect(); }
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
  if (!isEdit.value) {
    name.value = ''; department.value = ''; position.value = ''; company.value = '';
    deptCode.value = null;
    companySelect.value = ''; newCompanyName.value = '';
  }
}

const submitting = ref(false);
const error = ref<string | null>(null);

async function submit() {
  if (!name.value.trim()) { error.value = '성명은 필수입니다.'; return; }
  // 0028 §C: 프로젝트 선택 모드 — 등록·수정 모두 대상 프로젝트 필수.
  if (props.projectSelectable && selectedProjectId.value == null) {
    error.value = '투입 프로젝트를 선택해 주세요.'; return;
  }
  const targetProjectId = props.projectSelectable
    ? selectedProjectId.value
    : (props.projectId ?? null);
  if (targetProjectId == null) { error.value = '프로젝트가 지정되지 않았습니다.'; return; }
  // 외주 계열은 소속회사 필수(결정 4).
  const isNew = companySelect.value === '__new__';
  if (companyRequired.value && !companySelect.value) {
    error.value = '외주 인력은 소속회사를 선택(또는 신규 입력)해야 합니다.'; return;
  }
  if (isNew && !newCompanyName.value.trim()) {
    error.value = '신규 회사명을 입력해 주세요.'; return;
  }
  submitting.value = true;
  error.value = null;

  // 소속회사 확정: 기존 선택 → id·명, 신규 → companies.create 후 연결.
  let companyId: number | null = null;
  try {
    if (typeof companySelect.value === 'number') {
      const c = companies.value.find((x) => x.id === companySelect.value);
      companyId = c?.id ?? null;
      company.value = c?.name ?? company.value;
    } else if (isNew) {
      const created = await dataClient.companies.create({
        name: newCompanyName.value.trim(), type: 'PARTNER', isActive: true, agencyCode: null,
      });
      companyId = created.id;
      company.value = created.name;
      companies.value = [...companies.value, created];
      companySelect.value = created.id;
    } else {
      company.value = '';
    }
  } catch (e) {
    submitting.value = false;
    error.value = `신규 회사 등록 실패: ${e instanceof Error ? e.message : String(e)}`;
    return;
  }

  const input: ProjectMemberInput = {
    name: name.value.trim(),
    memberType: memberType.value,
    isProjectManager: isProjectManager.value,
  };
  if (amaranthEmpNo.value) input.amaranthEmpNo = amaranthEmpNo.value;
  input.employmentType = (employmentType.value || null) as EmploymentType | null;
  input.company = company.value.trim() || null;
  input.companyId = companyId;
  input.position = position.value.trim() || null;
  input.department = department.value.trim() || null;
  input.deptCode = deptCode.value;
  input.roleName = roleName.value.trim() || null;
  input.participationRole = participationRole.value || null;
  try {
    if (isEdit.value && props.member) {
      // 수정: URL은 원 소속 프로젝트, 프로젝트가 바뀌었으면 PATCH projectId로 이동(행 보존).
      const originProjectId = props.projectId ?? targetProjectId;
      if (props.projectSelectable && targetProjectId !== originProjectId) {
        input.projectId = targetProjectId;
      }
      await dataClient.projectMembers.update(originProjectId, props.member.memberId, input);
    } else {
      await dataClient.projectMembers.add(targetProjectId, input);
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
    <!-- 0028 §C: 투입 프로젝트 검색 선택(참여인력 관리 전용) — 수정 시 변경하면 프로젝트 이동 -->
    <template v-if="projectSelectable">
      <label class="label">투입 프로젝트 <span class="req">*</span></label>
      <ProjectSelectField
        v-model="selectedProjectId"
        :projects="projectList"
        :disabled="submitting"
        placeholder="프로젝트 검색 (코드·이름 입력)"
      />
    </template>

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
          <option v-for="r in participationRoles" :key="r.code" :value="r.code">{{ r.label }}</option>
        </select>
      </div>
    </div>

    <div class="row2">
      <div>
        <label class="label">소속회사 <span v-if="companyRequired" class="req">*</span></label>
        <select v-model="companySelect" class="input" :disabled="submitting">
          <option value="">{{ companyRequired ? '선택하세요' : '선택 안 함' }}</option>
          <option v-for="c in companies" :key="c.id" :value="c.id">{{ c.name }}</option>
          <option value="__new__">— 신규 회사 입력</option>
        </select>
        <input v-if="companySelect === '__new__'" v-model="newCompanyName" class="input new-company"
               type="text" placeholder="신규 회사명 (저장 시 기준정보 등록)" :disabled="submitting" />
        <p v-if="companyRequired" class="hint-line">외주 계열 인력은 소속회사가 필수입니다.</p>
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
.label { font-size: 13px; color: var(--muted); }
.req { color: var(--red); }
.input {
  background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); font-size: 14px; padding: 8px 10px; outline: none;
  font-family: inherit; width: 100%;
}
.input:focus { border-color: var(--accent); }
.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.row2 > div { display: flex; flex-direction: column; gap: 4px; }
.name-row { display: flex; gap: 8px; align-items: center; }
.name-in { flex: 1; }
.btn-outline {
  flex-shrink: 0; border: 1px solid var(--accent); background: transparent; color: var(--accent);
  font-size: 13.5px; font-weight: 600; padding: 8px 12px; border-radius: 8px; cursor: pointer; white-space: nowrap;
}
.btn-outline:hover:not(:disabled) { background: rgba(99, 102, 241, 0.12); }
.btn-outline:disabled { opacity: 0.5; cursor: default; }
.chk { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; cursor: pointer; }
.err { color: var(--red); font-size: 13px; }

/* 조직도 선택 완료 칩 */
.picked {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  border: 1px solid var(--accent); border-radius: 8px; padding: 8px 10px; background: var(--panel);
}
.picked-nm { font-size: 14px; font-weight: 700; }
.picked-sub { font-size: 13px; color: var(--muted); flex: 1; }
.picked-id { font-size: 12px; color: var(--muted); font-family: ui-monospace, monospace; }
.btn-link {
  border: 0; background: transparent; color: var(--accent);
  font-size: 13px; font-weight: 600; cursor: pointer; padding: 2px 4px;
}
.btn-link:disabled { opacity: 0.5; cursor: default; }
.hint-line { font-size: 12.5px; color: var(--muted); margin: 4px 0 0; }
.new-company { margin-top: 6px; }
</style>
