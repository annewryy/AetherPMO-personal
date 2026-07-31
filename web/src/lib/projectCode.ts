// 사업번호(project_code) 입력 + 중복 확인 — 생성/수정/수행전환 폼이 공유한다.
//   2026-07-29: 자동 발번을 폐지하고 사용자가 직접 입력하는 체계로 바꾸면서 추가.
//   여기 확인은 편의용 선행 체크일 뿐이고, 진짜 방어선은 저장 시 서버의 UNIQUE + 409다.
import { ref, computed, watch, onUnmounted } from 'vue';
import { dataClient } from './dataClient';

export type CodeCheckState = 'empty' | 'checking' | 'ok' | 'taken' | 'error';

/**
 * @param excludeId 수정 화면에서 자기 자신을 중복으로 치지 않기 위한 프로젝트 id(생성 시 undefined).
 * @param required  사업번호 필수 여부. 기본 true. 입찰 단계는 사업번호가 수주 후에 나오므로
 *                  false로 넘겨 미입력을 허용한다(2026-07-29). 단계가 바뀌는 폼을 위해 함수로 받는다.
 */
export function useProjectCode(
  excludeId?: () => number | undefined,
  required: () => boolean = () => true,
) {
  const code = ref('');
  const state = ref<CodeCheckState>('empty');
  const message = ref('');

  let timer: ReturnType<typeof setTimeout> | undefined;
  // 응답 경쟁 방지 — 늦게 도착한 이전 요청이 최신 결과를 덮어쓰지 않게 순번을 센다.
  let seq = 0;

  async function check(): Promise<void> {
    const value = code.value.trim();
    if (!value) {
      state.value = 'empty';
      message.value = '';
      return;
    }
    const mine = ++seq;
    state.value = 'checking';
    message.value = '확인 중…';
    try {
      const r = await dataClient.projects.codeAvailable(value, excludeId?.());
      if (mine !== seq) return; // 더 최신 입력이 있었다 — 이 응답은 버린다
      state.value = r.available ? 'ok' : 'taken';
      message.value = r.available ? '사용 가능한 사업번호입니다.' : (r.reason ?? '이미 사용 중인 사업번호입니다.');
    } catch (e) {
      if (mine !== seq) return;
      state.value = 'error';
      message.value = e instanceof Error ? e.message : String(e);
    }
  }

  watch(code, () => {
    state.value = code.value.trim() ? 'checking' : 'empty';
    message.value = '';
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { void check(); }, 400);
  });

  onUnmounted(() => { if (timer) clearTimeout(timer); });

  /**
   * 저장 버튼 활성 조건 — 중복이 아닐 것(확인 중/오류는 통과시키고 서버가 최종 판정).
   * 필수 모드에선 비어 있지 않아야 한다. 선택 모드(입찰)에선 빈 값도 통과.
   */
  const canSubmit = computed(() =>
    state.value !== 'taken' && (!required() || !!code.value.trim()));

  return { code, state, message, canSubmit, check };
}
