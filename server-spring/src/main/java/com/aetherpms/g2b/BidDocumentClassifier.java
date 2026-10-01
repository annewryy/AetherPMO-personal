package com.aetherpms.g2b;

import java.util.regex.Pattern;

/**
 * 나라장터 공고 첨부문서(규격서)의 파일명을 기반으로 문서 유형을 판별한다.
 *
 * RFP(제안요청서), TASK_ORDER(과업지시서), SPECIFICATION(규격서), NOTICE(입찰공고),
 * OTHER(기타 문서), UNKNOWN(파일명 미제공 또는 판단 불가)으로 분류한다.
 */
public final class BidDocumentClassifier {

    private BidDocumentClassifier() {}

    public enum DocumentType {
        RFP("제안요청서"),
        TASK_ORDER("과업지시서"),
        SPECIFICATION("규격서"),
        NOTICE("입찰공고"),
        OTHER("기타"),
        UNKNOWN("미분류");

        private final String label;

        DocumentType(String label) {
            this.label = label;
        }

        public String getLabel() {
            return label;
        }
    }

    // 제안요청서(RFP): 한글 "제안요청서" (공백 허용) 또는 영문 단어 "rfp" (단어 경계/비영숫자 분리, 대소문자 무시)
    private static final Pattern RFP_PATTERN = Pattern.compile(
            "제안\\s*요청서|(?:^|[^a-z0-9])rfp(?:[^a-z0-9]|$)",
            Pattern.CASE_INSENSITIVE
    );

    // 과업지시서 / 과업내용서 / 과업설명서
    private static final Pattern TASK_ORDER_PATTERN = Pattern.compile(
            "과업\\s*(지시서|내용서|설명서|지시|내용|설명)"
    );

    // 규격서 / 규격문서
    private static final Pattern SPECIFICATION_PATTERN = Pattern.compile(
            "규격\\s*(서|문서)"
    );

    // 입찰공고서 / 입찰공고문 / 공고문 / 공고서
    private static final Pattern NOTICE_PATTERN = Pattern.compile(
            "(입찰\\s*)?공고\\s*(문|서)"
    );

    // 구체적 유형을 알 수 없는 파일명 (첨부, 첨부파일, 붙임, file, attachment 등)
    private static final Pattern GENERIC_UNKNOWN_PATTERN = Pattern.compile(
            "^(첨부(파일)?|붙임|file|attachment|docs?)\\d*$",
            Pattern.CASE_INSENSITIVE
    );

    /**
     * 파일명을 기반으로 문서 유형을 판별한다.
     * 파일명이 null이거나 공백이면 UNKNOWN을 반환한다.
     */
    public static DocumentType classify(String fileName) {
        if (fileName == null || fileName.trim().isEmpty()) {
            return DocumentType.UNKNOWN;
        }

        String raw = fileName.trim();

        // 1. RFP (제안요청서 / RFP)
        if (RFP_PATTERN.matcher(raw).find()) {
            return DocumentType.RFP;
        }

        // 2. TASK_ORDER (과업지시서 / 과업내용서 / 과업설명서)
        if (TASK_ORDER_PATTERN.matcher(raw).find()) {
            return DocumentType.TASK_ORDER;
        }

        // 3. SPECIFICATION (규격서 / 규격문서)
        if (SPECIFICATION_PATTERN.matcher(raw).find()) {
            return DocumentType.SPECIFICATION;
        }

        // 4. NOTICE (입찰공고문 / 입찰공고서 / 공고문 / 공고서)
        if (NOTICE_PATTERN.matcher(raw).find()) {
            return DocumentType.NOTICE;
        }

        // 확장자 제거 후 파일 기본 이름 판별
        int dotIdx = raw.lastIndexOf('.');
        String baseName = dotIdx > 0 ? raw.substring(0, dotIdx).trim() : raw;
        String cleanBase = baseName.replaceAll("\\s+", "");

        // 5. UNKNOWN: 파일명만으로 식별 불가능한 범용 첨부명 (예: 첨부파일.zip, 첨부1.zip 등)
        if (GENERIC_UNKNOWN_PATTERN.matcher(cleanBase).matches()) {
            return DocumentType.UNKNOWN;
        }

        // 6. 기타 (OTHER)
        return DocumentType.OTHER;
    }
}
