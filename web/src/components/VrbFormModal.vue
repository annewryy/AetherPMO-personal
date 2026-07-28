<script setup lang="ts">
// 0039 — VRB(사업성 검토) 심의 정보 수정. 프로젝트당 1건이라 PUT upsert 한 번으로 저장한다.
import { ref } from 'vue';
import { dataClient } from '../lib/dataClient';
import type { VrbInfo } from '../types';
import ModalShell from './ModalShell.vue';

const props = defineProps<{ projectId: number; vrb?: VrbInfo | null }>();
const emit = defineEmits<{ (e: 'saved', vrb: VrbInfo): void; (e: 'close'): void }>();

const STATUSES = ['미상신', '상신예정', '상신완료', '승인', '반려'];

const dateOnly = (v: string | null | undefined) => (v ? String(v).split('T')[0] : '');

const status = ref(props.vrb?.status && STATUSES.includes(props.vrb.status) ? props.vrb.status : '미상신');
const vrbNumber = ref(props.vrb?.vrbNumber ?? '');
const plannedDate = ref(dateOnly(props.vrb?.plannedDate));
const submittedDate = ref(dateOnly(props.vrb?.submittedDate));
const approvedDate = ref(dateOnly(props.vrb?.approvedDate));
const memo = ref(props.vrb?.memo ?? '');
const submitting = ref(false);
const error = ref<string | null>(null);

async function submit() {
  submitting.value = true;
  error.value = null;
  try {
    const saved = await dataClient.vrb.save(props.projectId, {
      status: status.value,
      vrbNumber: vrbNumber.value.trim() || null,
      plannedDate: plannedDate.value || null,
      submittedDate: submittedDate.value || null,
      approvedDate: approvedDate.value || null,
      memo: memo.value.trim() || null,
    });
    emit('saved', saved);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <ModalShell title="VRB 정보 수정" @close="emit('close')">
    <div class="row2">
      <div>
        <label class="label">진행 상태</label>
        <select v-model="status" class="input" :disabled="submitting">
          <option v-for="s in STATUSES" :key="s" :value="s">{{ s }}</option>
        </select>
      </div>
      <div>
        <label class="label">심의번호</label>
        <input v-model="vrbNumber" class="input" type="text" placeholder="예: VRB-2026-0001" :disabled="submitting" />
      </div>
    </div>

    <div class="row2">
      <div>
        <label class="label">상신예정일</label>
        <input v-model="plannedDate" class="input" type="date" :disabled="submitting" />
      </div>
      <div>
        <label class="label">상신일</label>
        <input v-model="submittedDate" class="input" type="date" :disabled="submitting" />
      </div>
    </div>

    <label class="label">승인/반려일</label>
    <input v-model="approvedDate" class="input" type="date" :disabled="submitting" />

    <label class="label">심의 메모</label>
    <textarea v-model="memo" class="input" rows="3" placeholder="VRB 심의 안건 및 의견 메모를 입력하세요." :disabled="submitting" />

    <div v-if="error" class="err">{{ error }}</div>

    <template #footer>
      <button class="btn btn-sm" type="button" :disabled="submitting" @click="emit('close')">취소</button>
      <button class="btn btn-primary btn-sm" type="button" :disabled="submitting" @click="submit">
        {{ submitting ? '저장 중…' : '저장하기' }}
      </button>
    </template>
  </ModalShell>
</template>

<style scoped>
.label { font-size: 13px; color: var(--muted); }
.input {
  background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); font-size: 14px; padding: 8px 10px; outline: none;
  font-family: inherit; width: 100%; box-sizing: border-box; resize: vertical;
}
.input:focus { border-color: var(--accent); }
.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.row2 > div { display: flex; flex-direction: column; gap: 4px; }
.err { color: var(--red); font-size: 13px; }
</style>
