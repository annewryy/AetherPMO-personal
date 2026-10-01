package com.aetherpms.g2b;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 공고 조회 오케스트레이션 유닛 테스트 (외부 API는 스텁 소스로 대체 — 실제 호출 금지).
 * 다중 기관 OR 검색 · 수요기관 매칭 · 날짜분할 · 최신순 정렬 · dedup · 캐시 · 페이징 검증.
 */
class G2bNoticeServiceTest {

    private G2bProperties propsWithKey() {
        G2bProperties p = new G2bProperties();
        p.setServiceKey("TEST-KEY");
        p.setCacheTtlSeconds(300);
        return p;
    }

    private static class StubSource implements G2bNoticeSource {
        final String type;
        final List<BidNotice> data;
        final AtomicInteger calls = new AtomicInteger();
        boolean enabled = true;
        int sourceTotal = -1;
        StubSource(String type, List<BidNotice> data) { this.type = type; this.data = data; }
        public String noticeType() { return type; }
        public boolean isEnabled() { return enabled; }
        public NoticeFetch fetch(BidNoticeQuery q) {
            calls.incrementAndGet();
            return new NoticeFetch(data, sourceTotal < 0 ? data.size() : sourceTotal);
        }
    }

    private static BidNotice main(String no, String name, String customer, String date) {
        return new BidNotice(no, "main", name, customer, date, "2026-10-10", 1000, "#");
    }

    private static BidNotice pre(String no, String name, String customer, String date) {
        return new BidNotice(no, "pre_spec", name, customer, date, "2026-10-10", 2000, "#");
    }

    @Test
    void serviceKeyMissing_throwsG2bException() {
        G2bProperties noKey = new G2bProperties();
        G2bNoticeService svc = new G2bNoticeService(List.of(), new G2bNoticeCache(noKey), noKey);
        BidNoticeQuery q = new BidNoticeQuery(List.of(), "all", null, "20260901", "20261001", 1, 10);
        assertThatThrownBy(() -> svc.search(q))
                .isInstanceOf(G2bException.class)
                .hasMessageContaining("인증키");
    }

    @Test
    @DisplayName("다중 수요기관 OR 검색: 여러 기관의 공고가 병합되고 최신순으로 정렬된다")
    void multiAgency_orSearch_mergesAndSortsByLatestDate() {
        G2bProperties p = propsWithKey();
        List<BidNotice> sampleData = List.of(
                main("N1", "정보자원 유지관리", "행정안전부 국가정보자원관리원", "2026-09-10"),
                main("N2", "클라우드 구축", "한국지역정보개발원", "2026-09-20"),
                main("N3", "인공지능 학습데이터", "한국지능정보사회진흥원", "2026-09-25"),
                main("N4", "홈택스 개편", "국세청", "2026-09-30"),
                main("N5", "통관시스템 고도화", "관세청", "2026-10-01"),
                main("OTHER", "시청사 청소용역", "서울특별시", "2026-09-15") // 매칭 안 되는 기관
        );

        StubSource m = new StubSource("main", sampleData);
        G2bNoticeService svc = new G2bNoticeService(List.of(m), new G2bNoticeCache(p), p);

        // 5개 기관 전체를 OR 조건으로 검색
        BidNoticeQuery q = new BidNoticeQuery(
                BidTargetAgency.DEFAULT_AGENCIES,
                "main",
                null,
                "20260901",
                "20261001",
                1,
                10
        );

        G2bNoticeService.Result r = svc.search(q);

        // 5개 기관 공고 5건만 포함되어야 하고, 서울특별시는 제외
        assertThat(r.totalCount()).isEqualTo(5);
        // 최신 공고일시 내림차순 정렬 확인 (2026-10-01 -> 2026-09-30 -> ... -> 2026-09-10)
        assertThat(r.items()).extracting(BidNotice::announcementNo)
                .containsExactly("N5", "N4", "N3", "N2", "N1");
    }

    @Test
    @DisplayName("수요기관 기준 필터링: 공고기관이 조달청이어도 수요기관이 관심기관이면 포함된다")
    void customerMatch_includedRegardlessOfNoticeAgency() {
        G2bProperties p = propsWithKey();
        // 수요기관이 '국가정보자원관리원 광주센터' (표기 차이 및 소속기관)
        List<BidNotice> sample = List.of(
                main("PPS1", "조달청 발주 전산망 사업", "국가정보자원관리원 광주센터", "2026-09-15")
        );
        StubSource m = new StubSource("main", sample);
        G2bNoticeService svc = new G2bNoticeService(List.of(m), new G2bNoticeCache(p), p);

        BidNoticeQuery q = new BidNoticeQuery(
                List.of("행정안전부 국가정보자원관리원"),
                "main",
                null,
                "20260901",
                "20261001",
                1,
                10
        );

        G2bNoticeService.Result r = svc.search(q);
        assertThat(r.totalCount()).isEqualTo(1);
        assertThat(r.items().get(0).announcementNo()).isEqualTo("PPS1");
    }

    @Test
    @DisplayName("전체 기관 전환: agencies가 비어있으면 전체 기관 공고가 조회된다")
    void allAgencies_whenAgenciesEmpty() {
        G2bProperties p = propsWithKey();
        List<BidNotice> sample = List.of(
                main("A1", "공고1", "서울대학교", "2026-09-15"),
                main("A2", "공고2", "국세청", "2026-09-20")
        );
        StubSource m = new StubSource("main", sample);
        G2bNoticeService svc = new G2bNoticeService(List.of(m), new G2bNoticeCache(p), p);

        BidNoticeQuery q = new BidNoticeQuery(List.of(), "main", null, "20260901", "20261001", 1, 10);
        G2bNoticeService.Result r = svc.search(q);
        assertThat(r.totalCount()).isEqualTo(2);
    }

    @Test
    @DisplayName("기간 분할 및 가드: 1개월(31일) 기간은 자동 분할되어 정상 조회되고, 95일 초과 시에만 가드 에러")
    void dateRange_oneMonthOk_andMaxExceedThrows() {
        G2bProperties p = propsWithKey();
        G2bNoticeService svc = new G2bNoticeService(List.of(), new G2bNoticeCache(p), p);

        // 31일 기간 (2026-07-01 ~ 2026-08-01): 정상 통과(자동 분할 처리)
        BidNoticeQuery q1 = new BidNoticeQuery(List.of(), "all", null, "20260701", "20260801", 1, 10);
        assertThat(svc.search(q1).totalCount()).isZero();

        // 95일 초과 (약 4개월) 시 가드 에러 발생
        BidNoticeQuery q2 = new BidNoticeQuery(List.of(), "all", null, "20260101", "20260501", 1, 10);
        assertThatThrownBy(() -> svc.search(q2))
                .isInstanceOf(G2bException.class)
                .hasMessageContaining("최대");
    }

    @Test
    @DisplayName("공고번호 기준 dedup 및 페이징 정확성 검증")
    void dedupAndPagination() {
        G2bProperties p = propsWithKey();
        List<BidNotice> data = new ArrayList<>();
        // 15개 생성 + 중복 5개
        for (int i = 1; i <= 15; i++) {
            data.add(main("A" + i, "공고" + i, "국세청", "2026-09-0" + (i % 9 + 1)));
        }
        data.add(main("A1", "중복공고", "국세청", "2026-09-01"));
        data.add(main("A2", "중복공고", "국세청", "2026-09-02"));

        StubSource m = new StubSource("main", data);
        G2bNoticeService svc = new G2bNoticeService(List.of(m), new G2bNoticeCache(p), p);

        // 1페이지(size=10)
        BidNoticeQuery q1 = new BidNoticeQuery(List.of("국세청"), "main", null, "20260901", "20261001", 1, 10);
        G2bNoticeService.Result r1 = svc.search(q1);
        assertThat(r1.totalCount()).isEqualTo(15);
        assertThat(r1.items()).hasSize(10);

        // 2페이지(size=10)
        BidNoticeQuery q2 = new BidNoticeQuery(List.of("국세청"), "main", null, "20260901", "20261001", 2, 10);
        G2bNoticeService.Result r2 = svc.search(q2);
        assertThat(r2.totalCount()).isEqualTo(15);
        assertThat(r2.items()).hasSize(5);
    }

    private static BidNotice mainWithOrder(String no, String order, String name, String customer, String date) {
        return new BidNotice(no, order, "main", name, customer, date, "2026-10-10", 1000, "#");
    }

    @Test
    @DisplayName("공고번호와 차수 보존: 동일한 공고번호라도 서로 다른 차수(00, 01)는 모두 보존되고 동일 차수 중복만 제거된다")
    void preserveNoticeOrders_inDedup() {
        G2bProperties p = propsWithKey();
        List<BidNotice> data = List.of(
                mainWithOrder("20261001", "00", "원공고", "국세청", "2026-09-01"),
                mainWithOrder("20261001", "01", "정정공고1", "국세청", "2026-09-05"),
                mainWithOrder("20261001", "00", "원공고 중복", "국세청", "2026-09-01"), // 동일 공고 동일 차수 중복
                mainWithOrder("20261002", "00", "다른공고", "국세청", "2026-09-02")
        );

        StubSource m = new StubSource("main", data);
        G2bNoticeService svc = new G2bNoticeService(List.of(m), new G2bNoticeCache(p), p);

        BidNoticeQuery q = new BidNoticeQuery(List.of("국세청"), "main", null, "20260901", "20261001", 1, 10);
        G2bNoticeService.Result r = svc.search(q);

        // 총 3건이어야 함 (20261001 차수 00, 20261001 차수 01, 20261002 차수 00)
        assertThat(r.totalCount()).isEqualTo(3);
        assertThat(r.items()).extracting(BidNotice::noticeOrder)
                .containsExactly("01", "00", "00");
    }

    @Test
    @DisplayName("2페이지 이상 대량 데이터 수집 사례: totalCount 150건 전체를 수집하고 truncated=false 검증")
    void multiPageCollection_twoPages_noTruncation() {
        G2bProperties p = propsWithKey();
        List<BidNotice> data = new ArrayList<>();
        // 150건 생성 (1페이지 100건 + 2페이지 50건 모사)
        for (int i = 1; i <= 150; i++) {
            data.add(main("BULK-" + i, "대량공고 " + i, "관세청", "2026-09-15"));
        }

        StubSource m = new StubSource("main", data);
        m.sourceTotal = 150;
        G2bNoticeService svc = new G2bNoticeService(List.of(m), new G2bNoticeCache(p), p);

        BidNoticeQuery q = new BidNoticeQuery(List.of("관세청"), "main", null, "20260901", "20261001", 1, 50);
        G2bNoticeService.Result r = svc.search(q);

        assertThat(r.totalCount()).isEqualTo(150);
        assertThat(r.sourceTotal()).isEqualTo(150);
        assertThat(r.truncated()).isFalse();
        assertThat(r.items()).hasSize(50);
    }

    @Test
    @DisplayName("수집 상한(sourceTotal > collected) 초과 시 truncated=true 플래그가 정확히 설정된다")
    void collectionTruncationFlag() {
        G2bProperties p = propsWithKey();
        List<BidNotice> data = new ArrayList<>();
        for (int i = 1; i <= 300; i++) {
            data.add(main("TRUNC-" + i, "상한공고 " + i, "국세청", "2026-09-15"));
        }

        StubSource m = new StubSource("main", data);
        m.sourceTotal = 500; // 원본 API에 500건이 있으나 300건만 수집된 상황 모사
        G2bNoticeService svc = new G2bNoticeService(List.of(m), new G2bNoticeCache(p), p);

        BidNoticeQuery q = new BidNoticeQuery(List.of("국세청"), "main", null, "20260901", "20261001", 1, 10);
        G2bNoticeService.Result r = svc.search(q);

        assertThat(r.totalCount()).isEqualTo(300);
        assertThat(r.sourceTotal()).isEqualTo(500);
        assertThat(r.truncated()).isTrue();
    }

    @Test
    @DisplayName("원본 501건 이상 대량 데이터 수집: totalCount 650건(7페이지) 전체를 마지막 페이지까지 수집하고 truncated=false 검증")
    void multiPageCollection_over500Items_allPagesCollected() {
        G2bProperties p = propsWithKey();
        List<BidNotice> data = new ArrayList<>();
        // 650건 생성 (1~6페이지 100건 + 7페이지 50건 모사)
        for (int i = 1; i <= 650; i++) {
            data.add(main("OVER500-" + i, "대량공고 " + i, "관세청", "2026-09-15"));
        }

        StubSource m = new StubSource("main", data);
        m.sourceTotal = 650;
        G2bNoticeService svc = new G2bNoticeService(List.of(m), new G2bNoticeCache(p), p);

        BidNoticeQuery q = new BidNoticeQuery(List.of("관세청"), "main", null, "20260901", "20261001", 1, 100);
        G2bNoticeService.Result r = svc.search(q);

        assertThat(r.totalCount()).isEqualTo(650);
        assertThat(r.sourceTotal()).isEqualTo(650);
        assertThat(r.truncated()).isFalse();
        assertThat(r.items()).hasSize(100);
    }
}
