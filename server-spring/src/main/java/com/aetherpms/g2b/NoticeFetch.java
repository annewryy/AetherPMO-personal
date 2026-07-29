package com.aetherpms.g2b;

import java.util.List;

/**
 * 소스 1회 수집 결과 (설계 0016 §B).
 *
 * <p>수집은 {@code MAX_COLLECT_PAGES × 100}건에서 끊는다(응답지연 방지). 그래서 우리가 들고 있는
 * {@code items}는 나라장터가 실제로 가진 건수({@code sourceTotal})보다 적을 수 있다.
 * 이 둘을 분리해 들고 다녀야 화면에서 "총 N건 중 상위 M건만 표시"를 정직하게 말할 수 있다
 * — 예전엔 수집분만 세어 totalCount로 내보내서, 5,000건짜리 조회가 300건으로 보였다.
 *
 * @param items       실제로 수집한 공고(상한에서 잘렸을 수 있음)
 * @param sourceTotal 나라장터가 보고한 전체 건수(응답 totalCount). 알 수 없으면 items.size().
 */
public record NoticeFetch(List<BidNotice> items, int sourceTotal) {

    public static NoticeFetch empty() {
        return new NoticeFetch(List.of(), 0);
    }

    /** 상한에 걸려 일부만 들고 있는지. */
    public boolean truncated() {
        return sourceTotal > items.size();
    }
}
