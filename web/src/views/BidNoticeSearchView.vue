<script setup lang="ts">
// 나라장터 공고조회 (/app/bid-notices — 0016 §A·§B). 입찰단계 > 나라장터 공고조회.
//  - 기관 드롭다운(GET /api/bid-agencies, isDefault 기본선택) + "직접입력" 특수항목(자유텍스트).
//  - 공고유형: 전체/본공고/사전규격. 사전규격은 백엔드 게이트 off(빈 결과) → "준비중" 비활성.
//  - 검색: 키워드·기간(선택). 조회는 서버 호출(dataClient.bidNotices.search) — 클라 필터 금지.
//  - 결과 그리드: 공고번호·유형 Badge·공고명·기관·공고일·마감일·예산·상세링크 + totalCount·페이징.
//  - 백엔드 전용(레거시 폴백 없음): API_BASE 없으면 조회 불가 안내.
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { dataClient } from '../lib/dataClient';
import { absoluteRowNo } from '../lib/pagination';
import PageSizeSelect from '../components/PageSizeSelect.vue';
import Pager from '../components/Pager.vue';
import type { BidAgency, BidNotice, BidNoticeType } from '../types';

const router = useRouter();

// 0017 §A 재설계: 행 클릭 = 공고 상세 전체 페이지로 라우트 이동(드로어 폐기).
//   등록은 상세 페이지의 "입찰 프로젝트 등록" → 중앙 모달 3스텝 마법사에서 처리한다.
function openDetail(n: BidNotice) {
  if (!n.announcementNo) return; // 공고번호 없으면 상세 조회 불가
  void router.push({ name: 'bid-notice-detail', params: { bidNtceNo: n.announcementNo } });
}

const AGENCY_DIRECT = '__direct__'; // 드롭다운 특수항목: 직접입력

const agencies = ref<BidAgency[]>([]);
const notices = ref<BidNotice[]>([]);
const totalCount = ref(0);
const loading = ref(false);
const loadError = ref<string | null>(null);
const searched = ref(false); // 한 번이라도 조회했는지(초기 vs 결과 없음 구분)

const apiMode = computed(() => !!window.API_BASE);

// --- 필터 상태 (전부 서버 파라미터) ---
const selectedAgency = ref<string>(''); // '' = 전체(기관 무필터). 기관명 또는 특수항목(직접입력).
const directAgency = ref('');                       // "직접입력" 선택 시 자유텍스트
const noticeType = ref<BidNoticeType>('all');
const keyword = ref('');
const bgngDt = ref(''); // <input type="date"> → yyyy-MM-dd
const endDt = ref('');

// --- 페이징 ---
const page = ref(1);
const numOfRows = ref(10);
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / numOfRows.value)));

const isDirect = computed(() => selectedAgency.value === AGENCY_DIRECT);

// 사전규격은 백엔드 미확정(게이트 off) → 옵션은 노출하되 선택 시 안내.
const preSpecSelected = computed(() => noticeType.value === 'pre_spec');

const NOTICE_TYPE_LABEL: Record<'main' | 'pre_spec', string> = {
  main: '본공고',
  pre_spec: '사전규격',
};

// 조회에 사용할 기관명: 직접입력이면 자유텍스트, 아니면 선택값. 빈 문자열이면 미전달(전체 기관).
function resolveAgency(): string {
  return isDirect.value ? directAgency.value.trim() : selectedAgency.value.trim();
}

// <input type="date">(yyyy-MM-dd) → 백엔드 파라미터는 yyyyMMdd(8자리).
//   HHmm(시작 0000 / 종료 2359)은 백엔드(MainNoticeSource)가 붙인다. 빈 값이면 undefined(백엔드 최근 30일).
function toG2bDt(date: string): string | undefined {
  const d = date.trim();
  if (!d) return undefined;
  const digits = d.replace(/-/g, '');
  if (digits.length !== 8) return undefined;
  return digits;
}

async function runSearch() {
  if (!apiMode.value) return;
  loading.value = true;
  loadError.value = null;
  try {
    const result = await dataClient.bidNotices.search({
      agency: resolveAgency() || undefined,
      noticeType: noticeType.value,
      keyword: keyword.value.trim() || undefined,
      bgngDt: toG2bDt(bgngDt.value),
      endDt: toG2bDt(endDt.value),
      page: page.value,
      numOfRows: numOfRows.value,
    });
    notices.value = result.notices;
    totalCount.value = result.totalCount;
    searched.value = true;
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
    notices.value = [];
    totalCount.value = 0;
  } finally {
    loading.value = false;
  }
}

// 필터 변경으로 조회 → 1페이지부터. (페이징 이동은 goPage로 page만 바꿔 재조회)
function search() {
  page.value = 1;
  void runSearch();
}

function goPage(p: number) {
  if (p < 1 || p > totalPages.value || p === page.value) return;
  page.value = p;
  void runSearch();
}

// 배치8 — 페이지당 건수(numOfRows) 변경 → 1페이지부터 서버 재조회.
function changePageSize(size: number) {
  numOfRows.value = size;
  page.value = 1;
  void runSearch();
}

// 절대 순번 — 서버 페이징이므로 (현재페이지-1)*numOfRows + index + 1.
const rowNo = (index: number) => absoluteRowNo(page.value, numOfRows.value, index);

function budgetText(v: number): string {
  return v ? v.toLocaleString('ko-KR') + ' 원' : '—';
}

// 공고일/마감일은 백엔드가 yyyy-MM-dd 또는 "-"를 준다. "-"·빈값은 대시로 통일.
function dateText(v: string): string {
  return v && v !== '-' ? v : '—';
}

onMounted(async () => {
  if (!apiMode.value) return;
  try {
    agencies.value = await dataClient.bidNotices.agencies();
    // 기본 선택은 '전체'(빈 값) 유지 — 첫 화면에서 전 기관 공고를 보여준다.
  } catch (e) {
    // 기관 목록 실패는 치명적이지 않음 — 직접입력으로 폴백 가능. 조회 시 오류가 별도 표시된다.
    loadError.value = e instanceof Error ? e.message : String(e);
  }
  void runSearch();
});
</script>

<template>
  <div>
    <h1 class="title">나라장터 공고조회</h1>
    <p class="sub">입찰 대상기관·공고유형으로 나라장터 공고를 조회합니다 — 행을 클릭하면 인앱 상세에서 확인하고 입찰 프로젝트로 등록할 수 있습니다.</p>

    <div class="filters">
      <!-- 기관 · 공고유형 -->
      <div class="frow">
        <label class="field">
          <span class="flabel">기관</span>
          <select v-model="selectedAgency" class="in" :disabled="!apiMode" @change="search">
            <option value="">전체</option>
            <option v-for="a in agencies" :key="a.id" :value="a.agencyName">{{ a.agencyName }}</option>
            <option :value="AGENCY_DIRECT">직접입력</option>
          </select>
        </label>
        <label v-if="isDirect" class="field">
          <span class="flabel">기관명 직접입력</span>
          <input
            v-model="directAgency"
            class="in"
            type="search"
            placeholder="기관명(비우면 전체 기관)"
            :disabled="!apiMode"
            @keyup.enter="search"
          />
        </label>

        <div class="field">
          <span class="flabel">공고유형</span>
          <div class="types" role="group" aria-label="공고유형">
            <button class="ttab" :class="{ on: noticeType === 'all' }" :disabled="!apiMode" @click="noticeType = 'all'; search()">전체</button>
            <button class="ttab" :class="{ on: noticeType === 'main' }" :disabled="!apiMode" @click="noticeType = 'main'; search()">본공고</button>
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

      <!-- 검색어 · 기간 -->
      <div class="frow search-row">
        <label class="field grow">
          <span class="flabel">검색어</span>
          <input v-model="keyword" class="in" type="search" placeholder="공고명 키워드" :disabled="!apiMode" @keyup.enter="search" />
        </label>
        <label class="field">
          <span class="flabel">공고일(시작)</span>
          <input v-model="bgngDt" class="in" type="date" :disabled="!apiMode" />
        </label>
        <label class="field">
          <span class="flabel">공고일(종료)</span>
          <input v-model="endDt" class="in" type="date" :disabled="!apiMode" />
        </label>
        <div class="btns">
          <button class="btn btn-primary" :disabled="!apiMode || loading" @click="search">조회</button>
        </div>
      </div>
      <p class="hint">기간을 비우면 최근 30일을 조회합니다.</p>
    </div>

    <div v-if="!apiMode" class="notice">
      나라장터 공고조회는 백엔드(API_BASE) 연결 후에만 가능합니다 — 레거시(Supabase)에는 나라장터 연동이 없습니다.
    </div>
    <template v-else>
      <div v-if="preSpecSelected" class="notice warn">
        사전규격 조회는 현재 준비중입니다(백엔드 연동 미확정) — 결과가 비어 있을 수 있습니다. 본공고 또는 전체로 조회하세요.
      </div>

      <div class="result-head" v-if="searched && !loading && !loadError">
        <span class="count">총 <strong>{{ totalCount.toLocaleString('ko-KR') }}</strong>건</span>
        <PageSizeSelect :model-value="numOfRows" @update:model-value="changePageSize" />
      </div>

      <div v-if="loading" class="notice">불러오는 중…</div>
      <div v-else-if="loadError" class="notice">
        공고를 불러오지 못했습니다.
        <span class="detail">({{ loadError }})</span>
      </div>
      <div v-else-if="notices.length === 0" class="notice">
        {{ searched ? '조건에 맞는 공고가 없습니다.' : '조회 조건을 입력하고 조회하세요.' }}
      </div>
      <template v-else>
        <table class="grid">
          <thead>
            <tr>
              <th class="no">No.</th><th>공고번호</th><th>유형</th><th>공고명</th><th>기관</th>
              <th>공고일</th><th>마감일</th><th class="num">예산</th><th>상세</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(n, idx) in notices"
              :key="`${n.noticeType}-${n.announcementNo}`"
              class="row"
              @click="openDetail(n)"
            >
              <td class="no">{{ rowNo(idx) }}</td>
              <td class="mono">{{ n.announcementNo || '—' }}</td>
              <td>
                <span class="badge" :class="n.noticeType">{{ NOTICE_TYPE_LABEL[n.noticeType] ?? n.noticeType }}</span>
              </td>
              <td class="name">{{ n.name || '—' }}</td>
              <td>{{ n.customer || '—' }}</td>
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
          :page="page" :total-pages="totalPages" :total="totalCount" :disabled="loading"
          @update:page="goPage"
        />
      </template>
    </template>
  </div>
</template>

<style scoped>
.title { font-size: 20px; margin: 0 0 4px; }
.sub { color: var(--muted); font-size: 13px; margin: 0 0 20px; }

.filters {
  border: 1px solid var(--border); border-radius: 10px; background: var(--panel);
  padding: 14px 16px; margin-bottom: 18px; display: flex; flex-direction: column; gap: 12px;
}
.frow { display: flex; align-items: flex-end; gap: 14px; flex-wrap: wrap; }
.field { display: flex; flex-direction: column; gap: 5px; }
.field.grow { flex: 1 1 260px; }
.flabel { font-size: 12px; font-weight: 600; color: var(--muted); }

.in {
  background: var(--panel-2, var(--panel)); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); font-size: 13px; padding: 7px 11px; min-width: 150px; outline: none;
}
.in:focus { border-color: var(--accent); }
.field.grow .in { width: 100%; }

.types { display: flex; gap: 3px; background: var(--panel-2); border: 1px solid var(--border); border-radius: 8px; padding: 3px; }
.ttab {
  border: 0; background: transparent; color: var(--muted);
  font-size: 12px; font-weight: 600; padding: 5px 12px; border-radius: 6px; cursor: pointer;
  display: inline-flex; align-items: center; gap: 5px;
}
.ttab.on { background: var(--accent); color: #fff; }
.ttab:disabled { opacity: 0.5; cursor: not-allowed; }
.soon {
  font-size: 9px; font-weight: 700; letter-spacing: 0.02em;
  border: 1px solid currentColor; border-radius: 999px; padding: 0 5px; opacity: 0.75;
}

.search-row { border-top: 1px solid var(--border); padding-top: 12px; }
.btns { margin-left: auto; }
.hint { margin: 0; font-size: 12px; color: var(--muted); opacity: 0.85; }

.notice {
  padding: 16px; border-radius: 8px;
  background: var(--panel); border: 1px solid var(--border); color: var(--muted); font-size: 13px;
}
.notice.warn { border-color: var(--accent); }
.notice.ok { border-color: var(--accent); color: var(--text); margin-bottom: 12px; }
.notice .detail { opacity: 0.7; }

.result-head { display: flex; align-items: center; justify-content: space-between; margin: 0 0 10px; }
.count { font-size: 13px; color: var(--muted); }
.count strong { color: var(--text); }

.grid { border-collapse: collapse; width: 100%; font-size: 13px; }
.grid th, .grid td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border); vertical-align: top; }
.grid th { color: var(--muted); font-weight: 600; font-size: 12px; }
.grid .num { text-align: right; white-space: nowrap; }
.grid .no { width: 48px; text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.grid .name { font-weight: 600; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; white-space: nowrap; }

.badge {
  display: inline-block; font-size: 11px; font-weight: 600; padding: 1px 8px; border-radius: 999px;
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
  font-size: 13px; font-weight: 600; padding: 0; cursor: pointer;
}
.btn-link:hover { text-decoration: underline; }
</style>
