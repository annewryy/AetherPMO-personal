<script setup lang="ts">
// 배치21 — 참여인력 등록 폼 (POST /api/projects/:id/members).
//  - 필수 name + 선택 필드(구분·인력구분·소속·직급·부서·참여역할·PM여부).
//  - 백엔드가 pms_person에 find-or-insert 후 프로젝트에 연결(0005 §D).
//  - 쓰기는 백엔드 전용(dataClient가 API_BASE 게이트). 오류는 서버 {message} 그대로.
import { ref } from 'vue';
import { dataClient } from '../lib/dataClient';
import { EMPLOYMENT_TYPES } from '../lib/personLabels';
import type { ProjectMemberInput, ProjectMemberType, EmploymentType } from '../types';
import ModalShell from './ModalShell.vue';

const props = defineProps<{ projectId: number }>();
const emit = defineEmits<{ (e: 'created'): void; (e: 'close'): void }>();

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
  if (employmentType.value) input.employmentType = employmentType.value;
  if (company.value.trim()) input.company = company.value.trim();
  if (position.value.trim()) input.position = position.value.trim();
  if (department.value.trim()) input.department = department.value.trim();
  if (roleName.value.trim()) input.roleName = roleName.value.trim();
  if (participationRole.value) input.participationRole = participationRole.value;
  try {
    await dataClient.projectMembers.add(props.projectId, input);
    emit('created');
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <ModalShell title="참여인력 등록" @close="emit('close')">
    <label class="label">성명 <span class="req">*</span></label>
    <input v-model="name" class="input" type="text" placeholder="성명" :disabled="submitting" />

    <div class="row2">
      <div>
        <label class="label">구분</label>
        <select v-model="memberType" class="input" :disabled="submitting">
          <option value="INTERNAL">내부</option>
          <option value="EXTERNAL">외부</option>
        </select>
      </div>
      <div>
        <label class="label">인력구분</label>
        <select v-model="employmentType" class="input" :disabled="submitting">
          <option value="">선택 안 함</option>
          <option v-for="t in EMPLOYMENT_TYPES" :key="t.code" :value="t.code">{{ t.label }}</option>
        </select>
      </div>
    </div>

    <div class="row2">
      <div>
        <label class="label">소속</label>
        <input v-model="company" class="input" type="text" placeholder="소속 (선택)" :disabled="submitting" />
      </div>
      <div>
        <label class="label">직급</label>
        <input v-model="position" class="input" type="text" placeholder="직급 (선택)" :disabled="submitting" />
      </div>
    </div>

    <div class="row2">
      <div>
        <label class="label">부서</label>
        <input v-model="department" class="input" type="text" placeholder="부서 (선택)" :disabled="submitting" />
      </div>
      <div>
        <label class="label">참여역할</label>
        <select v-model="participationRole" class="input" :disabled="submitting">
          <option value="">선택 안 함</option>
          <option v-for="r in PARTICIPATION_ROLES" :key="r" :value="r">{{ r }}</option>
        </select>
      </div>
    </div>

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
        {{ submitting ? '등록 중…' : '등록' }}
      </button>
    </template>
  </ModalShell>
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
.chk { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; }
.err { color: var(--red); font-size: 12px; }
</style>
