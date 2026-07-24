<script setup lang="ts">
// 나라장터 공고 상세 — 전체 페이지 (0017 §A 재설계).
//  리스트(BidNoticeSearchView) 행 클릭 → 이 라우트(/bid-notices/:bidNtceNo)로 이동. 드로어 폐기.
//  dataClient.bidNotices.detail(no)로 단건 리치 상세(inqryDiv=2 풀필드)를 조회하고 섹션으로 구성한다.
//  섹션: 개요 / 기관 / 방식·방법 / 일정 / 금액 / 제한 / 담당자 / 분류 / 규격서 첨부.
//   값 없는 필드/섹션은 우아하게 생략(더미데이터 금지 — [[no-dummy-data]]).
//  상단 "← 목록으로"(뒤로/목록), 우측 상단 "입찰 프로젝트 등록"(중앙 모달 3스텝 마법사).
//  성공 시 마법사가 emit('created') → 모달 닫고 /projects 이동 + 안내.
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { dataClient } from '../lib/dataClient';
import type { BidNoticeDetail, Project } from '../types';
import BidProjectCreateWizard from '../components/BidProjectCreateWizard.vue';

const props = defineProps<{ bidNtceNo: string }>();
const router = useRouter();

const apiMode = computed(() => !!window.API_BASE);

const detail = ref<BidNoticeDetail | null>(null);
const loading = ref(false);
const loadError = ref<string | null>(null);

const showWizard = ref(false);

// 값 유틸: 문자열 null/공백/"-"은 미표시로 통일.
const has = (v: string | number | null | undefined): boolean =>
  v != null && !(typeof v === 'string' && (v.trim() === '' || v.trim() === '-'));
const dash = (v: string | null | undefined) => (has(v) ? String(v) : '—');
const money = (v: number | null): string => (v ? v.toLocaleString('ko-KR') + ' 원' : '—');
// Y/N 플래그 → 한글. 그 외 값은 원문.
const ynText = (v: string | null): string => (v === 'Y' ? '예' : v === 'N' ? '아니오' : dash(v));

// 섹션별 표시 여부 — 그 섹션에 실제 값이 하나라도 있어야 렌더(더미 금지).
type Row = { label: string; value: string; mono?: boolean };

function rows(entries: Array<[string, string | number | null | undefined, boolean?]>): Row[] {
  return entries
    .filter(([, v]) => has(v as string | number | null | undefined))
    .map(([label, v, mono]) => ({ label, value: String(v), mono: !!mono }));
}

const overviewRows = computed<Row[]>(() => {
  const d = detail.value;
  if (!d) return [];
  return rows([
    ['공고번호', d.announcementNo, true],
    ['공고차수', d.noticeOrder],
    ['공고종류', d.noticeKindName],
    ['등록유형', d.registerTypeName],
    ['재공고여부', d.reNoticeYn ? ynText(d.reNoticeYn) : null],
    ['국제입찰여부', d.intlBidYn ? ynText(d.intlBidYn) : null],
    ['참조번호', d.refNo, true],
    ['등록일시', d.registerDate],
    ['변경일시', d.changeDate],
    ['변경공고사유', d.changeNoticeReason],
    ['사전규격등록번호', d.preSpecRegisterNo, true],
    ['통합공고번호', d.unifiedNoticeNo, true],
    ['발주계획통합번호', d.orderPlanUnifiedNo, true],
  ]);
});

const agencyRows = computed<Row[]>(() => {
  const d = detail.value;
  if (!d) return [];
  return rows([
    ['공고기관', d.noticeAgencyName],
    ['공고기관코드', d.noticeAgencyCode, true],
    ['수요기관', d.demandAgencyName ?? d.customer],
    ['수요기관코드', d.demandAgencyCode, true],
  ]);
});

const methodRows = computed<Row[]>(() => {
  const d = detail.value;
  if (!d) return [];
  return rows([
    ['입찰방식', d.bidMethodName],
    ['계약체결방법', d.contractMethodName],
    ['낙찰방법', d.bidwinnerMethodName],
    ['낙찰방법적용기준', d.bidwinnerMethodAppStd],
    ['용역구분', d.serviceDivName],
  ]);
});

const scheduleRows = computed<Row[]>(() => {
  const d = detail.value;
  if (!d) return [];
  return rows([
    ['입찰공고일시', d.publishDate],
    ['입찰참가자격등록마감', d.bidQlfctRegisterDeadline],
    ['입찰개시일시', d.bidBeginDate],
    ['입찰마감일시', d.endDate],
    ['개찰일시', d.openingDate],
    ['개찰장소', d.openingPlace],
    ['설명회일시', d.briefingDate],
    ['설명회장소', d.briefingPlace],
  ]);
});

const moneyRows = computed<Row[]>(() => {
  const d = detail.value;
  if (!d) return [];
  return rows([
    ['배정예산금액', has(d.assignBudgetAmount) ? money(d.assignBudgetAmount) : null],
    ['추정가격', has(d.estimatedPrice) ? money(d.estimatedPrice) : null],
    ['부가가치세', has(d.vat) ? money(d.vat) : null],
    ['낙찰하한율', has(d.bidwinnerLowerRate) ? `${d.bidwinnerLowerRate}%` : null],
  ]);
});

const limitRows = computed<Row[]>(() => {
  const d = detail.value;
  if (!d) return [];
  const regions = (d.jointContractDutyRegions ?? []).filter(Boolean);
  return rows([
    ['업종제한여부', d.industryLimitYn ? ynText(d.industryLimitYn) : null],
    ['입찰참가제한여부', d.bidParticipationLimitYn ? ynText(d.bidParticipationLimitYn) : null],
    ['지역제한판단기준', d.regionLimitJudgeName],
    ['공동도급의무지역', regions.length ? regions.join(', ') : null],
  ]);
});

const officialRows = computed<Row[]>(() => {
  const d = detail.value;
  if (!d) return [];
  return rows([
    ['공고기관담당자', d.noticeAgencyOfficialName],
    ['담당자 전화', d.noticeAgencyOfficialTel],
    ['담당자 이메일', d.noticeAgencyOfficialEmail],
    ['수요기관담당자 이메일', d.demandAgencyOfficialEmail],
    ['집행관', d.executiveName],
  ]);
});

const classRows = computed<Row[]>(() => {
  const d = detail.value;
  if (!d) return [];
  return rows([
    ['공공조달 대분류', d.pubProcurementLargeClassName],
    ['공공조달 중분류', d.pubProcurementMidClassName],
    ['공공조달 분류', d.pubProcurementClassName],
    ['공공조달 분류번호', d.pubProcurementClassNo, true],
  ]);
});

// 규격서 첨부(URL + 파일명). url 또는 fileName 중 하나라도 있으면 표시.
const specDocs = computed(() =>
  (detail.value?.specDocs ?? []).filter((s) => has(s.url) || has(s.fileName)),
);

// 원문 링크(중복 제거): 상세 URL 우선.
const origUrl = computed(() => detail.value?.noticeDetailUrl || detail.value?.url || detail.value?.noticeUrl || null);
const stdDocUrl = computed(() => detail.value?.stdNoticeDocUrl || null);

async function load() {
  if (!apiMode.value) return;
  loading.value = true;
  loadError.value = null;
  detail.value = null;
  try {
    detail.value = await dataClient.bidNotices.detail(props.bidNtceNo);
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

function goBack() {
  // 브라우저 히스토리에 이전 항목이 있으면 뒤로, 없으면 목록으로.
  if (window.history.length > 1) router.back();
  else void router.push('/bid-notices');
}

function onCreated(project: Project) {
  showWizard.value = false;
  // 생성 후 입찰단계 목록으로 이동 + 안내(0017 §C-2, 0025 라우트). 쿼리로 성공 메시지 전달.
  void router.push({
    path: '/projects/bidding',
    query: { created: `${project.name} (${project.projectCode})` },
  });
}

onMounted(load);
watch(() => props.bidNtceNo, load);
</script>

<template>
  <div>
    <div class="topbar">
      <button class="back" type="button" @click="goBack">← 목록으로</button>
      <button
        v-if="detail"
        class="btn btn-primary"
        type="button"
        @click="showWizard = true"
      >입찰 프로젝트 등록</button>
    </div>

    <div v-if="!apiMode" class="notice">
      공고 상세는 백엔드(API_BASE) 연결 후에만 조회할 수 있습니다 — 레거시(Supabase)에는 나라장터 연동이 없습니다.
    </div>
    <div v-else-if="loading" class="notice">불러오는 중…</div>
    <div v-else-if="loadError" class="notice err">
      공고 상세를 불러오지 못했습니다. <span class="detail">({{ loadError }})</span>
    </div>
    <template v-else-if="detail">
      <header class="head">
        <h1 class="pname">{{ dash(detail.name) }}</h1>
        <div class="ptags">
          <span class="badge main">본공고</span>
          <span v-if="has(detail.announcementNo)" class="tag mono">{{ detail.announcementNo }}</span>
          <span v-if="has(detail.demandAgencyName ?? detail.customer)" class="tag">
            {{ detail.demandAgencyName ?? detail.customer }}
          </span>
        </div>
      </header>

      <div class="sections">
        <section v-if="overviewRows.length" class="sec">
          <h2 class="sec-title">개요</h2>
          <dl class="kv">
            <div v-for="r in overviewRows" :key="r.label"><dt>{{ r.label }}</dt><dd :class="{ mono: r.mono }">{{ r.value }}</dd></div>
          </dl>
        </section>

        <section v-if="agencyRows.length" class="sec">
          <h2 class="sec-title">기관</h2>
          <dl class="kv">
            <div v-for="r in agencyRows" :key="r.label"><dt>{{ r.label }}</dt><dd :class="{ mono: r.mono }">{{ r.value }}</dd></div>
          </dl>
        </section>

        <section v-if="methodRows.length" class="sec">
          <h2 class="sec-title">방식 · 방법</h2>
          <dl class="kv">
            <div v-for="r in methodRows" :key="r.label"><dt>{{ r.label }}</dt><dd :class="{ mono: r.mono }">{{ r.value }}</dd></div>
          </dl>
        </section>

        <section v-if="scheduleRows.length" class="sec">
          <h2 class="sec-title">일정</h2>
          <dl class="kv">
            <div v-for="r in scheduleRows" :key="r.label"><dt>{{ r.label }}</dt><dd :class="{ mono: r.mono }">{{ r.value }}</dd></div>
          </dl>
        </section>

        <section v-if="moneyRows.length" class="sec">
          <h2 class="sec-title">금액</h2>
          <dl class="kv">
            <div v-for="r in moneyRows" :key="r.label"><dt>{{ r.label }}</dt><dd :class="{ mono: r.mono }">{{ r.value }}</dd></div>
          </dl>
        </section>

        <section v-if="limitRows.length" class="sec">
          <h2 class="sec-title">제한</h2>
          <dl class="kv">
            <div v-for="r in limitRows" :key="r.label"><dt>{{ r.label }}</dt><dd :class="{ mono: r.mono }">{{ r.value }}</dd></div>
          </dl>
        </section>

        <section v-if="officialRows.length" class="sec">
          <h2 class="sec-title">담당자</h2>
          <dl class="kv">
            <div v-for="r in officialRows" :key="r.label"><dt>{{ r.label }}</dt><dd :class="{ mono: r.mono }">{{ r.value }}</dd></div>
          </dl>
        </section>

        <section v-if="classRows.length" class="sec">
          <h2 class="sec-title">분류</h2>
          <dl class="kv">
            <div v-for="r in classRows" :key="r.label"><dt>{{ r.label }}</dt><dd :class="{ mono: r.mono }">{{ r.value }}</dd></div>
          </dl>
        </section>

        <section v-if="specDocs.length || stdDocUrl" class="sec">
          <h2 class="sec-title">규격서 첨부</h2>
          <ul class="docs">
            <li v-for="(doc, i) in specDocs" :key="i" class="doc">
              <a v-if="has(doc.url)" :href="doc.url!" target="_blank" rel="noopener noreferrer" class="link">
                {{ doc.fileName || '규격서 파일' }} ↗
              </a>
              <span v-else class="doc-name">{{ doc.fileName }}</span>
            </li>
            <li v-if="stdDocUrl" class="doc">
              <a :href="stdDocUrl" target="_blank" rel="noopener noreferrer" class="link">표준공고서 ↗</a>
            </li>
          </ul>
        </section>
      </div>

      <p v-if="origUrl" class="orig">
        <a :href="origUrl" target="_blank" rel="noopener noreferrer" class="link">나라장터 원문 ↗</a>
      </p>
    </template>

    <!-- 입찰 프로젝트 등록 — 중앙 모달 3스텝 마법사 (0017 §C-2) -->
    <BidProjectCreateWizard
      v-if="showWizard && detail"
      :notice="detail"
      @close="showWizard = false"
      @created="onCreated"
    />
  </div>
</template>

<style scoped>
.topbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
.back {
  border: 1px solid var(--border); background: var(--panel-2); color: var(--text);
  font-size: 13px; font-weight: 600; padding: 7px 14px; border-radius: 8px; cursor: pointer;
}
.back:hover { border-color: var(--accent); }
.btn {
  border: 1px solid var(--border); background: var(--panel-2); color: var(--text);
  font-size: 13px; font-weight: 600; padding: 8px 18px; border-radius: 8px; cursor: pointer;
}
.btn-primary { background: var(--accent); color: #fff; border-color: var(--accent); }

.head { margin-bottom: 22px; }
.pname { font-size: 22px; margin: 0 0 10px; line-height: 1.3; }
.ptags { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.badge {
  display: inline-block; font-size: 11px; font-weight: 600; padding: 2px 9px; border-radius: 999px;
  border: 1px solid var(--border); color: var(--muted); white-space: nowrap;
}
.badge.main { background: var(--accent); color: #fff; border-color: var(--accent); }
.tag {
  font-size: 12px; padding: 2px 10px; border-radius: 999px;
  background: var(--panel-2); color: var(--muted); border: 1px solid var(--border);
}

.sections { display: flex; flex-direction: column; gap: 20px; }
.sec {
  border: 1px solid var(--border); border-radius: 12px; background: var(--panel);
  padding: 16px 20px;
}
.sec-title {
  font-size: 13px; font-weight: 700; color: var(--muted); margin: 0 0 14px;
  text-transform: none; letter-spacing: 0.01em;
}
.kv { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 32px; margin: 0; }
.kv > div { min-width: 0; }
.kv dt { color: var(--muted); font-size: 11px; margin-bottom: 3px; }
.kv dd { margin: 0; font-size: 14px; color: var(--text); word-break: break-word; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; }

.docs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.doc { font-size: 13px; }
.doc-name { color: var(--text); }
.link { color: var(--accent); text-decoration: none; font-weight: 600; }
.link:hover { text-decoration: underline; }

.orig { margin: 20px 0 0; }

.notice {
  padding: 16px; border-radius: 8px;
  background: var(--panel); border: 1px solid var(--border); color: var(--muted); font-size: 13px;
}
.notice.err { border-color: var(--danger, #c0392b); color: var(--danger, #c0392b); }
.notice .detail { opacity: 0.75; }

@media (max-width: 640px) {
  .kv { grid-template-columns: 1fr; }
}
</style>
