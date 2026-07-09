package com.aetherpms.g2b;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;

/**
 * 공고 조회 오케스트레이션 유닛 테스트 (외부 API는 스텁 소스로 대체 — 실제 호출 금지).
 * noticeType 분기 · dedup · 로컬필터 · 캐시 · 페이징 · serviceKey 가드 검증.
 */
class G2bNoticeServiceTest {

    private G2bProperties propsWithKey() {
        G2bProperties p = new G2bProperties();
        p.setServiceKey("TEST-KEY");
        p.setCacheTtlSeconds(300);
        return p;
    }

    /** 호출 카운트를 세는 스텁 소스. */
    private static class StubSource implements G2bNoticeSource {
        final String type;
        final List<BidNotice> data;
        final AtomicInteger calls = new AtomicInteger();
        boolean enabled = true;
        StubSource(String type, List<BidNotice> data) { this.type = type; this.data = data; }
        public String noticeType() { return type; }
        public boolean isEnabled() { return enabled; }
        public List<BidNotice> fetch(BidNoticeQuery q) { calls.incrementAndGet(); return data; }
    }

    private static BidNotice main(String no, String name, String customer) {
        return new BidNotice(no, "main", name, customer, "2026-07-01", "2026-07-31", 1000, "#");
    }
    private static BidNotice pre(String no, String name, String customer) {
        return new BidNotice(no, "pre_spec", name, customer, "2026-07-01", "2026-07-31", 2000, "#");
    }

    private BidNoticeQuery query(String type, String agency, String keyword) {
        return new BidNoticeQuery(agency, type, keyword, "20260601", "20260701", 1, 10);
    }

    @Test
    void serviceKeyMissing_throwsG2bException_notNPE() {
        G2bProperties noKey = new G2bProperties(); // 빈 키
        G2bNoticeService svc = new G2bNoticeService(List.of(), new G2bNoticeCache(noKey), noKey);
        assertThatThrownBy(() -> svc.search(query("all", null, null)))
                .isInstanceOf(G2bException.class)
                .hasMessageContaining("인증키");
    }

    @Test
    void all_mergesMainAndPreSpec() {
        G2bProperties p = propsWithKey();
        StubSource m = new StubSource("main", List.of(main("A1", "가나다", "국가정보자원관리원")));
        StubSource s = new StubSource("pre_spec", List.of(pre("P1", "라마바", "한국지역정보개발원")));
        G2bNoticeService svc = new G2bNoticeService(List.of(m, s), new G2bNoticeCache(p), p);

        G2bNoticeService.Result r = svc.search(query("all", null, null));
        assertThat(r.totalCount()).isEqualTo(2);
        assertThat(r.items()).extracting(BidNotice::noticeType).containsExactlyInAnyOrder("main", "pre_spec");
    }

    @Test
    void main_onlyCallsMainSource() {
        G2bProperties p = propsWithKey();
        StubSource m = new StubSource("main", List.of(main("A1", "가나다", "기관")));
        StubSource s = new StubSource("pre_spec", List.of(pre("P1", "라마바", "기관")));
        G2bNoticeService svc = new G2bNoticeService(List.of(m, s), new G2bNoticeCache(p), p);

        G2bNoticeService.Result r = svc.search(query("main", null, null));
        assertThat(r.items()).allMatch(n -> "main".equals(n.noticeType()));
        assertThat(m.calls.get()).isEqualTo(1);
        assertThat(s.calls.get()).isEqualTo(0);
    }

    @Test
    void preSpec_onlyCallsPreSpecSource() {
        G2bProperties p = propsWithKey();
        StubSource m = new StubSource("main", List.of(main("A1", "x", "기관")));
        StubSource s = new StubSource("pre_spec", List.of(pre("P1", "y", "기관")));
        G2bNoticeService svc = new G2bNoticeService(List.of(m, s), new G2bNoticeCache(p), p);

        G2bNoticeService.Result r = svc.search(query("pre_spec", null, null));
        assertThat(r.items()).allMatch(n -> "pre_spec".equals(n.noticeType()));
        assertThat(m.calls.get()).isEqualTo(0);
        assertThat(s.calls.get()).isEqualTo(1);
    }

    @Test
    void disabledSource_isSkipped() {
        G2bProperties p = propsWithKey();
        StubSource m = new StubSource("main", List.of(main("A1", "x", "기관")));
        StubSource s = new StubSource("pre_spec", List.of(pre("P1", "y", "기관")));
        s.enabled = false; // 사전규격 플래그 off 시나리오
        G2bNoticeService svc = new G2bNoticeService(List.of(m, s), new G2bNoticeCache(p), p);

        G2bNoticeService.Result r = svc.search(query("all", null, null));
        assertThat(r.totalCount()).isEqualTo(1);
        assertThat(s.calls.get()).isEqualTo(0);
    }

    @Test
    void keyword_localFiltersByNameOrNo() {
        G2bProperties p = propsWithKey();
        List<BidNotice> data = List.of(
                main("A1", "정보시스템 유지보수", "기관"),
                main("A2", "청소 용역", "기관"));
        StubSource m = new StubSource("main", data);
        G2bNoticeService svc = new G2bNoticeService(List.of(m), new G2bNoticeCache(p), p);

        G2bNoticeService.Result r = svc.search(query("main", null, "유지보수"));
        assertThat(r.totalCount()).isEqualTo(1);
        assertThat(r.items().get(0).announcementNo()).isEqualTo("A1");
    }

    @Test
    void cache_secondSearchDoesNotRefetch() {
        G2bProperties p = propsWithKey();
        StubSource m = new StubSource("main", List.of(main("A1", "가나", "기관")));
        G2bNoticeService svc = new G2bNoticeService(List.of(m), new G2bNoticeCache(p), p);

        svc.search(query("main", null, null));
        svc.search(query("main", null, "가")); // 같은 기관/기간 → 캐시 히트(검색어만 다름)
        assertThat(m.calls.get()).isEqualTo(1);
    }

    @Test
    void dedup_sameTypeAndNo() {
        G2bProperties p = propsWithKey();
        // 같은 유형+번호 중복 → 1건.
        List<BidNotice> data = new ArrayList<>(List.of(
                main("A1", "가", "기관"), main("A1", "가", "기관")));
        StubSource m = new StubSource("main", data);
        G2bNoticeService svc = new G2bNoticeService(List.of(m), new G2bNoticeCache(p), p);

        assertThat(svc.search(query("main", null, null)).totalCount()).isEqualTo(1);
    }

    @Test
    void dateRangeExceedsSixMonths_throws() {
        G2bProperties p = propsWithKey();
        G2bNoticeService svc = new G2bNoticeService(List.of(), new G2bNoticeCache(p), p);
        BidNoticeQuery q = new BidNoticeQuery(null, "all", null, "20250101", "20251231", 1, 10);
        assertThatThrownBy(() -> svc.search(q))
                .isInstanceOf(G2bException.class)
                .hasMessageContaining("6개월");
    }

    @Test
    void paging_slicesResults() {
        G2bProperties p = propsWithKey();
        List<BidNotice> data = new ArrayList<>();
        for (int i = 0; i < 25; i++) data.add(main("A" + i, "이름" + i, "기관"));
        StubSource m = new StubSource("main", data);
        G2bNoticeService svc = new G2bNoticeService(List.of(m), new G2bNoticeCache(p), p);

        BidNoticeQuery q = new BidNoticeQuery(null, "main", null, "20260601", "20260701", 2, 10);
        G2bNoticeService.Result r = svc.search(q);
        assertThat(r.totalCount()).isEqualTo(25);
        assertThat(r.items()).hasSize(10);
    }
}
