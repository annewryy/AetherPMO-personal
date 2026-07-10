<script setup lang="ts">
// 0010 A-3 → 0012 C-2 범용 코멘트 스레드 (이슈/액션아이템/산출물/태스크 공통).
//  - 목록: GET /api/:entity/:id/comments (폴백 모드는 pms_comment 직접 조회 — 읽기 원칙)
//  - 트리: 최상위 코멘트 + 1단계 답글(parentCommentId). 각 코멘트 "답글" 액션.
//  - @멘션: CommentComposer가 자동완성/인코딩. 렌더 시 `@[이름](uuid)`를 칩으로 하이라이트.
//  - STATUS_CHANGE 코멘트는 status_from→status_to 뱃지 병기.
//  - 작성: POST — 백엔드(API_BASE) 전용 게이트. 폴백에선 입력 비활성 + 안내.
//  - 오류는 서버 {"message"}를 그대로 표시 (dataClient.apiSend가 던진 메시지).
import { ref, watch, computed, nextTick } from 'vue';
import { dataClient } from '../lib/dataClient';
import type { CommentEntityType, EntityComment, ProjectMemberRef } from '../types';
import { parseMentions } from '../lib/mentions';
import CommentComposer from './CommentComposer.vue';

const props = defineProps<{
  entityType: CommentEntityType;
  entityId: number;
  projectId?: number;            // 0012: 멘션 자동완성 멤버 조회용
  highlightCommentId?: number | null; // 0012 C-3: 알림 클릭 시 해당 코멘트로 스크롤·강조
}>();

const apiMode = computed(() => !!window.API_BASE);

const comments = ref<EntityComment[]>([]);
const members = ref<ProjectMemberRef[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
const posting = ref(false);
const postError = ref<string | null>(null);

// 답글 대상(열린 최상위 코멘트 id) + 답글 오류
const replyTo = ref<number | null>(null);
const replyPosting = ref(false);
const replyError = ref<string | null>(null);

const topComposer = ref<InstanceType<typeof CommentComposer> | null>(null);

interface ThreadNode { comment: EntityComment; replies: EntityComment[]; }

// parentCommentId 기준 1단계 트리(부모 없는 답글은 최상위로 승격 — 방어적).
const tree = computed<ThreadNode[]>(() => {
  const byId = new Map<number, EntityComment>();
  for (const c of comments.value) byId.set(c.id, c);
  const repliesByParent = new Map<number, EntityComment[]>();
  const roots: EntityComment[] = [];
  for (const c of comments.value) {
    const parent = c.parentCommentId ?? null;
    if (parent != null && byId.has(parent)) {
      const list = repliesByParent.get(parent) ?? [];
      list.push(c);
      repliesByParent.set(parent, list);
    } else {
      roots.push(c);
    }
  }
  const byTime = (a: EntityComment, b: EntityComment) =>
    String(a.createdAt).localeCompare(String(b.createdAt)) || a.id - b.id;
  roots.sort(byTime);
  return roots.map((c) => ({
    comment: c,
    replies: (repliesByParent.get(c.id) ?? []).sort(byTime),
  }));
});

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    comments.value = await dataClient.comments.list(props.entityType, props.entityId);
    if (props.highlightCommentId != null) {
      await nextTick();
      scrollToHighlight();
    }
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

// 배치18 §B — @멘션 후보를 전체 인력(persons)으로 확장.
//  - 프로젝트 멤버(projectMembers)는 실제 user_uid를 갖고 있어 멘션 시 알림이 발송된다.
//  - 전체 인력(persons)은 계정(user_uid) 없이도 후보에 포함 → 이름 멘션은 되지만 알림은 없다.
//    (persons API가 user_uid를 노출하지 않으므로, 식별자를 `person:<id>`로 인코딩.
//     이는 UUID가 아니어서 mentions 배열에서 제외되고 백엔드 알림 대상에서 빠진다.)
//  - 같은 사람이 멤버·인력 양쪽에 있으면 이름 기준으로 멤버(알림 가능)를 우선한다.
async function loadMembers() {
  const [memberList, personList] = await Promise.all([
    props.projectId != null
      ? dataClient.projectMembers.list(props.projectId).catch(() => [] as ProjectMemberRef[])
      : Promise.resolve([] as ProjectMemberRef[]),
    dataClient.persons.list().catch(() => []),
  ]);

  const byName = new Map<string, ProjectMemberRef>();
  // 멤버 먼저(실제 uuid — 알림 대상). 이름 중복 시 멤버가 우선.
  for (const m of memberList) byName.set(m.name, m);
  for (const p of personList) {
    if (byName.has(p.name)) continue; // 이미 알림 가능한 멤버로 존재
    byName.set(p.name, {
      userUid: `person:${p.personId}`, // 비-UUID 식별자 → 알림 미발송(이름 멘션만)
      name: p.name,
      role: p.companyName ?? p.employmentType ?? null,
    });
  }
  members.value = [...byName.values()];
}

function scrollToHighlight() {
  const id = props.highlightCommentId;
  if (id == null) return;
  const el = document.getElementById(`comment-${id}`);
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

watch(() => [props.entityType, props.entityId], () => { replyTo.value = null; load(); }, { immediate: true });
watch(() => props.projectId, loadMembers, { immediate: true });
watch(() => props.highlightCommentId, () => nextTick(scrollToHighlight));

async function submitTop(payload: { body: string; mentions: string[] }) {
  if (posting.value) return;
  posting.value = true;
  postError.value = null;
  try {
    await dataClient.comments.create(props.entityType, props.entityId, {
      body: payload.body, mentions: payload.mentions,
    });
    topComposer.value?.reset();
    await load();
  } catch (e) {
    postError.value = e instanceof Error ? e.message : String(e);
  } finally {
    posting.value = false;
  }
}

async function submitReply(parentId: number, payload: { body: string; mentions: string[] }) {
  if (replyPosting.value) return;
  replyPosting.value = true;
  replyError.value = null;
  try {
    await dataClient.comments.create(props.entityType, props.entityId, {
      body: payload.body, parentCommentId: parentId, mentions: payload.mentions,
    });
    replyTo.value = null;
    await load();
  } catch (e) {
    replyError.value = e instanceof Error ? e.message : String(e);
  } finally {
    replyPosting.value = false;
  }
}

function toggleReply(id: number) {
  replyTo.value = replyTo.value === id ? null : id;
  replyError.value = null;
}

function fmtTime(v: string): string {
  const s = String(v);
  return s.includes('T') ? s.replace('T', ' ').slice(0, 16) : s;
}
</script>

<template>
  <div class="thread">
    <div v-if="loading" class="dim">코멘트 불러오는 중…</div>
    <div v-else-if="loadError" class="err">{{ loadError }}</div>
    <template v-else>
      <div v-if="tree.length === 0" class="dim">코멘트가 없습니다.</div>
      <ul v-else class="list">
        <li v-for="node in tree" :key="node.comment.id" class="item-wrap">
          <!-- 최상위 코멘트 -->
          <div
            :id="`comment-${node.comment.id}`" class="item"
            :class="{ hl: highlightCommentId === node.comment.id }"
          >
            <div class="head">
              <span class="author">{{ node.comment.authorName || '—' }}</span>
              <span
                v-if="node.comment.commentType === 'STATUS_CHANGE'"
                class="sc-badge" title="상태 변경 코멘트"
              >{{ node.comment.statusFrom || '?' }} → {{ node.comment.statusTo || '?' }}</span>
              <span class="time">{{ fmtTime(node.comment.createdAt) }}</span>
            </div>
            <p class="body">
              <template v-for="(tok, i) in parseMentions(node.comment.body)" :key="i">
                <span v-if="tok.kind === 'mention'" class="mention-chip">@{{ tok.text }}</span>
                <template v-else>{{ tok.text }}</template>
              </template>
            </p>
            <div v-if="apiMode" class="item-actions">
              <button class="link-btn" type="button" @click="toggleReply(node.comment.id)">
                {{ replyTo === node.comment.id ? '답글 취소' : '답글' }}
              </button>
            </div>
          </div>

          <!-- 1단계 답글 -->
          <ul v-if="node.replies.length" class="replies">
            <li
              v-for="r in node.replies" :key="r.id"
              :id="`comment-${r.id}`" class="item reply"
              :class="{ hl: highlightCommentId === r.id }"
            >
              <div class="head">
                <span class="author">{{ r.authorName || '—' }}</span>
                <span
                  v-if="r.commentType === 'STATUS_CHANGE'"
                  class="sc-badge" title="상태 변경 코멘트"
                >{{ r.statusFrom || '?' }} → {{ r.statusTo || '?' }}</span>
                <span class="time">{{ fmtTime(r.createdAt) }}</span>
              </div>
              <p class="body">
                <template v-for="(tok, i) in parseMentions(r.body)" :key="i">
                  <span v-if="tok.kind === 'mention'" class="mention-chip">@{{ tok.text }}</span>
                  <template v-else>{{ tok.text }}</template>
                </template>
              </p>
            </li>
          </ul>

          <!-- 답글 입력기 -->
          <div v-if="apiMode && replyTo === node.comment.id" class="reply-form">
            <CommentComposer
              :members="members" :posting="replyPosting" autofocus
              placeholder="답글 입력…  @로 멤버 멘션" submit-label="답글 등록"
              @submit="submitReply(node.comment.id, $event)"
              @cancel="replyTo = null"
            >
              <template #error>
                <span v-if="replyError" class="err">{{ replyError }}</span>
              </template>
              <template #cancel />
            </CommentComposer>
          </div>
        </li>
      </ul>
    </template>

    <!-- 최상위 작성 폼 — 쓰기는 백엔드 전용(API_BASE 게이트) -->
    <div v-if="!apiMode" class="gate">
      코멘트 작성·멘션은 백엔드(API_BASE) 연결 후 가능합니다 — 현재는 조회만.
    </div>
    <CommentComposer
      v-else ref="topComposer"
      :members="members" :posting="posting"
      @submit="submitTop"
    >
      <template #error>
        <span v-if="postError" class="err">{{ postError }}</span>
      </template>
    </CommentComposer>
  </div>
</template>

<style scoped>
.thread { display: flex; flex-direction: column; gap: 10px; font-size: 13px; }
.dim { color: var(--muted); font-size: 12px; }
.err { color: var(--red); font-size: 12px; }

.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.item-wrap { display: flex; flex-direction: column; gap: 6px; }
.item {
  background: var(--panel); border: 1px solid var(--border); border-radius: 8px;
  padding: 8px 12px;
}
.item.hl { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.25); }
.head { display: flex; align-items: center; gap: 8px; margin-bottom: 3px; }
.author { font-weight: 600; font-size: 12px; }
.time { margin-left: auto; color: var(--muted); font-size: 11px; }
.sc-badge {
  font-size: 10px; font-weight: 600; color: var(--blue);
  border: 1px solid var(--blue); border-radius: 999px; padding: 0 7px;
  background: rgba(59, 130, 246, 0.08);
}
.body { margin: 0; white-space: pre-wrap; word-break: break-word; }
.mention-chip {
  display: inline; font-weight: 600; color: var(--accent);
  background: rgba(139, 92, 246, 0.12); border-radius: 4px; padding: 0 3px;
}
.item-actions { margin-top: 5px; }
.link-btn {
  border: 0; background: transparent; padding: 0; cursor: pointer;
  color: var(--muted); font-size: 11px; font-family: inherit;
}
.link-btn:hover { color: var(--accent); text-decoration: underline; }

.replies {
  list-style: none; margin: 6px 0 0 18px; padding: 0 0 0 12px;
  border-left: 2px solid var(--border); display: flex; flex-direction: column; gap: 8px;
}
.reply { background: var(--panel-2); }
.reply-form { margin: 4px 0 0 30px; }

.gate {
  padding: 8px 12px; border-radius: 8px; font-size: 12px; color: var(--muted);
  background: var(--panel); border: 1px dashed var(--border);
}
</style>
