<script setup lang="ts">
// 0033 §6 — 관리자 알림 기준(SYS_ADMIN): 개인 설정(사용자 메뉴)보다 우선하는 전역 정책.
//   ① 유형별 전역 차단(끄면 시스템 전체 미발송) ② 입찰 단계 억제(지정 상태 도달 전에는
//   멘션·답글 외 알림을 보내지 않음 — 예: 제안제출 전 담당 지정 알림 억제).
//   저장소: pms_app_setting 'notification.policy' JSON — NotificationService가 발송 시 판정.
import { onMounted, ref } from 'vue';
import { dataClient } from '../../lib/dataClient';

const TYPES: { key: string; label: string; desc: string }[] = [
  { key: 'ASSIGNED', label: '담당 지정', desc: '태스크·액션아이템·이슈·산출물 담당자로 지정' },
  { key: 'PROJECT_ASSIGNED', label: '프로젝트 투입', desc: '참여인력 등록' },
  { key: 'MENTION', label: '멘션', desc: '코멘트 @멘션' },
  { key: 'REPLY', label: '답글', desc: '내 코멘트에 답글' },
  { key: 'COMMENT_ON_MINE', label: '내 항목 코멘트', desc: '내 담당 항목에 코멘트' },
  { key: 'STATUS_CHANGED', label: '반려', desc: '담당 항목 반려 전이' },
  { key: 'DUE_SOON', label: '마감 임박', desc: '마감 D-1·당일 (일 1회)' },
  { key: 'OVERDUE', label: '기한 경과', desc: '기한 초과 (일 1회)' },
  { key: 'RULE_RISK', label: '자동 리스크', desc: '규칙 발동 리스크 자동 등록 (PM)' },
];
const BID_OPTIONS = [
  { value: '', label: '억제 안 함 (항상 발송)' },
  { value: '제안제출', label: '제안제출 도달 전 억제' },
  { value: '결과대기', label: '결과대기 도달 전 억제' },
  { value: '수주', label: '수주 도달 전 억제' },
];

const enabled = ref<Record<string, boolean>>({});
const biddingMin = ref('');
const custom = ref(false);
const saving = ref(false);
const msg = ref('');
const err = ref('');

async function load() {
  for (const t of TYPES) enabled.value[t.key] = true;
  biddingMin.value = '';
  try {
    const r = await dataClient.adminSettings.get('notification.policy');
    const p = JSON.parse(r.value || '{}') as { disabledTypes?: string[]; biddingMinStatus?: string | null };
    for (const t of p.disabledTypes ?? []) enabled.value[t] = false;
    biddingMin.value = p.biddingMinStatus ?? '';
    custom.value = true;
  } catch {
    custom.value = false; // 정책 미설정 — 기본값(전부 발송, 억제 없음)
  }
}

async function save() {
  saving.value = true;
  msg.value = '';
  err.value = '';
  try {
    const policy: Record<string, unknown> = {
      disabledTypes: TYPES.filter((t) => !enabled.value[t.key]).map((t) => t.key),
    };
    if (biddingMin.value) policy.biddingMinStatus = biddingMin.value;
    await dataClient.adminSettings.put('notification.policy', JSON.stringify(policy));
    custom.value = true;
    msg.value = '저장됨 — 이후 발송분부터 즉시 적용됩니다.';
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e);
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <h2 class="sect">알림 기준 <span class="badge">{{ custom ? '사용자 설정' : '기본값' }}</span></h2>
    <p class="desc">
      시스템 전역 알림 정책입니다 — <b>개인 알림 설정보다 우선</b>합니다(전역으로 끈 유형은
      개인이 켜도 발송되지 않습니다). 개인별 on/off는 각 사용자가 상단 메뉴 &gt; 알림 설정에서 조정합니다.
    </p>

    <section class="card">
      <h3 class="card-title">유형별 전역 발송</h3>
      <div class="grid">
        <label v-for="t in TYPES" :key="t.key" class="row">
          <input v-model="enabled[t.key]" type="checkbox" :disabled="saving" />
          <span class="lbl">{{ t.label }}</span>
          <span class="hint">{{ t.desc }}</span>
        </label>
      </div>
    </section>

    <section class="card">
      <h3 class="card-title">입찰 단계 억제</h3>
      <p class="hint block">
        입찰 프로젝트는 선택한 상태에 <b>도달하기 전</b>에는 멘션·답글을 제외한 알림
        (담당 지정·마감 등)을 보내지 않습니다. 초기 검토 단계의 잦은 담당 변경 소음을 줄입니다.
      </p>
      <select v-model="biddingMin" class="sel" :disabled="saving">
        <option v-for="o in BID_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
    </section>

    <div class="actions">
      <button class="btn btn-primary" :disabled="saving" @click="save">기준 저장</button>
      <span v-if="msg" class="ok">{{ msg }}</span>
      <span v-if="err" class="err">{{ err }}</span>
    </div>
  </div>
</template>

<style scoped>
.sect { font-size: 17px; margin: 0 0 4px; display: flex; align-items: center; gap: 8px; }
.badge {
  font-size: 11px; font-weight: 600; padding: 1px 8px; border-radius: 999px;
  border: 1px solid var(--border); color: var(--muted);
}
.desc { color: var(--muted); font-size: 13px; margin: 0 0 14px; max-width: 640px; }
.card {
  border: 1px solid var(--border); border-radius: 10px; background: var(--panel);
  padding: 12px 14px; margin-bottom: 12px;
}
.card-title { font-size: 14px; margin: 0 0 10px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 8px 18px; }
.row { display: grid; grid-template-columns: 18px 96px 1fr; gap: 8px; align-items: baseline; cursor: pointer; }
.lbl { font-size: 13px; font-weight: 600; }
.hint { font-size: 12px; color: var(--muted); }
.hint.block { margin: 0 0 10px; max-width: 560px; }
.sel {
  background: var(--panel-2, var(--panel)); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); font-size: 13px; padding: 7px 10px; font-family: inherit; min-width: 240px;
}
.actions { display: flex; align-items: center; gap: 10px; margin-top: 4px; }
.ok { font-size: 13px; color: var(--green); }
.err { font-size: 13px; color: var(--red); }
</style>
