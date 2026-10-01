<script setup lang="ts">
// 나라장터 공고조회 (/app/bid-notices — 0016 §A·§B).
// - 메뉴 진입 시 Asia/Seoul 기준 1개월 전~오늘 자동 설정 및 5개 관심기관 OR 자동 조회.
// - 수요기관 조회 범위: '관심기관' (5개 다중선택) vs '전체 기관'.
// - 공고일시 최신순 정렬, 전체 건수/페이징 일치, 중복 요청 방지 및 레이스 컨디션 방어.
// - 행 클릭 시 인앱 상세(/bid-notices/:bidNtceNo) 이동.
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { dataClient } from '../lib/dataClient';
import { absoluteRowNo } from '../lib/pagination';
import PageSizeSelect from '../components/PageSizeSelect.vue';
import Pager from '../components/Pager.vue';
import type { BidNotice, BidNoticeType } from '../types';

const router = useRouter();

function openDetail(n: BidNotice) {
  if (!n.announcementNo) return;
  void router.push({
    name: 'bid-notice-detail',
    params: { bidNtceNo: n.announcementNo },
    query: n.noticeOrder ? { bidNtceOrd: n.noticeOrder } : undefined,
  });
}

// 기본 5개 관심기관 상수
const DEFAULT_FAVORITE_AGENCIES = [
  '행정안전부 국가정보자원관리원',
  '한국지역정보개발원',
  '한국지능정보사회진흥원',
  '국세청',
  '관세청',
] as const;

/** 한국 시간(Asia/Seoul) 기준 현재 날짜 Date 객체 반환 */
function getKstDate(): Date {
  const now = new Date();
  const kstFormatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const [y, m, d] = kstFormatted.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** yyyy-MM-dd 문자열 포맷 */
function toYmd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 달력 기준 1개월 전 날짜 계산.
 * 전월에 같은 일자가 없으면 전월 말일 사용.
 * 예: 10월 1일 -> 9월 1일, 3월 31일 -> 2월 28일
 */
function getOneMonthAgo(baseDate: Date): Date {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const day = baseDate.getDate();

  const prevYear = month === 0 ? year - 1 : year;
  const prevMonth = month === 0 ? 11 : month - 1;

  const lastDayOfPrevMonth = new Date(prevYear, prevMonth + 1, 0).getDate();
  const targetDay = Math.min(day, lastDayOfPrevMonth);

  return new Date(prevYear, prevMonth, targetDay);
}

// --- 상태 관리 ---
const apiMode = computed(() => !!window.API_BASE);

// 검색일자 기준 (현재는 공고일 고정)
const dateCriteria = ref('공고일');

// 기간: 한국 시간 기준 1개월 전 ~ 오늘
const bgngDt = ref(toYmd(getOneMonthAgo(getKstDate())));
const endDt = ref(toYmd(getKstDate()));

// 수요기관 조회 범위: 'FAVORITE'(관심기관) | 'ALL'(전체 기관)
const agencyScope = ref<'FAVORITE' | 'ALL'>('FAVORITE');

// 선택된 관심기관 목록 (기본 5개 모두 선택)
const selectedAgencies = ref<string[]>([...DEFAULT_FAVORITE_AGENCIES]);

// 공고유형 및 검색어
const noticeType = ref<BidNoticeType>('all');
const keyword = ref('');

// 페이징 및 결과
const page = ref(1);
const numOfRows = ref(10);
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / numOfRows.value)));

const notices = ref<BidNotice[]>([]);
const totalCount = ref(0);
const sourceTotalCount = ref(0);
const truncated = ref(false);
const loading = ref(false);
const loadError = ref<string | null>(null);
const searched = ref(false);

// 요청 경쟁 상태(Race Condition) 방지 카운터
let searchSeq = 0;

// 조건 표시용 스냅샷 (실제 조회가 완료된 시점의 조건 기록)
const appliedCriteria = ref({
  bgngDt: bgngDt.value,
  endDt: endDt.value,
  agencyScope: agencyScope.value,
  agencyCount: selectedAgencies.value.length,
});

// 관심기관 0개 선택 여부
const isFavoriteEmpty = computed(() => agencyScope.value === 'FAVORITE' && selectedAgencies.value.length === 0);

// 결과 상단 적용 조건 표시 텍스트
const appliedSummary = computed(() => {
  const bgn = appliedCriteria.value.bgngDt.replace(/-/g, '.');
  const end = appliedCriteria.value.endDt.replace(/-/g, '.');
  const dateStr = `공고일 ${bgn}~${end}`;
  let agencyStr = '';
  if (appliedCriteria.value.agencyScope === 'ALL') {
    agencyStr = '전체 기관';
  } else {
    agencyStr = `관심기관 ${appliedCriteria.value.agencyCount}개`;
  }
  const countStr = truncated.value
    ? `일부 수집 ${totalCount.value.toLocaleString('ko-KR')}건 (전체 건수 미확정)`
    : `총 ${totalCount.value.toLocaleString('ko-KR')}건`;
  return `용역 공고 · ${dateStr} · ${agencyStr} · ${countStr}`;
});

const preSpecSelected = computed(() => noticeType.value === 'pre_spec');

const NOTICE_TYPE_LABEL: Record<'main' | 'pre_spec', string> = {
  main: '본공고',
  pre_spec: '사전규격',
};

function toG2bDt(dateStr: string): string | undefined {
  const d = dateStr.trim();
  if (!d) return undefined;
  const digits = d.replace(/-/g, '');
  return digits.length === 8 ? digits : undefined;
}

// 관심기관 개별 토글
function toggleAgency(agency: string) {
  const idx = selectedAgencies.value.indexOf(agency);
  if (idx >= 0) {
    selectedAgencies.value.splice(idx, 1);
  } else {
    selectedAgencies.value.push(agency);
  }
}

// 관심기관 전체 선택 / 해제
function selectAllAgencies() {
  selectedAgencies.value = [...DEFAULT_FAVORITE_AGENCIES];
}
function deselectAllAgencies() {
  selectedAgencies.value = [];
}

async function runSearch() {
  if (!apiMode.value) return;
  if (isFavoriteEmpty.value) return;

  // 날짜 유효성 검증
  if (bgngDt.value && endDt.value) {
    if (bgngDt.value > endDt.value) {
      alert('시작일은 종료일보다 이전이어야 합니다.');
      return;
    }
    const [sy, sm, sd] = bgngDt.value.split('-').map(Number);
    const [ey, em, ed] = endDt.value.split('-').map(Number);
    const startDate = new Date(sy, sm - 1, sd);
    const endDate = new Date(ey, em - 1, ed);
    const diffDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > 186) {
      alert('응답 지연 방지를 위해 조회기간은 최대 6개월까지 선택할 수 있습니다.');
      return;
    }
  }

  const currentSeq = ++searchSeq;
  loading.value = true;
  loadError.value = null;

  try {
    const agenciesParam = agencyScope.value === 'FAVORITE' ? [...selectedAgencies.value] : undefined;

    const result = await dataClient.bidNotices.search({
      agencies: agenciesParam,
      noticeType: noticeType.value,
      keyword: keyword.value.trim() || undefined,
      bgngDt: toG2bDt(bgngDt.value),
      endDt: toG2bDt(endDt.value),
      page: page.value,
      numOfRows: numOfRows.value,
    });

    // 지연된 응답이 최신 결과를 덮어쓰지 않도록 방어
    if (currentSeq !== searchSeq) return;

    notices.value = result.notices;
    totalCount.value = result.totalCount;
    sourceTotalCount.value = result.sourceTotalCount ?? result.totalCount;
    truncated.value = result.truncated ?? false;
    searched.value = true;

    // 적용된 조건 스냅샷 업데이트
    appliedCriteria.value = {
      bgngDt: bgngDt.value,
      endDt: endDt.value,
      agencyScope: agencyScope.value,
      agencyCount: selectedAgencies.value.length,
    };
  } catch (e) {
    if (currentSeq !== searchSeq) return;
    loadError.value = e instanceof Error ? e.message : String(e);
    notices.value = [];
    totalCount.value = 0;
    sourceTotalCount.value = 0;
    truncated.value = false;
  } finally {
    if (currentSeq === searchSeq) {
      loading.value = false;
    }
  }
}

function search() {
  page.value = 1;
  void runSearch();
}

function goPage(p: number) {
  if (p < 1 || p > totalPages.value || p === page.value) return;
  page.value = p;
  void runSearch();
}

function changePageSize(size: number) {
  numOfRows.value = size;
  page.value = 1;
  void runSearch();
}

// 초기화 버튼: 공고일 / 최근 1개월 / 관심기관 5개로 복원 후 자동 재조회
function resetFilters() {
  dateCriteria.value = '공고일';
  bgngDt.value = toYmd(getOneMonthAgo(getKstDate()));
  endDt.value = toYmd(getKstDate());
  agencyScope.value = 'FAVORITE';
  selectedAgencies.value = [...DEFAULT_FAVORITE_AGENCIES];
  noticeType.value = 'all';
  keyword.value = '';
  page.value = 1;
  void runSearch();
}

const rowNo = (index: number) => absoluteRowNo(page.value, numOfRows.value, index);

function budgetText(v: number): string {
  return v ? v.toLocaleString('ko-KR') + ' 원' : '—';
}

function dateText(v: string): string {
  return v && v !== '-' ? v : '—';
}

onMounted(() => {
  // 메뉴 진입 시 검색 버튼을 누르지 않아도 기본조건으로 자동 조회
  void runSearch();
});
</script>

<template>
  <div>
    <h1 class="title">나라장터 공고조회 (용역)</h1>
    <p class="sub">
      수요기관·공고일자 기준으로 나라장터 용역 입찰공고를 조회합니다 — 행을 클릭하면 인앱 상세에서 확인하고 입찰 프로젝트로 등록할 수 있습니다.
    </p>

    <div class="filters">
      <!-- 1행: 검색일자 기준 & 기간 & 공고유형 -->
      <div class="frow">
        <label class="field">
          <span class="flabel">검색일자 기준</span>
          <select v-model="dateCriteria" class="in" :disabled="!apiMode">
            <option value="공고일">공고일</option>
          </select>
        </label>

        <label class="field">
          <span class="flabel">시작일</span>
          <input v-model="bgngDt" class="in" type="date" :disabled="!apiMode" />
        </label>

        <label class="field">
          <span class="flabel">종료일</span>
          <input
            v-model="endDt"
            class="in"
            type="date"
            :min="bgngDt || undefined"
            :disabled="!apiMode"
          />
        </label>

        <div class="field">
          <span class="flabel">공고유형</span>
          <div class="types" role="group" aria-label="공고유형">
            <button
              class="ttab"
              :class="{ on: noticeType === 'all' }"
              :disabled="!apiMode"
              @click="noticeType = 'all'; search()"
            >전체</button>
            <button
              class="ttab"
              :class="{ on: noticeType === 'main' }"
              :disabled="!apiMode"
              @click="noticeType = 'main'; search()"
            >본공고</button>
            <button
              class="ttab"
              :class="{ on: noticeType === 'pre_spec' }"
              :disabled="!apiMode"
              title="사전규격 연동은 준비중입니다"
              @click="noticeType = 'pre_spec'; search()"
            >
              사전규격 <span class="soon">준비중</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 2행: 수요기관 조회 범위 (관심기관 vs 전체 기관) -->
      <div class="frow agency-scope-row">
        <div class="field grow">
          <div class="scope-header">
            <span class="flabel">수요기관 조회 범위</span>
            <div class="scope-radio-group">
              <label class="scope-radio">
                <input
                  v-model="agencyScope"
                  type="radio"
                  value="FAVORITE"
                  :disabled="!apiMode"
                />
                <span>관심기관 (5개)</span>
              </label>
              <label class="scope-radio">
                <input
                  v-model="agencyScope"
                  type="radio"
                  value="ALL"
                  :disabled="!apiMode"
                />
                <span>전체 기관</span>
              </label>
            </div>
            <div v-if="agencyScope === 'FAVORITE'" class="agency-actions">
              <button type="button" class="btn-text" @click="selectAllAgencies">전체선택</button>
              <span class="sep">·</span>
              <button type="button" class="btn-text" @click="deselectAllAgencies">전체해제</button>
            </div>
          </div>

          <!-- 관심기관 체크박스 영역 -->
          <div v-if="agencyScope === 'FAVORITE'" class="agency-chips">
            <label
              v-for="agency in DEFAULT_FAVORITE_AGENCIES"
              :key="agency"
              class="agency-chip"
              :class="{ active: selectedAgencies.includes(agency) }"
            >
              <input
                type="checkbox"
                :value="agency"
                :checked="selectedAgencies.includes(agency)"
                :disabled="!apiMode"
                @change="toggleAgency(agency)"
              />
              <span>{{ agency }}</span>
            </label>
          </div>

          <!-- 관심기관 0개 선택 경고 -->
          <div v-if="isFavoriteEmpty" class="agency-alert warn">
            관심기관을 1개 이상 선택하거나 '전체 기관'을 선택해주세요.
          </div>
        </div>
      </div>

      <!-- 3행: 검색어 & 조회/초기화 버튼 -->
      <div class="frow search-row">
        <label class="field grow">
          <span class="flabel">공고명 검색어</span>
          <input
            v-model="keyword"
            class="in"
            type="search"
            placeholder="공고명 검색어 (비우면 전체)"
            :disabled="!apiMode"
            @keyup.enter="search"
          />
        </label>
        <div class="btns">
          <button
            class="btn btn-secondary"
            type="button"
            :disabled="!apiMode || loading"
            @click="resetFilters"
          >
            초기화
          </button>
          <button
            class="btn btn-primary"
            type="button"
            :disabled="!apiMode || loading || isFavoriteEmpty"
            @click="search"
          >
            {{ loading ? '조회 중…' : '검색' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="!apiMode" class="notice">
      나라장터 공고조회는 백엔드(API_BASE) 연결 후에만 가능합니다 — 레거시(Supabase)에는 나라장터 연동이 없습니다.
    </div>
    <template v-else>
      <div v-if="preSpecSelected" class="notice warn">
        사전규격 조회는 현재 준비중입니다(백엔드 연동 미확정) — 결과가 비어 있을 수 있습니다. 본공고 또는 전체로 조회하세요.
      </div>

      <!-- 상단 적용 조건 표시 & 건수/페이지 사이즈 -->
      <div v-if="searched && !loading && !loadError" class="result-head">
        <div class="summary-line">
          <span class="condition-badge">{{ appliedSummary }}</span>
        </div>
        <PageSizeSelect :model-value="numOfRows" @update:model-value="changePageSize" />
      </div>

      <div v-if="truncated && searched && !loading && !loadError" class="notice warn">
        일부 수집 {{ totalCount.toLocaleString('ko-KR') }}건 · 전체 건수 미확정 —
        기간 또는 검색어로 조회 범위를 좁히면 전체 공고를 완전히 수집할 수 있습니다.
      </div>

      <div v-if="loading" class="notice loading-box">
        <div class="spinner"></div>
        <span>나라장터 공고를 조회하는 중입니다…</span>
      </div>
      <div v-else-if="loadError" class="notice err-box">
        공고를 불러오지 못했습니다.
        <span class="detail">({{ loadError }})</span>
      </div>
      <div v-else-if="notices.length === 0" class="notice empty-box">
        {{ searched ? '조건에 맞는 공고가 없습니다.' : '조회 조건을 입력하고 검색하세요.' }}
      </div>
      <template v-else>
        <table class="grid">
          <thead>
            <tr>
              <th class="no">No.</th>
              <th>공고번호</th>
              <th>유형</th>
              <th>공고명</th>
              <th>수요기관</th>
              <th>공고일</th>
              <th>마감일</th>
              <th class="num">예산</th>
              <th>상세</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(n, idx) in notices"
              :key="`${n.noticeType}-${n.announcementNo}-${n.noticeOrder || '00'}`"
              class="row"
              @click="openDetail(n)"
            >
              <td class="no">{{ rowNo(idx) }}</td>
              <td class="mono">
                {{ n.announcementNo || '—' }}
                <span v-if="n.noticeOrder" class="ord-tag">[{{ n.noticeOrder }}차]</span>
              </td>
              <td>
                <span class="badge" :class="n.noticeType">{{ NOTICE_TYPE_LABEL[n.noticeType] ?? n.noticeType }}</span>
              </td>
              <td class="name">{{ n.name || '—' }}</td>
              <td class="customer-cell">{{ n.customer || '—' }}</td>
              <td>{{ dateText(n.publishDate) }}</td>
              <td>{{ dateText(n.endDate) }}</td>
              <td class="num">{{ budgetText(n.budget) }}</td>
              <td>
                <button class="link btn-link" @click.stop="openDetail(n)">상세</button>
              </td>
            </tr>
          </tbody>
        </table>

        <Pager
          :page="page"
          :total-pages="totalPages"
          :total="totalCount"
          :disabled="loading"
          @update:page="goPage"
        />
      </template>
    </template>
  </div>
</template>

<style scoped>
.title { font-size: 22px; margin: 0 0 4px; }
.sub { color: var(--muted); font-size: 14px; margin: 0 0 20px; }

.filters {
  border: 1px solid var(--border); border-radius: 12px; background: var(--panel);
  padding: 16px 18px; margin-bottom: 18px; display: flex; flex-direction: column; gap: 14px;
}
.frow { display: flex; align-items: flex-end; gap: 14px; flex-wrap: wrap; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field.grow { flex: 1 1 280px; }
.flabel { font-size: 13px; font-weight: 600; color: var(--muted); }

.in {
  background: var(--panel-2, var(--panel)); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); font-size: 14px; padding: 7px 11px; min-width: 140px; outline: none;
}
.in:focus { border-color: var(--accent); }
.field.grow .in { width: 100%; }

.types { display: flex; gap: 3px; background: var(--panel-2); border: 1px solid var(--border); border-radius: 8px; padding: 3px; }
.ttab {
  border: 0; background: transparent; color: var(--muted);
  font-size: 13px; font-weight: 600; padding: 5px 12px; border-radius: 6px; cursor: pointer;
  display: inline-flex; align-items: center; gap: 5px;
}
.ttab.on { background: var(--accent); color: #fff; }
.ttab:disabled { opacity: 0.5; cursor: not-allowed; }
.soon {
  font-size: 10px; font-weight: 700; letter-spacing: 0.02em;
  border: 1px solid currentColor; border-radius: 999px; padding: 0 5px; opacity: 0.75;
}

/* 수요기관 선택 영역 */
.agency-scope-row {
  border-top: 1px solid var(--border);
  padding-top: 12px;
}
.scope-header {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.scope-radio-group {
  display: flex;
  align-items: center;
  gap: 14px;
}
.scope-radio {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  color: var(--text);
}
.agency-actions {
  margin-left: auto;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.btn-text {
  background: none;
  border: none;
  color: var(--accent);
  cursor: pointer;
  font-size: 12px;
  padding: 0;
}
.btn-text:hover { text-decoration: underline; }
.sep { color: var(--muted); }

.agency-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}
.agency-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 11px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--panel-2);
  color: var(--muted);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  user-select: none;
  transition: all 0.15s ease;
}
.agency-chip.active {
  border-color: var(--accent);
  background: rgba(37, 99, 235, 0.08);
  color: var(--accent);
  font-weight: 600;
}
.agency-chip input[type="checkbox"] {
  cursor: pointer;
  accent-color: var(--accent);
}

.agency-alert {
  margin-top: 6px;
  font-size: 12.5px;
  padding: 6px 10px;
  border-radius: 6px;
}
.agency-alert.warn {
  background: rgba(239, 68, 68, 0.08);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.25);
}

/* 3행 */
.search-row {
  border-top: 1px solid var(--border);
  padding-top: 12px;
}
.btns {
  display: flex;
  gap: 8px;
  margin-left: auto;
}
.btn {
  border: 1px solid var(--border);
  background: var(--panel-2);
  color: var(--text);
  font-size: 14px;
  font-weight: 600;
  padding: 8px 18px;
  border-radius: 8px;
  cursor: pointer;
  transition: opacity 0.15s ease;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-primary {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
.btn-secondary:hover {
  border-color: var(--accent);
}

.notice {
  padding: 16px; border-radius: 8px;
  background: var(--panel); border: 1px solid var(--border); color: var(--muted); font-size: 14px;
}
.notice.warn { border-color: var(--accent); }
.notice.err-box { border-color: #ef4444; color: #ef4444; }
.notice.loading-box {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text);
}
.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

.result-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 0 12px;
  gap: 12px;
  flex-wrap: wrap;
}
.summary-line {
  display: flex;
  align-items: center;
  gap: 8px;
}
.condition-badge {
  display: inline-block;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text);
  background: var(--panel);
  border: 1px solid var(--border);
  padding: 5px 12px;
  border-radius: 8px;
}

.grid { border-collapse: collapse; width: 100%; font-size: 14px; }
.grid th, .grid td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border); vertical-align: top; }
.grid th { color: var(--muted); font-weight: 600; font-size: 13px; }
.grid .num { text-align: right; white-space: nowrap; }
.grid .no { width: 48px; text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.grid .name { font-weight: 600; }
.grid .customer-cell { color: var(--text); }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; white-space: nowrap; }

.badge {
  display: inline-block; font-size: 12px; font-weight: 600; padding: 1px 8px; border-radius: 999px;
  border: 1px solid var(--border); color: var(--muted); white-space: nowrap;
}
.badge.main { background: var(--accent); color: #fff; border-color: var(--accent); }
.badge.pre_spec { background: var(--panel-2); }

.link { color: var(--accent); text-decoration: none; font-weight: 600; }
.link:hover { text-decoration: underline; }

.row { cursor: pointer; }
.row:hover { background: var(--panel-2); }
.btn-link {
  border: 0; background: transparent; color: var(--accent);
  font-size: 14px; font-weight: 600; padding: 0; cursor: pointer;
}
.btn-link:hover { text-decoration: underline; }

.ord-tag {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  color: var(--accent);
  background: rgba(37, 99, 235, 0.08);
  border: 1px solid rgba(37, 99, 235, 0.25);
  border-radius: 4px;
  padding: 1px 4px;
  margin-left: 5px;
  vertical-align: middle;
}
</style>
