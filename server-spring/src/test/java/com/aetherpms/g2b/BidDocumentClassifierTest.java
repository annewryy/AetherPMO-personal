package com.aetherpms.g2b;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class BidDocumentClassifierTest {

    private static BidNoticeDetail createDetailWithDocs(List<BidNoticeDetail.SpecDoc> specDocs) {
        return new BidNoticeDetail(
                "20261000001", "main", "테스트 공고", "수요기관", "2026-10-01 10:00:00",
                "2026-10-10 18:00:00", 100000000L, "https://g2b/detail",
                "00", "N", "일반", "등록공고", "N", null, null, null, null, null, null, null,
                null, null, null, null,
                null, null, null, null, null, null,
                null, null, null, null, null, null,
                null, null, null, null,
                null, null, null, List.of(),
                null, null, null, null, null,
                null, null, null, null,
                specDocs, null, "https://g2b/detail", null
        );
    }

    // --- 요구사항 10: 필수 6가지 테스트케이스 ---

    @Test
    @DisplayName("1. 과업지시서만 존재 → hasRfp=false")
    void scenario1_onlyTaskOrder_hasRfpFalse() {
        List<BidNoticeDetail.SpecDoc> docs = List.of(
                new BidNoticeDetail.SpecDoc("https://g2b/doc1", "과업지시서.hwp")
        );
        BidNoticeDetail detail = createDetailWithDocs(docs);

        assertThat(docs.get(0).documentType()).isEqualTo("TASK_ORDER");
        assertThat(detail.hasRfp()).isFalse();

        Map<String, Object> dto = detail.toDto();
        assertThat(dto.get("hasRfp")).isEqualTo(false);
    }

    @Test
    @DisplayName("2. 규격서만 존재 → hasRfp=false")
    void scenario2_onlySpecification_hasRfpFalse() {
        List<BidNoticeDetail.SpecDoc> docs = List.of(
                new BidNoticeDetail.SpecDoc("https://g2b/doc1", "규격서.pdf")
        );
        BidNoticeDetail detail = createDetailWithDocs(docs);

        assertThat(docs.get(0).documentType()).isEqualTo("SPECIFICATION");
        assertThat(detail.hasRfp()).isFalse();

        Map<String, Object> dto = detail.toDto();
        assertThat(dto.get("hasRfp")).isEqualTo(false);
    }

    @Test
    @DisplayName("3. 제안요청서 존재 → hasRfp=true")
    void scenario3_rfpExists_hasRfpTrue() {
        List<BidNoticeDetail.SpecDoc> docs = List.of(
                new BidNoticeDetail.SpecDoc("https://g2b/doc1", "제안요청서.hwp")
        );
        BidNoticeDetail detail = createDetailWithDocs(docs);

        assertThat(docs.get(0).documentType()).isEqualTo("RFP");
        assertThat(detail.hasRfp()).isTrue();

        Map<String, Object> dto = detail.toDto();
        assertThat(dto.get("hasRfp")).isEqualTo(true);
    }

    @Test
    @DisplayName("4. 제안요청서 + 과업지시서 → hasRfp=true")
    void scenario4_rfpAndTaskOrder_hasRfpTrue() {
        List<BidNoticeDetail.SpecDoc> docs = List.of(
                new BidNoticeDetail.SpecDoc("https://g2b/doc1", "과업지시서.hwp"),
                new BidNoticeDetail.SpecDoc("https://g2b/doc2", "제안요청서.hwp")
        );
        BidNoticeDetail detail = createDetailWithDocs(docs);

        assertThat(docs.get(0).documentType()).isEqualTo("TASK_ORDER");
        assertThat(docs.get(1).documentType()).isEqualTo("RFP");
        assertThat(detail.hasRfp()).isTrue();

        Map<String, Object> dto = detail.toDto();
        assertThat(dto.get("hasRfp")).isEqualTo(true);
    }

    @Test
    @DisplayName("5. 파일명 없는 URL만 존재 → hasRfp=false")
    void scenario5_urlOnlyWithoutFileName_hasRfpFalse() {
        List<BidNoticeDetail.SpecDoc> docs = List.of(
                new BidNoticeDetail.SpecDoc("https://g2b/doc1", null)
        );
        BidNoticeDetail detail = createDetailWithDocs(docs);

        assertThat(docs.get(0).documentType()).isEqualTo("UNKNOWN");
        assertThat(detail.hasRfp()).isFalse();

        Map<String, Object> dto = detail.toDto();
        assertThat(dto.get("hasRfp")).isEqualTo(false);
    }

    @Test
    @DisplayName("6. ZIP만 존재 → hasRfp=false")
    void scenario6_onlyZip_hasRfpFalse() {
        List<BidNoticeDetail.SpecDoc> docs = List.of(
                new BidNoticeDetail.SpecDoc("https://g2b/doc1", "첨부파일.zip"),
                new BidNoticeDetail.SpecDoc("https://g2b/doc2", "첨부1.zip")
        );
        BidNoticeDetail detail = createDetailWithDocs(docs);

        assertThat(docs.get(0).documentType()).isIn("UNKNOWN", "OTHER");
        assertThat(docs.get(1).documentType()).isIn("UNKNOWN", "OTHER");
        assertThat(detail.hasRfp()).isFalse();

        Map<String, Object> dto = detail.toDto();
        assertThat(dto.get("hasRfp")).isEqualTo(false);
    }

    // --- 요구사항 4: 절대로 제안요청서로 판별하지 않는 파일 ---

    @ParameterizedTest
    @ValueSource(strings = {
            "과업지시서.hwp",
            "과업내용서.pdf",
            "과업설명서.hwp",
            "규격서.pdf",
            "입찰공고문.hwp"
    })
    @DisplayName("요구사항 4: 과업지시서/과업내용서/과업설명서/규격서/입찰공고문은 절대로 RFP로 판별하지 않는다")
    void requirement4_neverClassifiedAsRfp(String fileName) {
        BidDocumentClassifier.DocumentType type = BidDocumentClassifier.classify(fileName);
        assertThat(type).isNotEqualTo(BidDocumentClassifier.DocumentType.RFP);
    }

    // --- 요구사항 5: 제안요청서로 판별하는 파일 (대소문자/공백 처리) ---

    @ParameterizedTest
    @ValueSource(strings = {
            "제안요청서.hwp",
            "제안 요청서.pdf",
            "제안요청서_최종본.hwp",
            "RFP.pdf",
            "rfp.pdf",
            "2026_사업_RFP.docx",
            "[붙임1] 제안요청서.hwpx"
    })
    @DisplayName("요구사항 5: 제안요청서 키워드가 있는 파일만 RFP로 판별 (공백, 대소문자 무관)")
    void requirement5_classifiedAsRfp(String fileName) {
        BidDocumentClassifier.DocumentType type = BidDocumentClassifier.classify(fileName);
        assertThat(type).isEqualTo(BidDocumentClassifier.DocumentType.RFP);
    }

    // --- 요구사항 6: ZIP 및 모호한 파일명 판별 ---

    @ParameterizedTest
    @ValueSource(strings = {
            "첨부파일.zip",
            "첨부1.zip",
            "붙임.zip",
            "file.zip"
    })
    @DisplayName("요구사항 6: 단순 첨부명 ZIP은 RFP가 아니며 UNKNOWN으로 판별된다")
    void requirement6_genericZipUnknown(String fileName) {
        BidDocumentClassifier.DocumentType type = BidDocumentClassifier.classify(fileName);
        assertThat(type).isEqualTo(BidDocumentClassifier.DocumentType.UNKNOWN);
    }
}
