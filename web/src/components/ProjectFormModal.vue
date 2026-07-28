<script setup lang="ts">
// 배치18 — 프로젝트 생성/수정 폼 모달 (일반 생성, 나라장터 마법사 아님).
//  - mode='create': POST /api/projects (필수 name). 미지정 필드는 백엔드 기본값
//    (stage=BIDDING, status=입찰, bidStatus=제안준비중) + 발번(-B) 자동.
//  - mode='edit'  : PATCH /api/projects/{id} — 현재값 프리필 후 변경분만 부분수정.
//    불변 필드(projectCode·sourceProjectId·clientCompanyId 등)는 폼에 없음(백엔드가 400).
//  - 쓰기는 백엔드 전용(dataClient가 API_BASE 게이트). 오류는 서버 {message} 그대로.
//  - status는 응답이 영문(In Progress 등) → 편집 프리필 시 한글로 역매핑(백엔드는 한글 저장).
import { ref, computed } from 'vue';
import { dataClient } from '../lib/dataClient';
import type { Project, ProjectCreateInput, ProjectUpdateInput } from '../types';
import ModalShell from './ModalShell.vue';
import OrgPersonField from './OrgPersonField.vue';

const props = defineProps<{
  mode: 'create' | 'edit';
  project?: Project;   // edit 모드 프리필 대상(필수)
}>();
const emit = defineEmits<{
  (e: 'saved', project: Project): void;
  (e: 'close'): void;
}>();

// 백엔드 enum(한글 저장값) — ProjectCreateService/ProjectUpdateService와 동일.
const STATUSES = ['입찰', '진행중', '지연', '보류', '완료'];
const BID_STATUSES = ['제안준비중', '제안제출', '결과대기', '수주', '실패'];
const STAGES: { value: 'BIDDING' | 'EXECUTION' | 'COMPLETED'; label: string }[] = [
  { value: 'BIDDING', label: '입찰' },
  { value: 'EXECUTION', label: '수행' },
  { value: 'COMPLETED', label: '완료' },
];

// 0039 요청 2 — 수행단계 프로젝트 편집 시: 단계는 수행/완료만(입찰로 되돌릴 수 없음),
//   상태는 진행중/종료(=완료)만, 입찰상태 필드는 숨김. 기존 데이터가 이 범위 밖(지연·보류 등)
//   이면 목록 밖 값도 그대로 노출해 무음 변경을 막는다.
const isExecutionEdit = computed(() => props.mode === 'edit' && props.project?.stage === 'EXECUTION');
const EXEC_STAGES = STAGES.filter((s) => s.value !== 'BIDDING');
const EXEC_STATUS_OPTIONS = [{ value: '진행중', label: '진행중' }, { value: '완료', label: '종료' }];
const stageOptions = computed(() => (isExecutionEdit.value ? EXEC_STAGES : STAGES));
const statusOptions = computed<{ value: string; label: string }[]>(() => {
  if (!isExecutionEdit.value) return STATUSES.map((s) => ({ value: s, label: s }));
  const base = [...EXEC_STATUS_OPTIONS];
  if (status.value && !base.some((o) => o.value === status.value)) base.push({ value: status.value, label: status.value });
  return base;
});

// 응답 status(영문) → 저장 한글값 역매핑(ProjectMapper.STATUS_KO2EN 역). 알 수 없으면 그대로.
const STATUS_EN2KO: Record<string, string> = {
  Bidding: '입찰', 'In Progress': '진행중', Delay: '지연', 'On Hold': '보류', Completed: '완료',
};
function normalizeStatus(v: string | null | undefined): string {
  if (!v) return '';
  return STATUS_EN2KO[v] ?? (STATUSES.includes(v) ? v : '');
}

const p = props.project;
// 폼 상태 — edit면 현재값 프리필, create면 빈값(백엔드 기본값에 위임).
const name = ref(p?.name ?? '');
const customerName = ref(p?.customerName ?? '');
const businessType = ref(p?.businessType ?? '');
const dept = ref(p?.dept ?? '');
const location = ref(p?.location ?? '');
const pmName = ref(p?.manager ?? '');
const budget = ref<number | null>(p?.budget ?? null);
const contractAmount = ref<number | null>(p?.projectBudget ?? null);
const stage = ref<'BIDDING' | 'EXECUTION' | 'COMPLETED' | ''>(p?.stage ?? '');
const status = ref(normalizeStatus(p?.status));
const bidStatus = ref(p?.bidStatus && BID_STATUSES.includes(p.bidStatus) ? p.bidStatus : '');
const plannedStartDate = ref(p?.startDate ? String(p.startDate).split('T')[0] : '');
const plannedEndDate = ref(p?.endDate ? String(p.endDate).split('T')[0] : '');
const announcementNo = ref(p?.announcementNo ?? '');
// 0031 — 담당조직 6종(유경님 생성 폼 파리티). OrgPersonField(직접 입력+조직도 선택).
const salesOwner = ref(p?.salesOwner ?? '');
const proposalOwner = ref(p?.proposalOwner ?? '');
const proposalPm = ref(p?.proposalPm ?? '');
const businessManager = ref(p?.businessManager ?? '');
const contractOwner = ref(p?.contractOwner ?? '');
const legalOwner = ref(p?.legalOwner ?? '');
const description = ref(p?.desc ?? '');
const remarks = ref(p?.remarks ?? '');

const submitting = ref(false);
const error = ref<string | null>(null);

// 0039 요청 1 — 금액 입력 천단위 구분기호. 표시는 콤마 포함 문자열, 내부값은 숫자로 유지.
function fmtMoney(v: number | null): string {
  return v == null ? '' : v.toLocaleString('ko-KR');
}
function parseMoney(s: string): number | null {
  const digits = s.replace(/[^0-9]/g, '');
  return digits ? Number(digits) : null;
}
const budgetText = computed({
  get: () => fmtMoney(budget.value),
  set: (v: string) => { budget.value = parseMoney(v); },
});
const contractAmountText = computed({
  get: () => fmtMoney(contractAmount.value),
  set: (v: string) => { contractAmount.value = parseMoney(v); },
});

// create: 채워진 필드만 실어 보낸다(빈 문자열/미지정은 백엔드 기본값에 위임).
function buildCreate(): ProjectCreateInput {
  const input: ProjectCreateInput = { name: name.value.trim() };
  const s = (v: string) => v.trim() || undefined;
  if (s(customerName.value)) input.customerName = s(customerName.value);
  if (s(businessType.value)) input.businessType = s(businessType.value);
  if (s(dept.value)) input.dept = s(dept.value);
  if (s(location.value)) input.location = s(location.value);
  if (s(pmName.value)) input.pmName = s(pmName.value);
  if (budget.value != null) input.budget = budget.value;
  if (contractAmount.value != null) input.contractAmount = contractAmount.value;
  if (stage.value) input.stage = stage.value;
  if (status.value) input.status = status.value;
  if (bidStatus.value) input.bidStatus = bidStatus.value;
  if (s(plannedStartDate.value)) input.plannedStartDate = s(plannedStartDate.value);
  if (s(plannedEndDate.value)) input.plannedEndDate = s(plannedEndDate.value);
  if (s(announcementNo.value)) input.announcementNo = s(announcementNo.value);
  if (s(salesOwner.value)) input.salesOwner = s(salesOwner.value);
  if (s(proposalOwner.value)) input.proposalOwner = s(proposalOwner.value);
  if (s(proposalPm.value)) input.proposalPm = s(proposalPm.value);
  if (s(businessManager.value)) input.businessManager = s(businessManager.value);
  if (s(contractOwner.value)) input.contractOwner = s(contractOwner.value);
  if (s(legalOwner.value)) input.legalOwner = s(legalOwner.value);
  if (s(description.value)) input.description = s(description.value);
  if (s(remarks.value)) input.remarks = s(remarks.value);
  return input;
}

// edit: 변경된 필드만 부분수정으로 보낸다(원본과 비교 — 불필요 키 전송/무의미 갱신 방지).
function buildPatch(): ProjectUpdateInput {
  const patch: ProjectUpdateInput = {};
  const orig = props.project!;
  const t = (v: string) => v.trim();
  if (t(name.value) !== (orig.name ?? '')) patch.name = t(name.value);
  if (t(customerName.value) !== (orig.customerName ?? '')) patch.customerName = t(customerName.value);
  if (t(businessType.value) !== (orig.businessType ?? '')) patch.businessType = t(businessType.value);
  if (t(dept.value) !== (orig.dept ?? '')) patch.dept = t(dept.value);
  if (t(location.value) !== (orig.location ?? '')) patch.location = t(location.value);
  if (t(pmName.value) !== (orig.manager ?? '')) patch.pmName = t(pmName.value);
  if ((budget.value ?? 0) !== (orig.budget ?? 0)) patch.budget = budget.value ?? 0;
  if ((contractAmount.value ?? 0) !== (orig.projectBudget ?? 0)) patch.contractAmount = contractAmount.value ?? 0;
  if (stage.value && stage.value !== orig.stage) patch.stage = stage.value;
  if (status.value && status.value !== normalizeStatus(orig.status)) patch.status = status.value;
  if (bidStatus.value !== (orig.bidStatus && BID_STATUSES.includes(orig.bidStatus) ? orig.bidStatus : '')) {
    if (bidStatus.value) patch.bidStatus = bidStatus.value;
  }
  const origStart = orig.startDate ? String(orig.startDate).split('T')[0] : '';
  const origEnd = orig.endDate ? String(orig.endDate).split('T')[0] : '';
  if (t(plannedStartDate.value) !== origStart) patch.plannedStartDate = t(plannedStartDate.value);
  if (t(plannedEndDate.value) !== origEnd) patch.plannedEndDate = t(plannedEndDate.value);
  if (t(announcementNo.value) !== (orig.announcementNo ?? '')) patch.announcementNo = t(announcementNo.value);
  if (t(salesOwner.value) !== (orig.salesOwner ?? '')) patch.salesOwner = t(salesOwner.value);
  if (t(proposalOwner.value) !== (orig.proposalOwner ?? '')) patch.proposalOwner = t(proposalOwner.value);
  if (t(proposalPm.value) !== (orig.proposalPm ?? '')) patch.proposalPm = t(proposalPm.value);
  if (t(businessManager.value) !== (orig.businessManager ?? '')) patch.businessManager = t(businessManager.value);
  if (t(contractOwner.value) !== (orig.contractOwner ?? '')) patch.contractOwner = t(contractOwner.value);
  if (t(legalOwner.value) !== (orig.legalOwner ?? '')) patch.legalOwner = t(legalOwner.value);
  if (t(description.value) !== (orig.desc ?? '')) patch.description = t(description.value);
  if (t(remarks.value) !== (orig.remarks ?? '')) patch.remarks = t(remarks.value);
  return patch;
}

async function submit() {
  if (!name.value.trim()) { error.value = '사업명은 필수입니다.'; return; }
  submitting.value = true;
  error.value = null;
  try {
    let result: Project;
    if (props.mode === 'create') {
      result = await dataClient.projects.create(buildCreate());
    } else {
      const patch = buildPatch();
      if (Object.keys(patch).length === 0) { error.value = '변경된 항목이 없습니다.'; submitting.value = false; return; }
      result = await dataClient.projects.update(props.project!.id, patch);
    }
    emit('saved', result);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <ModalShell :title="mode === 'create' ? '신규 프로젝트' : '프로젝트 수정'" @close="emit('close')">
    <label class="label">사업명 <span class="req">*</span></label>
    <input v-model="name" class="input" type="text" placeholder="사업명" :disabled="submitting" />

    <div class="row2">
      <div>
        <label class="label">고객사</label>
        <input v-model="customerName" class="input" type="text" placeholder="고객사명" :disabled="submitting" />
      </div>
      <div>
        <label class="label">사업유형</label>
        <input v-model="businessType" class="input" type="text" placeholder="예: SI, 유지보수" :disabled="submitting" />
      </div>
    </div>

    <div class="row2">
      <div>
        <label class="label">수행부서</label>
        <input v-model="dept" class="input" type="text" placeholder="부서" :disabled="submitting" />
      </div>
      <div>
        <label class="label">수행장소</label>
        <input v-model="location" class="input" type="text" placeholder="예: 서울" :disabled="submitting" />
      </div>
    </div>

    <label class="label">PM</label>
    <OrgPersonField v-model="pmName" placeholder="PM 이름" :disabled="submitting" title="PM 선택" />

    <div class="row2">
      <div>
        <label class="label">예산(원)</label>
        <input v-model="budgetText" class="input" type="text" inputmode="numeric" placeholder="0" :disabled="submitting" />
      </div>
      <div>
        <label class="label">계약금액(원)</label>
        <input v-model="contractAmountText" class="input" type="text" inputmode="numeric" placeholder="0" :disabled="submitting" />
      </div>
    </div>

    <div class="row2">
      <div>
        <label class="label">단계</label>
        <select v-model="stage" class="input" :disabled="submitting">
          <option value="">{{ mode === 'create' ? '기본(입찰)' : '변경 안 함' }}</option>
          <option v-for="s in stageOptions" :key="s.value" :value="s.value">{{ s.label }}</option>
        </select>
      </div>
      <div>
        <label class="label">상태</label>
        <select v-model="status" class="input" :disabled="submitting">
          <option value="">{{ mode === 'create' ? '기본(입찰)' : '변경 안 함' }}</option>
          <option v-for="s in statusOptions" :key="s.value" :value="s.value">{{ s.label }}</option>
        </select>
      </div>
    </div>

    <template v-if="!isExecutionEdit">
      <label class="label">입찰상태</label>
      <select v-model="bidStatus" class="input" :disabled="submitting">
        <option value="">{{ mode === 'create' ? '기본(제안준비중)' : '변경 안 함' }}</option>
        <option v-for="s in BID_STATUSES" :key="s" :value="s">{{ s }}</option>
      </select>
    </template>

    <div class="row2">
      <div>
        <label class="label">계획 시작일</label>
        <input v-model="plannedStartDate" class="input" type="date" :disabled="submitting" />
      </div>
      <div>
        <label class="label">계획 종료일</label>
        <input v-model="plannedEndDate" class="input" type="date" :disabled="submitting" />
      </div>
    </div>

    <!-- 0031 — 담당조직 지정(유경님 생성 폼 파리티) -->
    <div class="owners-head">담당조직 지정 <span class="owners-sub">(선택 — 상세 개요에서 수정 가능)</span></div>
    <div class="row2">
      <div>
        <label class="label">영업 담당자</label>
        <OrgPersonField v-model="salesOwner" placeholder="영업 담당자" :disabled="submitting" title="영업 담당자 선택" />
      </div>
      <div>
        <label class="label">제안전략팀 담당자</label>
        <OrgPersonField v-model="proposalOwner" placeholder="제안전략팀 담당자" :disabled="submitting" title="제안전략팀 담당자 선택" />
      </div>
    </div>
    <div class="row2">
      <div>
        <label class="label">제안PM</label>
        <OrgPersonField v-model="proposalPm" placeholder="제안PM" :disabled="submitting" title="제안PM 선택" />
      </div>
      <div>
        <label class="label">사업관리 담당자</label>
        <OrgPersonField v-model="businessManager" placeholder="사업관리 담당자" :disabled="submitting" title="사업관리 담당자 선택" />
      </div>
    </div>
    <div class="row2">
      <div>
        <label class="label">계약 담당자</label>
        <OrgPersonField v-model="contractOwner" placeholder="계약 담당자" :disabled="submitting" title="계약 담당자 선택" />
      </div>
      <div>
        <label class="label">법무 담당자</label>
        <OrgPersonField v-model="legalOwner" placeholder="법무 담당자" :disabled="submitting" title="법무 담당자 선택" />
      </div>
    </div>

    <label class="label">공고번호</label>
    <input v-model="announcementNo" class="input" type="text" placeholder="나라장터 공고번호 (선택)" :disabled="submitting" />

    <label class="label">설명</label>
    <textarea v-model="description" class="input" rows="2" placeholder="사업 설명 (선택)" :disabled="submitting" />

    <label class="label">비고</label>
    <textarea v-model="remarks" class="input" rows="2" placeholder="비고 (선택)" :disabled="submitting" />

    <div v-if="error" class="err">{{ error }}</div>

    <template #footer>
      <button class="btn btn-sm" type="button" :disabled="submitting" @click="emit('close')">취소</button>
      <button
        class="btn btn-primary btn-sm" type="button"
        :disabled="submitting || !name.trim()" @click="submit"
      >
        {{ submitting ? '저장 중…' : (mode === 'create' ? '생성' : '저장') }}
      </button>
    </template>
  </ModalShell>
</template>

<style scoped>
.label { font-size: 13px; color: var(--muted); }
.req { color: var(--red); }
.input {
  background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); font-size: 14px; padding: 8px 10px; outline: none;
  font-family: inherit; width: 100%; box-sizing: border-box; resize: vertical;
}
.input:focus { border-color: var(--accent); }
.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.row2 > div { display: flex; flex-direction: column; gap: 4px; }
.err { color: var(--red); font-size: 13px; }
.owners-head { font-size: 13px; font-weight: 700; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); }
.owners-sub { font-weight: 400; color: var(--muted); font-size: 11.5px; }
</style>
