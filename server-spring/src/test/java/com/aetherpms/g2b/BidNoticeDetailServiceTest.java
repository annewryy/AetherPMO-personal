package com.aetherpms.g2b;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.Test;

/**
 * 단건 상세 오케스트레이션 유닛 테스트 — 소스는 Mockito 스텁(외부 실호출 금지).
 * serviceKey 가드 · 0건 404 · 캐시(재호출 없음) · 빈 번호 검증.
 */
class BidNoticeDetailServiceTest {

    private static G2bProperties propsWithKey() {
        G2bProperties p = new G2bProperties();
        p.setServiceKey("TEST-KEY");
        p.setCacheTtlSeconds(300);
        return p;
    }

    private static BidNoticeDetail sample(String no) {
        return new BidNoticeDetail(no, "main", "공고명", "수요기관", "2025-07-01 00:00:00",
                "2025-07-08 14:00:00", 1000L, "https://g2b/detail",
                "000", "N", "등록유형", "등록공고", "N", null, null, null, null, null, null, null,
                null, null, null, null,
                null, "제한경쟁", null, "적격심사", null, "일반용역",
                null, null, "2025-07-08 15:00:00", null, null, null,
                1000L, 900L, 90L, 87.7,
                "Y", null, "N", List.of(),
                null, null, null, null, null,
                null, null, null, null,
                List.of(), null, "https://g2b/detail", null);
    }

    @Test
    void serviceKeyMissing_throwsG2bException() {
        G2bProperties noKey = new G2bProperties();
        BidNoticeDetailSource source = mock(BidNoticeDetailSource.class);
        BidNoticeDetailService svc = new BidNoticeDetailService(source, noKey);
        assertThatThrownBy(() -> svc.getDetail("R25BK00934017"))
                .isInstanceOf(G2bException.class)
                .hasMessageContaining("인증키");
    }

    @Test
    void blankNo_throwsNotFound() {
        BidNoticeDetailSource source = mock(BidNoticeDetailSource.class);
        BidNoticeDetailService svc = new BidNoticeDetailService(source, propsWithKey());
        assertThatThrownBy(() -> svc.getDetail("  "))
                .isInstanceOf(BidNoticeNotFoundException.class);
    }

    @Test
    void notFound_whenSourceReturnsNull() {
        BidNoticeDetailSource source = mock(BidNoticeDetailSource.class);
        when(source.fetch(anyString())).thenReturn(null);
        BidNoticeDetailService svc = new BidNoticeDetailService(source, propsWithKey());
        assertThatThrownBy(() -> svc.getDetail("R25BK99999999"))
                .isInstanceOf(BidNoticeNotFoundException.class)
                .hasMessageContaining("R25BK99999999");
    }

    @Test
    void returnsDetail_andMapsToDto() {
        BidNoticeDetailSource source = mock(BidNoticeDetailSource.class);
        when(source.fetch("A1")).thenReturn(sample("A1"));
        BidNoticeDetailService svc = new BidNoticeDetailService(source, propsWithKey());

        BidNoticeDetail d = svc.getDetail("A1");
        assertThat(d.announcementNo()).isEqualTo("A1");
        assertThat(d.toDto())
                .containsEntry("announcementNo", "A1")
                .containsEntry("noticeType", "main")
                .containsEntry("contractMethodName", "제한경쟁")
                .containsKey("specDocs");
    }

    @Test
    void cache_secondCallDoesNotRefetch() {
        BidNoticeDetailSource source = mock(BidNoticeDetailSource.class);
        when(source.fetch("A1")).thenReturn(sample("A1"));
        BidNoticeDetailService svc = new BidNoticeDetailService(source, propsWithKey());

        svc.getDetail("A1");
        svc.getDetail("A1");
        verify(source, times(1)).fetch("A1");
    }
}
