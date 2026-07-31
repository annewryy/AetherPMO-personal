<script setup lang="ts">
// 0039 — 컨소시엄 구성원 등록/수정 폼.
//   역할은 주사업자·부사업자·협력사 3종. 지분율 합계 100% 검증은 목록 화면에서 안내한다
//   (한 건씩 추가하는 도중에는 100%가 될 수 없으므로 저장 자체는 막지 않는다).
import { ref, computed } from 'vue';
import { dataClient } from '../lib/dataClient';
import type { ConsortiumMember, ConsortiumPayload } from '../types';
import ModalShell from './ModalShell.vue';

const props = defineProps<{
  projectId: number;
  member?: ConsortiumMember | null;   // 있으면 수정 모드
  /** 저장 후 합계가 얼마가 되는지 미리 알려주기 위한 현재 합계(본인 제외분) */
  othersTotal: number;
}>();
const emit = defineEmits<{ (e: 'saved', payload: ConsortiumPayload): void; (e: 'close'): void }>();

const ROLES = ['주사업자', '부사업자', '협력사'];

const isEdit = computed(() => !!props.member);
const companyName = ref(props.member?.companyName ?? '');
const role = ref(props.member?.role && ROLES.includes(props.member.role) ? props.member.role : '주사업자');
const shareRate = ref<number | null>(props.member?.shareRate ?? null);
// 0044 §B — 총 투입 공수(M/M). 입찰에서 지정하고 수행 단계가 승계·관리한다.
const totalMm = ref<number | null>(props.member?.totalMm ?? null);
const contactName = ref(props.member?.contactName ?? '');
const contactPhone = ref(props.member?.contactPhone ?? '');
const contactEmail = ref(props.member?.contactEmail ?? '');
const description = ref(props.member?.description ?? '');
const submitting = ref(false);
const error = ref<string | null>(null);

// 저장 시 예상 합계 — 100%가 아니면 경고만(저장은 허용).
const projectedTotal = computed(() =>
  Math.round((props.othersTotal + (shareRate.value ?? 0)) * 100) / 100);

async function submit() {
  if (!companyName.value.trim()) { error.value = '회사명은 필수입니다.'; return; }
  if (shareRate.value == null) { error.value = '지분율은 필수입니다.'; return; }
  if (shareRate.value < 0 || shareRate.value > 100) { error.value = '지분율은 0~100 사이여야 합니다.'; return; }
  if (totalMm.value != null && totalMm.value < 0) { error.value = '총 M/M은 0 이상이어야 합니다.'; return; }
  submitting.value = true;
  error.value = null;
  const input = {
    companyName: companyName.value.trim(),
    role: role.value,
    shareRate: shareRate.value,
    totalMm: totalMm.value,
    description: description.value.trim() || null,
    contactName: contactName.value.trim() || null,
    contactPhone: contactPhone.value.trim() || null,
    contactEmail: contactEmail.value.trim() || null,
  };
  try {
    const payload = isEdit.value
      ? await dataClient.consortium.update(props.projectId, props.member!.id!, input)
      : await dataClient.consortium.create(props.projectId, input);
    emit('saved', payload);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <ModalShell :title="isEdit ? '컨소시엄 구성원 수정' : '컨소시엄 구성원 등록'" @close="emit('close')">
    <label class="label">회사명 <span class="req">*</span></label>
    <input v-model="companyName" class="input" type="text" placeholder="예: 오케스트로클라우드" :disabled="submitting" />

    <div class="row2">
      <div>
        <label class="label">역할 <span class="req">*</span></label>
        <select v-model="role" class="input" :disabled="submitting">
          <option v-for="r in ROLES" :key="r" :value="r">{{ r }}</option>
        </select>
      </div>
      <div>
        <label class="label">지분율 (%) <span class="req">*</span></label>
        <input v-model.number="shareRate" class="input" type="number" min="0" max="100" step="0.01"
               placeholder="예: 60" :disabled="submitting" />
      </div>
    </div>
    <p class="total" :class="{ warn: Math.abs(projectedTotal - 100) >= 0.005 }">
      저장 후 총 지분율: <b>{{ projectedTotal }}%</b>
      <template v-if="Math.abs(projectedTotal - 100) >= 0.005"> — 총합이 100%가 아닙니다.</template>
    </p>

    <label class="label">총 M/M (투입 공수)</label>
    <input v-model.number="totalMm" class="input" type="number" min="0" step="0.01"
           placeholder="예: 24 (선택 — 수행 전환 시 승계)" :disabled="submitting" />

    <div class="row2">
      <div>
        <label class="label">담당자</label>
        <input v-model="contactName" class="input" type="text" placeholder="예: 홍길동" :disabled="submitting" />
      </div>
      <div>
        <label class="label">연락처</label>
        <input v-model="contactPhone" class="input" type="text" placeholder="예: 010-1234-5678" :disabled="submitting" />
      </div>
    </div>

    <label class="label">이메일</label>
    <input v-model="contactEmail" class="input" type="email" placeholder="예: representative@company.com" :disabled="submitting" />

    <label class="label">비고</label>
    <input v-model="description" class="input" type="text" placeholder="특이사항 입력" :disabled="submitting" />

    <div v-if="error" class="err">{{ error }}</div>

    <template #footer>
      <button class="btn btn-sm" type="button" :disabled="submitting" @click="emit('close')">취소</button>
      <button class="btn btn-primary btn-sm" type="button"
              :disabled="submitting || !companyName.trim() || shareRate == null" @click="submit">
        {{ submitting ? '저장 중…' : '저장하기' }}
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
  font-family: inherit; width: 100%; box-sizing: border-box;
}
.input:focus { border-color: var(--accent); }
.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.row2 > div { display: flex; flex-direction: column; gap: 4px; }
.total { margin: 0; font-size: 12.5px; color: var(--muted); }
.total.warn { color: var(--yellow); }
.err { color: var(--red); font-size: 13px; }
</style>
