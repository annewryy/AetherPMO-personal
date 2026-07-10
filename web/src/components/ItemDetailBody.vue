<script setup lang="ts">
// 배치23 B안 — 공용 아이템 상세 본문(드로어·상세 페이지 공용).
// DetailPanel(우측 드로어)에서 알맹이를 추출한 것 — 중복 구현 금지, 두 곳이 이 본문을 재사용한다.
//  - 헤더: kind 칩 + displayCode + 제목 + 현재 상태 뱃지
//  - 필드: 도메인별 세트, 인라인 PATCH(쓰기 게이트)
//  - 상태 전이: 이슈/액션=상태 사다리(사유 코멘트 모달) / 산출물·태스크=워크플로 엔진(TransitionButtons)
//  - 첨부: 아마란스 위임 stub / 하단: 코멘트 스레드
// 쓰기는 전부 백엔드(API_BASE) 전용. 폴백에선 편집 컨트롤 비활성 + 안내. 오류는 서버 {message} 그대로.
// 드로어의 닫기(✕) 버튼·aside 래퍼는 이 본문에 없다(호출측 chrome). 필드/상태 변경 후 'changed' emit.
import { ref, computed } from 'vue';
import { dataClient } from '../lib/dataClient';
import { stub } from '../lib/stub';
import { fullDisplayCode } from '../lib/displayCode';
import type {
  Issue, ActionItem, Artifact, Task, CommentEntityType, TransitionEntity,
} from '../types';
import StatusBadge from './StatusBadge.vue';
import CommentThread from './CommentThread.vue';
import TransitionButtons from './TransitionButtons.vue';
import CommentModal from './CommentModal.vue';

// 도메인별 대상(하나만 채워짐). kind로 분기.
export type DetailKind = 'issue' | 'action' | 'artifact' | 'task';

const props = defineProps<{
  kind: DetailKind;
  issue?: Issue | null;
  action?: ActionItem | null;
  artifact?: Artifact | null;
  task?: Task | null;
  projectId: number;
  projectCode?: string | null;       // 전역 문맥(프로젝트 밖)에서 코드 조합 렌더
  highlightCommentId?: number | null; // 알림 클릭 시 코멘트 강조
}>();

const emit = defineEmits<{
  (e: 'changed'): void;              // 필드/상태 변경 후 부모 재조회 신호
}>();

const apiMode = computed(() => !!window.API_BASE);

const COMMENT_TYPE: Record<DetailKind, CommentEntityType> = {
  issue: 'ISSUE', action: 'ACTION_ITEM', artifact: 'DELIVERABLE', task: 'TASK',
};
const KIND_LABEL: Record<DetailKind, string> = {
  issue: '이슈/리스크', action: '액션아이템', artifact: '산출물', task: '태스크',
};

// 현재 대상 id·제목·상태·표시코드 (kind로 안전 접근)
const entityId = computed(() => {
  switch (props.kind) {
    case 'issue': return props.issue?.id ?? null;
    case 'action': return props.action?.id ?? null;
    case 'artifact': return props.artifact?.id ?? null;
    case 'task': return props.task?.id ?? null;
  }
});
const heading = computed(() => {
  switch (props.kind) {
    case 'issue': return props.issue?.title ?? '';
    case 'action': return props.action?.title ?? '';
    case 'artifact': return props.artifact?.name ?? '';
    case 'task': return props.task?.name ?? '';
  }
});
const status = computed(() => {
  switch (props.kind) {
    case 'issue': return props.issue?.status ?? '';
    case 'action': return props.action?.status ?? '';
    case 'artifact': return props.artifact?.status ?? '';
    case 'task': return props.task?.status ?? '';
  }
});
const displayCode = computed(() => {
  const dc = props.kind === 'issue' ? props.issue?.displayCode
    : props.kind === 'action' ? props.action?.displayCode
    : props.kind === 'artifact' ? props.artifact?.displayCode
    : props.task?.displayCode;
  return fullDisplayCode(props.projectCode, dc);
});

// 태스크/산출물은 워크플로 엔진 전이 사용(TransitionButtons)
const transitionEntity = computed<TransitionEntity | null>(() =>
  props.kind === 'task' ? 'tasks' : props.kind === 'artifact' ? 'deliverables' : null,
);

// 이슈/액션 상태 사다리(가능한 전이만) — 백엔드 계약(발생→조치중→완료, 완료→조치중 재오픈).
const ISSUE_LADDER: Record<string, string[]> = {
  '발생': ['조치중'],
  '조치중': ['완료'],
  '완료': ['조치중'],   // 재오픈
};
const ACTION_LADDER: Record<string, string[]> = {
  '대기': ['진행'],
  '진행': ['완료'],
  '완료': ['진행'],     // 재오픈
};
const ladderTargets = computed<string[]>(() => {
  if (props.kind === 'issue') return ISSUE_LADDER[status.value] ?? [];
  if (props.kind === 'action') return ACTION_LADDER[status.value] ?? [];
  return [];
});

// ---- 필드 인라인 PATCH -------------------------------------------------------
const savingField = ref<string | null>(null);
const fieldError = ref<string | null>(null);

async function patch(patchBody: Record<string, unknown>, fieldKey: string) {
  const id = entityId.value;
  if (id == null) return;
  savingField.value = fieldKey;
  fieldError.value = null;
  try {
    if (props.kind === 'issue') await dataClient.issues.update(id, patchBody);
    else if (props.kind === 'action') await dataClient.actionItems.update(id, patchBody);
    else if (props.kind === 'task') await dataClient.tasks.update(id, patchBody);
    // 산출물은 상태 외 필드 인라인 편집 대상 없음(현 계약) — 상태는 전이로 처리
    emit('changed');
  } catch (e) {
    fieldError.value = e instanceof Error ? e.message : String(e);
  } finally {
    savingField.value = null;
  }
}

// due_date (이슈=목표해결일 / 액션=마감일)
function onDueDate(ev: Event) {
  const v = (ev.target as HTMLInputElement).value || null;
  patch({ due_date: v }, 'due');
}
// 이슈 우선순위 — 백엔드 화이트리스트(상/중/하, work-surface.ts ISSUE_PRIORITIES)
function onPriority(ev: Event) {
  const v = (ev.target as HTMLSelectElement).value;
  if (props.kind === 'issue' && v === props.issue?.priority) return;
  patch({ priority: v || null }, 'priority');
}

// 상세내용(이슈=검토 코멘트 / 액션=확인 코멘트) — 읽기 전용.
//  백엔드 PATCH 화이트리스트(work-surface.ts)에 review_comment/confirm_comment가 없어
//  수정 경로가 없다(불변 계약: 계약에 없는 필드를 보내지 않는다). 표시만 한다.
const detailText = computed(() =>
  props.kind === 'issue' ? (props.issue?.reviewComment ?? '')
    : props.kind === 'action' ? (props.action?.confirmComment ?? '') : '',
);
const detailLabel = computed(() =>
  props.kind === 'issue' ? '검토 코멘트' : '확인 코멘트',
);
const dueLabel = computed(() => (props.kind === 'issue' ? '목표해결일' : '마감일'));

// 이슈 우선순위 옵션(계약값) + 현재 저장값이 목록 밖이면 그대로 노출(예: 과도기 데이터 '높음')
const priorityOptions = computed<string[]>(() => {
  const base = [...PRIORITIES];
  const cur = props.issue?.priority;
  if (cur && !base.includes(cur)) base.push(cur);
  return base;
});

// ---- 이슈/액션 상태 사다리 전이(사유 코멘트 선택) -----------------------------
const statusModal = ref<{ to: string } | null>(null);
const statusSaving = ref(false);
const statusModalError = ref<string | null>(null);

function askStatus(to: string) {
  statusModalError.value = null;
  statusModal.value = { to };
}
async function submitStatus(comment: string) {
  const id = entityId.value;
  if (!statusModal.value || id == null) return;
  const to = statusModal.value.to;
  statusSaving.value = true;
  statusModalError.value = null;
  const body: Record<string, unknown> = { status: to };
  if (comment) body.comment = comment;
  try {
    if (props.kind === 'issue') await dataClient.issues.update(id, body);
    else if (props.kind === 'action') await dataClient.actionItems.update(id, body);
    statusModal.value = null;
    emit('changed');
  } catch (e) {
    statusModalError.value = e instanceof Error ? e.message : String(e);
  } finally {
    statusSaving.value = false;
  }
}

// 리스크→이슈 전환(이슈 도메인 한정)
const isRisk = computed(() => props.kind === 'issue' && (props.issue?.type || '').includes('리스크'));
const convertOpen = ref(false);
const converting = ref(false);
const convertError = ref<string | null>(null);
async function submitConvert(comment: string) {
  const id = props.issue?.id;
  if (id == null) return;
  converting.value = true;
  convertError.value = null;
  try {
    await dataClient.issues.convertToIssue(id, comment || undefined);
    convertOpen.value = false;
    emit('changed');
  } catch (e) {
    convertError.value = e instanceof Error ? e.message : String(e);
  } finally {
    converting.value = false;
  }
}

function fmtDate(v: string | null | undefined): string {
  return v ? String(v).split('T')[0] : '—';
}
function dateValue(v: string | null | undefined): string {
  return v ? String(v).split('T')[0] : '';
}

const PRIORITIES = ['상', '중', '하'];
const TASK_STATUS_LABELS: Record<string, string> = {
  TODO: '대기', IN_PROGRESS: '진행중', REVIEW: '검토중', REJECTED: '반려', DONE: '완료',
};
</script>

<template>
  <div class="item-body">
    <div class="ib-head">
      <span class="kind-chip" :class="'k-' + kind">{{ KIND_LABEL[kind] }}</span>
      <span v-if="displayCode" class="dcode">{{ displayCode }}</span>
    </div>

    <h2 class="ib-title">{{ heading }}</h2>
    <div class="ib-status-row">
      <StatusBadge v-if="kind === 'artifact'" :status="status" />
      <span v-else class="plain-status">{{ status || '—' }}</span>
    </div>

    <!-- 필드 (도메인별) -->
    <dl class="fields">
      <template v-if="kind === 'issue'">
        <div><dt>유형</dt><dd>{{ issue?.type || '—' }}</dd></div>
        <div><dt>담당자</dt><dd>{{ issue?.owner || '—' }}</dd></div>
        <div><dt>발생일</dt><dd>{{ fmtDate(issue?.reportedDate) }}</dd></div>
        <div>
          <dt>{{ dueLabel }}</dt>
          <dd>
            <input v-if="apiMode" class="f-input" type="date" :value="dateValue(issue?.dueDate)"
              :disabled="savingField === 'due'" @change="onDueDate" />
            <template v-else>{{ fmtDate(issue?.dueDate) }}</template>
          </dd>
        </div>
        <div>
          <dt>우선순위</dt>
          <dd>
            <select v-if="apiMode" class="f-input" :value="issue?.priority || ''"
              :disabled="savingField === 'priority'" @change="onPriority">
              <option value="">—</option>
              <option v-for="p in priorityOptions" :key="p" :value="p">{{ p }}</option>
            </select>
            <template v-else>{{ issue?.priority || '—' }}</template>
          </dd>
        </div>
      </template>

      <template v-else-if="kind === 'action'">
        <div><dt>담당자</dt><dd>{{ action?.assignee || '—' }}</dd></div>
        <div>
          <dt>{{ dueLabel }}</dt>
          <dd>
            <input v-if="apiMode" class="f-input" type="date" :value="dateValue(action?.dueDate)"
              :disabled="savingField === 'due'" @change="onDueDate" />
            <template v-else>{{ fmtDate(action?.dueDate) }}</template>
          </dd>
        </div>
      </template>

      <template v-else-if="kind === 'artifact'">
        <div><dt>분류</dt><dd>{{ artifact?.category || '—' }}</dd></div>
        <div><dt>버전</dt><dd>{{ artifact?.version || '—' }}</dd></div>
        <div><dt>작성자</dt><dd>{{ artifact?.author || '—' }}</dd></div>
        <div><dt>마감일</dt><dd>{{ fmtDate(artifact?.dueDate) }}</dd></div>
        <div><dt>제출일</dt><dd>{{ artifact?.submitDate || '—' }}</dd></div>
      </template>

      <template v-else-if="kind === 'task'">
        <div><dt>상태</dt><dd>{{ TASK_STATUS_LABELS[status] ?? status }}</dd></div>
        <div><dt>진척률</dt><dd>{{ task?.progress ?? 0 }}%</dd></div>
        <div class="wide"><dt>기간</dt>
          <dd>{{ fmtDate(task?.plannedStartDate) }} ~ {{ fmtDate(task?.plannedEndDate) }}</dd>
        </div>
      </template>
    </dl>

    <!-- 상세내용(이슈=검토/액션=확인 코멘트) — 읽기 전용(백엔드 수정 계약 없음) -->
    <div v-if="kind === 'issue' || kind === 'action'" class="detail-field">
      <label class="f-label">{{ detailLabel }}</label>
      <div class="ro-text">{{ detailText || '—' }}</div>
    </div>

    <p v-if="fieldError" class="err">{{ fieldError }}</p>

    <!-- 상태 전이 -->
    <section class="section">
      <h3 class="section-title">상태 전이</h3>
      <!-- 산출물/태스크: 워크플로 엔진 -->
      <TransitionButtons
        v-if="transitionEntity && entityId != null"
        :entity="transitionEntity" :entity-id="entityId" :current-status="status"
        @changed="emit('changed')"
      />
      <!-- 이슈/액션: 상태 사다리 -->
      <template v-else>
        <div v-if="!apiMode" class="gate">전이는 백엔드(API_BASE) 연결 후 활성화</div>
        <div v-else-if="ladderTargets.length === 0" class="dim">가용 전이 없음</div>
        <div v-else class="ladder">
          <button
            v-for="to in ladderTargets" :key="to"
            class="btn btn-sm" @click="askStatus(to)"
          >{{ status }} → {{ to }}</button>
        </div>
        <div v-if="apiMode && isRisk" class="convert-row">
          <button class="btn btn-sm" title="리스크를 이슈로 전환 (0008 수동 전환)"
            @click="convertOpen = true">이슈로 전환</button>
        </div>
      </template>
    </section>

    <!-- 첨부파일: 아마란스 위임 stub -->
    <section class="section">
      <h3 class="section-title">첨부파일</h3>
      <div class="attach-row">
        <span class="pending">아마란스(원챔버) 연계로 제공 예정</span>
        <button class="btn btn-sm" @click="stub('amaranth', '첨부파일 열기')">아마란스에서 열기</button>
      </div>
    </section>

    <!-- 코멘트 스레드 -->
    <section class="section">
      <h3 class="section-title">코멘트</h3>
      <CommentThread
        v-if="entityId != null"
        :entity-type="COMMENT_TYPE[kind]" :entity-id="entityId"
        :project-id="projectId" :highlight-comment-id="highlightCommentId"
      />
    </section>

    <!-- 상태 변경 사유 코멘트(이슈/액션 사다리) -->
    <CommentModal
      v-if="statusModal"
      :title="`상태 변경 → ${statusModal.to}`"
      :message="`${status} → ${statusModal.to} (사유 코멘트는 선택)`"
      :required="false" submit-label="상태 변경"
      :submitting="statusSaving" :error="statusModalError"
      @submit="submitStatus" @close="statusModal = null"
    />
    <!-- 리스크→이슈 전환 확인 -->
    <CommentModal
      v-if="convertOpen"
      :title="`이슈로 전환: ${issue?.title}`"
      message="이 리스크를 이슈로 전환합니다(0008 수동 전환)."
      :required="false" submit-label="이슈로 전환"
      :submitting="converting" :error="convertError"
      @submit="submitConvert" @close="convertOpen = false"
    />
  </div>
</template>

<style scoped>
.item-body { display: flex; flex-direction: column; gap: 12px; }
.ib-head { display: flex; align-items: center; gap: 8px; }
.kind-chip {
  font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 999px;
  background: var(--panel-2); color: var(--muted);
}
.k-issue { color: var(--red); background: rgba(239, 68, 68, 0.12); }
.k-action { color: var(--blue); background: rgba(59, 130, 246, 0.12); }
.k-artifact { color: var(--yellow); background: rgba(251, 191, 36, 0.12); }
.k-task { color: var(--green); background: rgba(52, 211, 153, 0.12); }
.dcode { font-family: ui-monospace, monospace; font-size: 11px; color: var(--muted); }
.ib-title { font-size: 17px; margin: 0; word-break: break-word; }
.ib-status-row { display: flex; align-items: center; gap: 8px; }
.plain-status {
  font-size: 12px; font-weight: 600; padding: 2px 10px; border-radius: 999px;
  background: var(--panel-2); color: var(--muted);
}

.fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 18px; margin: 0; }
.fields > div { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.fields .wide { grid-column: 1 / -1; }
.fields dt { font-size: 11px; color: var(--muted); }
.fields dd { margin: 0; font-size: 13px; }

.detail-field { display: flex; flex-direction: column; gap: 4px; }
.f-label { font-size: 11px; color: var(--muted); }
.f-input {
  background: var(--panel-2); border: 1px solid var(--border); border-radius: 6px;
  color: var(--text); font-size: 13px; padding: 5px 8px; font-family: inherit; outline: none;
  max-width: 100%; box-sizing: border-box;
}
.f-input:focus { border-color: var(--accent); }
.ro-text { font-size: 13px; color: var(--text); white-space: pre-wrap; }

.section {
  display: flex; flex-direction: column; gap: 8px;
  border-top: 1px solid var(--border); padding-top: 12px;
}
.section-title { font-size: 13px; margin: 0; color: var(--text); }
.ladder { display: flex; flex-wrap: wrap; gap: 6px; }
.convert-row { margin-top: 4px; }
.gate, .dim { font-size: 12px; color: var(--muted); }
.attach-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.pending { font-size: 12px; color: var(--muted); font-style: italic; }
.err { color: var(--red); font-size: 12px; margin: 0; }
</style>
