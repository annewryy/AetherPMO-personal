<script setup lang="ts">
// 인력 상세 패널 (0014 B) — 기본 정보 + 프로젝트 참여 이력(시간순 테이블).
// 목록에서 인력 선택 시 우측 슬라이드 패널로 연다. 데이터는 dataClient.persons.
import { ref, computed, watch } from 'vue';
import { dataClient } from '../lib/dataClient';
import {
  employmentTypeLabel, sourceLabel, isInsourcingEligible, insourcingStatusLabel,
} from '../lib/personLabels';
import type { Person, PersonProjectHistory, InsourcingTransition } from '../types';

const props = defineProps<{
  // 목록 행이 넘겨준 값(즉시 표시). 상세/이력은 열릴 때 재조회로 최신화.
  person: Person;
}>();
// 'changed' — 자사화 반영 등으로 employment_type이 바뀌면 부모 목록 갱신 신호.
const emit = defineEmits<{ (e: 'close'): void; (e: 'changed'): void }>();

// 기본 정보: 목록 값으로 초기화하되, 상세 API로 갱신(내부 인력은 아마란스 동기화 최신값).
const detail = ref<Person>(props.person);
const history = ref<PersonProjectHistory[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);

const fmtDate = (v: string | null | undefined) => (v ? String(v).split('T')[0] : '—');
const dash = (v: string | null | undefined) => (v && String(v).trim() ? v : '—');

// 기간 표시: 계획 시작~종료(없으면 —)
function period(h: PersonProjectHistory): string {
  const s = fmtDate(h.startDate);
  const e = fmtDate(h.endDate);
  if (s === '—' && e === '—') return '—';
  return `${s} ~ ${e}`;
}

// --- 자사화 전환(0019) ---
const transition = ref<InsourcingTransition | null>(null);
const txBusy = ref(false);
const txError = ref<string | null>(null);
const showReason = ref(false);
const reason = ref('');

// 전환 대상 인력구분(계약직/외주/프리랜서)인가.
const eligible = computed(() => isInsourcingEligible(detail.value.employmentType));
// 전환 대상이거나 진행중 전환이 있을 때만 섹션 노출.
const showTransitionSection = computed(() => eligible.value || !!transition.value);

async function loadFor(id: number) {
  loading.value = true;
  loadError.value = null;
  try {
    const [d, hist, tx] = await Promise.all([
      dataClient.persons.get(id),
      dataClient.persons.projects(id),
      dataClient.insourcingTransitions.openForPerson(id),
    ]);
    if (d) detail.value = d;
    history.value = hist;
    transition.value = tx;
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

async function requestTransition() {
  txBusy.value = true;
  txError.value = null;
  try {
    transition.value = await dataClient.insourcingTransitions.request(
      detail.value.personId, reason.value.trim() || undefined);
    showReason.value = false;
    reason.value = '';
  } catch (e) {
    txError.value = e instanceof Error ? e.message : String(e);
  } finally {
    txBusy.value = false;
  }
}

async function actTransition(action: 'doc_sent' | 'approve' | 'reject' | 'cancel') {
  if (!transition.value) return;
  txBusy.value = true;
  txError.value = null;
  try {
    const updated = await dataClient.insourcingTransitions.act(transition.value.transitionId, action);
    if (action === 'approve') {
      // 자사화 반영됨 — 상세(태그) 재조회 + 부모 목록 갱신. 진행중 전환 없음 → 섹션 닫힘.
      await loadFor(detail.value.personId);
      emit('changed');
    } else if (action === 'reject' || action === 'cancel') {
      transition.value = null; // 종료 → 다시 요청 가능
    } else {
      transition.value = updated; // DOC_SENT
    }
  } catch (e) {
    txError.value = e instanceof Error ? e.message : String(e);
  } finally {
    txBusy.value = false;
  }
}

watch(
  () => props.person.personId,
  (id) => {
    detail.value = props.person;
    void loadFor(id);
  },
  { immediate: true },
);
</script>

<template>
  <div class="overlay" @click.self="$emit('close')">
    <aside class="panel">
      <header class="head">
        <div>
          <h2 class="pname">{{ detail.name }}</h2>
          <div class="ptags">
            <span class="tag">{{ employmentTypeLabel(detail.employmentType) }}</span>
            <span class="tag src">{{ sourceLabel(detail.source) }}</span>
            <span v-if="detail.amaranthEmpNo" class="tag emp">사번 {{ detail.amaranthEmpNo }}</span>
          </div>
        </div>
        <button class="x" @click="$emit('close')" aria-label="닫기">✕</button>
      </header>

      <!-- 기본 정보 (0014 B) -->
      <section class="info">
        <dl>
          <div><dt>소속회사</dt><dd>{{ dash(detail.companyName) }}</dd></div>
          <div><dt>부서</dt><dd>{{ dash(detail.department) }}</dd></div>
          <div><dt>직책</dt><dd>{{ dash(detail.position) }}</dd></div>
          <div><dt>재직상태</dt><dd>{{ dash(detail.status) }}</dd></div>
          <div><dt>연락처</dt><dd>{{ dash(detail.phone) }}</dd></div>
          <div><dt>이메일</dt><dd>{{ dash(detail.email) }}</dd></div>
        </dl>
      </section>

      <!-- 자사화 전환 (0019) — 비자사 인력 → 자사화. 공문 발신·승인은 아마란스 결재 위임. -->
      <section v-if="showTransitionSection" class="insourcing">
        <h3 class="sec-title">자사화 전환</h3>
        <div v-if="txError" class="notice err">{{ txError }}</div>

        <!-- 진행중/완료 전환이 있으면 상태·액션 -->
        <template v-if="transition">
          <div class="tx-status">
            <span class="tx-chip" :class="'tx-' + transition.status">{{ insourcingStatusLabel(transition.status) }}</span>
            <span class="tx-meta">{{ employmentTypeLabel(transition.fromType) }} → 자사화</span>
            <span v-if="transition.requestedAt" class="tx-meta">요청 {{ fmtDate(transition.requestedAt) }}</span>
          </div>
          <p v-if="transition.reason" class="tx-reason">사유: {{ transition.reason }}</p>
          <div class="tx-actions">
            <button
              v-if="transition.status === 'REQUESTED'"
              class="btn" :disabled="txBusy" @click="actTransition('doc_sent')"
            >공문 발신 표시</button>
            <button class="btn btn-primary" :disabled="txBusy" @click="actTransition('approve')">승인 처리(자사화 반영)</button>
            <button class="btn btn-danger" :disabled="txBusy" @click="actTransition('reject')">반려</button>
            <button class="btn" :disabled="txBusy" @click="actTransition('cancel')">취소</button>
          </div>
          <p class="tx-note">
            공문 발신·승인은 아마란스 결재 영역입니다 — 연동 전까지 로컬에서 처리하며,
            승인 시 인력구분이 즉시 <strong>자사화</strong>로 반영됩니다.
          </p>
        </template>

        <!-- 진행중 전환이 없으면 요청 -->
        <template v-else>
          <p class="tx-desc">
            현재 <strong>{{ employmentTypeLabel(detail.employmentType) }}</strong> 인력입니다.
            자사화 전환을 요청하면 공문 발신·승인 후 인력구분이 <strong>자사화</strong>로 변경됩니다.
          </p>
          <div v-if="showReason" class="tx-reason-input">
            <textarea v-model="reason" class="ta" rows="2" placeholder="전환 사유(선택)"></textarea>
          </div>
          <div class="tx-actions">
            <button v-if="!showReason" class="btn btn-primary" :disabled="txBusy" @click="showReason = true">자사화 전환 요청</button>
            <template v-else>
              <button class="btn btn-primary" :disabled="txBusy" @click="requestTransition">{{ txBusy ? '요청 중…' : '요청 제출' }}</button>
              <button class="btn" :disabled="txBusy" @click="showReason = false">닫기</button>
            </template>
          </div>
        </template>
      </section>

      <!-- 프로젝트 참여 이력 (0014 B — 시간순) -->
      <section class="history">
        <h3 class="sec-title">프로젝트 참여 이력</h3>

        <div v-if="loading" class="notice">불러오는 중…</div>
        <div v-else-if="loadError" class="notice">
          이력을 불러오지 못했습니다. <span class="detail">({{ loadError }})</span>
        </div>
        <div v-else-if="history.length === 0" class="notice">
          참여한 프로젝트 이력이 없습니다.
        </div>
        <table v-else class="grid">
          <thead>
            <tr>
              <th>프로젝트명</th><th>기간</th><th>고객사</th>
              <th>역할</th><th>수행장소</th><th>상태</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="h in history" :key="h.projectId + ':' + (h.memberStartDate ?? '')">
              <td class="name">
                <RouterLink :to="`/projects/${h.projectId}`" class="proj-link" @click.stop>
                  {{ h.projectName || `#${h.projectId}` }}
                </RouterLink>
                <span v-if="h.isProjectManager" class="pm-badge" title="프로젝트 매니저">PM</span>
                <span v-if="h.isActive" class="active-badge" title="현재 투입 중">활성</span>
              </td>
              <td class="muted">{{ period(h) }}</td>
              <td>{{ dash(h.customerName) }}</td>
              <td>{{ dash(h.roleName || h.role) }}</td>
              <td>{{ dash(h.location) }}</td>
              <td>{{ dash(h.status) }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </aside>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed; inset: 0; z-index: 40;
  background: rgba(0, 0, 0, 0.35);
  display: flex; justify-content: flex-end;
}
.panel {
  width: 720px; max-width: 92vw; height: 100%;
  background: var(--bg, var(--panel)); border-left: 1px solid var(--border);
  box-shadow: -8px 0 24px rgba(0, 0, 0, 0.25);
  overflow-y: auto; padding: 22px 26px; box-sizing: border-box;
}
.head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; }
.pname { font-size: 19px; margin: 0 0 8px; }
.ptags { display: flex; flex-wrap: wrap; gap: 6px; }
.tag {
  font-size: 11px; padding: 2px 9px; border-radius: 999px;
  background: var(--panel-2); color: var(--muted); border: 1px solid var(--border);
}
.tag.src { color: var(--text); }
.tag.emp { font-family: ui-monospace, monospace; }
.x {
  border: 0; background: transparent; color: var(--muted);
  font-size: 15px; cursor: pointer; padding: 4px 8px; border-radius: 6px;
}
.x:hover { background: var(--panel-2); color: var(--text); }

.info { margin-bottom: 24px; }
.info dl { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 24px; margin: 0; }
.info dt { color: var(--muted); font-size: 11px; margin-bottom: 2px; }
.info dd { margin: 0; font-size: 13px; }

.sec-title { font-size: 14px; margin: 0 0 12px; }

/* 자사화 전환 섹션 */
.insourcing {
  margin-bottom: 24px; padding: 14px 16px;
  border: 1px solid var(--border); border-radius: 10px; background: var(--panel);
}
.tx-status { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
.tx-chip {
  font-size: 12px; font-weight: 700; padding: 2px 10px; border-radius: 999px;
  background: var(--panel-2); color: var(--muted); border: 1px solid var(--border);
}
.tx-REQUESTED { color: var(--blue); border-color: var(--blue); background: rgba(59, 130, 246, 0.12); }
.tx-DOC_SENT { color: var(--yellow); border-color: var(--yellow); background: rgba(251, 191, 36, 0.12); }
.tx-APPROVED { color: var(--green); border-color: var(--green); background: rgba(52, 211, 153, 0.12); }
.tx-REJECTED, .tx-CANCELED { color: var(--red); border-color: var(--red); background: rgba(239, 68, 68, 0.1); }
.tx-meta { font-size: 12px; color: var(--muted); }
.tx-reason { font-size: 12.5px; margin: 4px 0 10px; }
.tx-desc { font-size: 13px; margin: 0 0 12px; color: var(--text); }
.tx-note { font-size: 11.5px; color: var(--muted); margin: 10px 0 0; line-height: 1.5; }
.tx-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.tx-reason-input { margin-bottom: 10px; }
.ta {
  width: 100%; box-sizing: border-box; resize: vertical;
  background: var(--panel-2, var(--panel)); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); font-size: 13px; padding: 8px 10px; outline: none;
}
.ta:focus { border-color: var(--accent); }
.btn {
  border: 1px solid var(--border); background: var(--panel-2, var(--panel)); color: var(--text);
  font-size: 12.5px; font-weight: 600; padding: 6px 12px; border-radius: 8px; cursor: pointer;
}
.btn:hover:not(:disabled) { border-color: var(--accent); }
.btn:disabled { opacity: 0.55; cursor: default; }
.btn-primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.btn-danger { color: var(--red); border-color: var(--red); background: transparent; }
.notice.err { color: var(--red); border-color: var(--red); background: rgba(239, 68, 68, 0.08); margin-bottom: 10px; }

.notice {
  padding: 14px; border-radius: 8px;
  background: var(--panel); border: 1px solid var(--border); color: var(--muted); font-size: 13px;
}
.notice .detail { opacity: 0.7; }

.grid { border-collapse: collapse; width: 100%; font-size: 12.5px; }
.grid th, .grid td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); }
.grid th { color: var(--muted); font-weight: 600; font-size: 11.5px; }
.name { font-weight: 600; }
.muted { color: var(--muted); }
.proj-link { font-weight: 600; }
.pm-badge {
  font-size: 10px; font-weight: 600; color: var(--accent);
  border: 1px solid var(--accent); border-radius: 999px; padding: 0 6px; margin-left: 6px;
}
.active-badge {
  font-size: 10px; font-weight: 600; color: var(--blue, var(--accent));
  border: 1px solid var(--blue, var(--accent)); border-radius: 999px; padding: 0 6px; margin-left: 6px;
}
</style>
