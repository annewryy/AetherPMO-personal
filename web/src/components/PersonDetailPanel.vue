<script setup lang="ts">
// 인력 상세 패널 (0014 B) — 기본 정보 + 프로젝트 참여 이력(시간순 테이블).
// 목록에서 인력 선택 시 우측 슬라이드 패널로 연다. 데이터는 dataClient.persons.
import { ref, watch } from 'vue';
import { dataClient } from '../lib/dataClient';
import { employmentTypeLabel, sourceLabel } from '../lib/personLabels';
import type { Person, PersonProjectHistory } from '../types';

const props = defineProps<{
  // 목록 행이 넘겨준 값(즉시 표시). 상세/이력은 열릴 때 재조회로 최신화.
  person: Person;
}>();
// 'changed' — 인력 정보가 바뀌면 부모 목록 갱신 신호.
defineEmits<{ (e: 'close'): void; (e: 'changed'): void }>();

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

async function loadFor(id: number) {
  loading.value = true;
  loadError.value = null;
  try {
    const [d, hist] = await Promise.all([
      dataClient.persons.get(id),
      dataClient.persons.projects(id),
    ]);
    if (d) detail.value = d;
    history.value = hist;
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
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
.pname { font-size: 20px; margin: 0 0 8px; }
.ptags { display: flex; flex-wrap: wrap; gap: 6px; }
.tag {
  font-size: 12px; padding: 2px 9px; border-radius: 999px;
  background: var(--panel-2); color: var(--muted); border: 1px solid var(--border);
}
.tag.src { color: var(--text); }
.tag.emp { font-family: ui-monospace, monospace; }
.x {
  border: 0; background: transparent; color: var(--muted);
  font-size: 16px; cursor: pointer; padding: 4px 8px; border-radius: 6px;
}
.x:hover { background: var(--panel-2); color: var(--text); }

.info { margin-bottom: 24px; }
.info dl { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 24px; margin: 0; }
.info dt { color: var(--muted); font-size: 12px; margin-bottom: 2px; }
.info dd { margin: 0; font-size: 14px; }

.sec-title { font-size: 15px; margin: 0 0 12px; }

.notice {
  padding: 14px; border-radius: 8px;
  background: var(--panel); border: 1px solid var(--border); color: var(--muted); font-size: 14px;
}
.notice .detail { opacity: 0.7; }

.grid { border-collapse: collapse; width: 100%; font-size: 13.5px; }
.grid th, .grid td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); }
.grid th { color: var(--muted); font-weight: 600; font-size: 12.5px; }
.name { font-weight: 600; }
.muted { color: var(--muted); }
.proj-link { font-weight: 600; }
.pm-badge {
  font-size: 11px; font-weight: 600; color: var(--accent);
  border: 1px solid var(--accent); border-radius: 999px; padding: 0 6px; margin-left: 6px;
}
.active-badge {
  font-size: 11px; font-weight: 600; color: var(--blue, var(--accent));
  border: 1px solid var(--blue, var(--accent)); border-radius: 999px; padding: 0 6px; margin-left: 6px;
}
</style>
