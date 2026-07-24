<script setup lang="ts">
// 0011 B-2 워크플로 전이 버튼 — 산출물(deliverables)·태스크(tasks) 공통.
//  - GET /transitions로 가용 전이를 받아 버튼으로 노출. allowed=false면 disabled + 사유 툴팁.
//  - 클릭 → CommentModal(COMMENT_REQUIRED이면 필수 검증) → POST /transition → changed 이벤트.
//  - 폴백(API_BASE 없음)에선 목록이 비어 "백엔드 연결 후 활성화" 안내만 노출(쓰기 게이트).
//  - 오류는 서버 {message} 그대로 표시(dataClient.apiSend가 던진 메시지).
import { ref, computed, watch } from 'vue';
import { dataClient } from '../lib/dataClient';
import type { AvailableTransition, TransitionEntity } from '../types';
import CommentModal from './CommentModal.vue';

const props = defineProps<{
  entity: TransitionEntity;   // 'deliverables' | 'tasks'
  entityId: number;
  // 현재 상태(툴팁·안내용, 표시만) — 갱신은 changed 이벤트로 부모가 재조회
  currentStatus?: string;
}>();

const emit = defineEmits<{ (e: 'changed', toStatus: string): void }>();

const apiMode = computed(() => !!window.API_BASE);

const transitions = ref<AvailableTransition[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);

async function load() {
  if (!apiMode.value) { transitions.value = []; return; }
  loading.value = true;
  loadError.value = null;
  try {
    transitions.value = await dataClient.transitions.list(props.entity, props.entityId);
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

watch(() => [props.entity, props.entityId], load, { immediate: true });

// ---- 전이 실행(코멘트 모달) --------------------------------------------------
const active = ref<AvailableTransition | null>(null);
const submitting = ref(false);
const submitError = ref<string | null>(null);

function openModal(t: AvailableTransition) {
  if (!t.allowed) return;
  active.value = t;
  submitError.value = null;
}

function tooltip(t: AvailableTransition): string {
  if (t.allowed) return `${t.toStatus}(으)로 전이`;
  const reasons = t.failedConditions.map((f) => f.errorMessage).filter(Boolean);
  return reasons.length ? `전이 불가: ${reasons.join(' · ')}` : '전이 조건을 충족하지 않았습니다.';
}

async function submit(comment: string) {
  if (!active.value) return;
  submitting.value = true;
  submitError.value = null;
  try {
    const res = await dataClient.transitions.execute(
      props.entity, props.entityId, active.value.transitionId, comment,
    );
    const to = res.status;
    active.value = null;
    emit('changed', to);
    await load();
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : String(e);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="tb">
    <span v-if="!apiMode" class="gate" title="쓰기는 백엔드(API_BASE) 연결 후 가능합니다">
      전이는 백엔드 연결 후 활성화
    </span>
    <template v-else>
      <span v-if="loading" class="dim">전이 확인 중…</span>
      <span v-else-if="loadError" class="err">{{ loadError }}</span>
      <span v-else-if="transitions.length === 0" class="dim">가용 전이 없음</span>
      <template v-else>
        <button
          v-for="t in transitions" :key="t.transitionId"
          class="btn btn-sm" :class="{ 'is-req': t.commentRequired }"
          :disabled="!t.allowed"
          :title="tooltip(t)"
          @click="openModal(t)"
        >{{ t.name || t.toStatus }}</button>
      </template>
    </template>

    <CommentModal
      v-if="active"
      :title="`전이: ${active.name || active.toStatus}`"
      :message="`${currentStatus ? currentStatus + ' → ' : ''}${active.toStatus} 전이를 실행합니다.`"
      :required="!!active.commentRequired"
      submit-label="전이 실행"
      :submitting="submitting"
      :error="submitError"
      @submit="submit"
      @close="active = null"
    />
  </div>
</template>

<style scoped>
.tb { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.gate, .dim { font-size: 12px; color: var(--muted); }
.err { font-size: 12px; color: var(--red); }
.is-req { border-color: var(--yellow); }
</style>
