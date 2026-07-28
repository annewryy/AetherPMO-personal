<script setup lang="ts">
// 0039 — 인력 마스터 신규 등록/수정(인력관리 화면).
//   참여인력 등록 폼(ProjectMemberFormModal)의 구성요소를 재사용한다:
//   소속회사 select + 신규 회사 인라인 등록 · 인력구분 어휘.
//   차이점: 프로젝트 소속(참여역할·PM 플래그)이 없고, 인력 마스터 필드(연락처·이메일·재직상태)가 있다.
//   '조직도에서 선택'은 두지 않는다 — 내부 인력은 아마란스 동기화로 이미 전원 마스터에 있고
//   (사번 중복으로 저장도 거부됨), 외부 인력도 조직도 가지 자체가 기등록 마스터라 '신규 등록'과 맞지 않는다.
import { ref, computed, onMounted } from 'vue';
import { dataClient } from '../lib/dataClient';
import { EMPLOYMENT_TYPES } from '../lib/personLabels';
import type { Company, EmploymentType, Person, PersonInput } from '../types';
import ModalShell from './ModalShell.vue';

const props = defineProps<{ person?: Person | null }>();  // 있으면 수정 모드
const emit = defineEmits<{ (e: 'saved', person: Person): void; (e: 'close'): void }>();

const isEdit = computed(() => !!props.person);
const OUTSOURCED: ReadonlySet<string> = new Set(['project_contract', 'turnkey', 'freelancer']);

const name = ref(props.person?.name ?? '');
const source = ref<'INTERNAL' | 'EXTERNAL'>((props.person?.source as 'INTERNAL' | 'EXTERNAL') ?? 'EXTERNAL');
const amaranthEmpNo = ref(props.person?.amaranthEmpNo ?? '');
const employmentType = ref<EmploymentType | string>(props.person?.employmentType ?? 'regular');
const department = ref(props.person?.department ?? '');
const position = ref(props.person?.position ?? '');
const phone = ref(props.person?.phone ?? '');
const email = ref(props.person?.email ?? '');
const status = ref(props.person?.status ?? '재직');
const submitting = ref(false);
const error = ref<string | null>(null);

// 소속회사 — 기존 선택 또는 '__new__'로 신규 등록 후 연결(참여인력 폼과 동일 흐름).
const companies = ref<Company[]>([]);
const companySelect = ref<number | '' | '__new__'>(props.person?.companyId ?? '');
const newCompanyName = ref('');
const companyRequired = computed(() => OUTSOURCED.has(String(employmentType.value)));

onMounted(async () => {
  try {
    companies.value = (await dataClient.companies.list()).filter((c) => c.isActive !== false);
  } catch (e) {
    console.error('[person-form] 회사 목록 로드 실패:', e);
  }
});

async function submit() {
  if (!name.value.trim()) { error.value = '성명은 필수입니다.'; return; }
  const isNewCompany = companySelect.value === '__new__';
  if (companyRequired.value && !companySelect.value) {
    error.value = '외주 계열 인력은 소속회사를 선택(또는 신규 입력)해야 합니다.'; return;
  }
  if (isNewCompany && !newCompanyName.value.trim()) { error.value = '신규 회사명을 입력해 주세요.'; return; }

  submitting.value = true;
  error.value = null;

  // 소속회사 확정 — 신규면 회사 기준정보부터 만들고 그 id로 연결(참여인력 폼과 동일).
  let companyId: number | null = null;
  try {
    if (typeof companySelect.value === 'number') {
      companyId = companySelect.value;
    } else if (isNewCompany) {
      const created = await dataClient.companies.create({
        name: newCompanyName.value.trim(), type: 'PARTNER', isActive: true, agencyCode: null,
      });
      companyId = created.id;
      companies.value = [...companies.value, created];
      companySelect.value = created.id;
    }
  } catch (e) {
    submitting.value = false;
    error.value = `신규 회사 등록 실패: ${e instanceof Error ? e.message : String(e)}`;
    return;
  }

  const input: PersonInput = {
    name: name.value.trim(),
    source: source.value,
    amaranthEmpNo: amaranthEmpNo.value.trim() || null,
    employmentType: employmentType.value,
    companyId,
    department: department.value.trim() || null,
    position: position.value.trim() || null,
    phone: phone.value.trim() || null,
    email: email.value.trim() || null,
    status: status.value || '재직',
  };
  try {
    const saved = isEdit.value
      ? await dataClient.persons.update(props.person!.personId, input)
      : await dataClient.persons.create(input);
    emit('saved', saved);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <ModalShell :title="isEdit ? '인력 수정' : '인력 신규 등록'" @close="emit('close')">
    <label class="label">성명 <span class="req">*</span></label>
    <input v-model="name" class="input" type="text" placeholder="성명" :disabled="submitting" />

    <div class="row2">
      <div>
        <label class="label">구분</label>
        <select v-model="source" class="input" :disabled="submitting">
          <option value="INTERNAL">내부</option>
          <option value="EXTERNAL">외부</option>
        </select>
      </div>
      <div>
        <label class="label">사번 <span class="hint">(내부 인력 식별 키 — 보통 비움)</span></label>
        <input v-model="amaranthEmpNo" class="input" type="text" placeholder="사번 (선택)" :disabled="submitting" />
      </div>
    </div>

    <div class="row2">
      <div>
        <label class="label">인력구분</label>
        <select v-model="employmentType" class="input" :disabled="submitting">
          <option v-for="t in EMPLOYMENT_TYPES" :key="t.code" :value="t.code">{{ t.label }}</option>
        </select>
      </div>
      <div>
        <label class="label">재직상태</label>
        <select v-model="status" class="input" :disabled="submitting">
          <option value="재직">재직</option>
          <option value="종료">종료</option>
        </select>
      </div>
    </div>

    <label class="label">소속회사 <span v-if="companyRequired" class="req">*</span></label>
    <select v-model="companySelect" class="input" :disabled="submitting">
      <option value="">{{ companyRequired ? '선택하세요' : '선택 안 함' }}</option>
      <option v-for="c in companies" :key="c.id" :value="c.id">{{ c.name }}</option>
      <option value="__new__">— 신규 회사 입력</option>
    </select>
    <input v-if="companySelect === '__new__'" v-model="newCompanyName" class="input new-company"
           type="text" placeholder="신규 회사명 (저장 시 기준정보 등록)" :disabled="submitting" />
    <p v-if="companyRequired" class="hint-line">외주 계열 인력은 소속회사가 필수입니다.</p>

    <div class="row2">
      <div>
        <label class="label">부서</label>
        <input v-model="department" class="input" type="text" placeholder="부서 (선택)" :disabled="submitting" />
      </div>
      <div>
        <label class="label">직급/직책</label>
        <input v-model="position" class="input" type="text" placeholder="직급/직책 (선택)" :disabled="submitting" />
      </div>
    </div>

    <div class="row2">
      <div>
        <label class="label">연락처</label>
        <input v-model="phone" class="input" type="text" placeholder="010-1234-5678" :disabled="submitting" />
      </div>
      <div>
        <label class="label">이메일</label>
        <input v-model="email" class="input" type="email" placeholder="name@company.com" :disabled="submitting" />
      </div>
    </div>

    <div v-if="error" class="err">{{ error }}</div>

    <template #footer>
      <button class="btn btn-sm" type="button" :disabled="submitting" @click="emit('close')">취소</button>
      <button class="btn btn-primary btn-sm" type="button" :disabled="submitting || !name.trim()" @click="submit">
        {{ submitting ? '저장 중…' : (isEdit ? '저장' : '등록') }}
      </button>
    </template>
  </ModalShell>

</template>

<style scoped>
.label { font-size: 13px; color: var(--muted); }
.req { color: var(--red); }
.hint { color: var(--muted); font-weight: 400; font-size: 11.5px; }
.input {
  background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); font-size: 14px; padding: 8px 10px; outline: none;
  font-family: inherit; width: 100%; box-sizing: border-box;
}
.input:focus { border-color: var(--accent); }
.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.row2 > div { display: flex; flex-direction: column; gap: 4px; }
.hint-line { font-size: 12.5px; color: var(--muted); margin: 4px 0 0; }
.new-company { margin-top: 6px; }
.err { color: var(--red); font-size: 13px; }
</style>
