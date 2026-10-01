package com.aetherpms.g2b;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

/**
 * 입찰공고 조회 대상 수요기관 마스터 및 매칭 유틸리티.
 *
 * 기본 5개 관심기관:
 * 1. 행정안전부 국가정보자원관리원 (검색어: '국가정보자원관리원')
 *    - 본원 및 대전/광주/대구/공주센터 등 '국가정보자원관리원' 표기 매칭
 * 2. 한국지역정보개발원 (검색어: '한국지역정보개발원')
 * 3. 한국지능정보사회진흥원 (검색어: '한국지능정보사회진흥원')
 * 4. 국세청 (검색어: '국세청')
 *    - 본청 및 7대 지방국세청 등 기관명에 '국세청'이 포함된 공고 매칭
 * 5. 관세청 (검색어: '관세청')
 *    - 본청 및 소속 세관 등 기관명에 '관세청'이 포함된 공고 매칭
 *
 * * 출처가 확인되지 않은 임의의 기관코드 하드코딩이나,
 *   실제 API 수집 키워드로 수집되지 않는 가상의 하위조직은 매칭 대상에서 배제한다.
 */
public final class BidTargetAgency {

    public static final String NIRS = "행정안전부 국가정보자원관리원";
    public static final String KLID = "한국지역정보개발원";
    public static final String NIA = "한국지능정보사회진흥원";
    public static final String NTS = "국세청";
    public static final String KCS = "관세청";

    public static final List<String> DEFAULT_AGENCIES = List.of(
            NIRS, KLID, NIA, NTS, KCS
    );

    private static final DateTimeFormatter YMD = DateTimeFormatter.ofPattern("yyyyMMdd");

    private BidTargetAgency() {}

    /**
     * 나라장터 OpenAPI dminsttNm 파라미터로 넘길 검색 키워드 목록 추출.
     * 상위기관 명칭이 생략된 직속/소속 하위기관(세관, 교육원, 센터 등) 공고가 수집 단계에서
     * 누락되지 않도록 확인된 직속기관 키워드를 함께 반환한다.
     */
    public static List<String> getSearchKeywords(String agency) {
        if (agency == null || agency.isBlank()) return List.of();
        String clean = agency.replaceAll("\\s+", "");
        if (clean.contains("국가정보자원관리원")) {
            return List.of("국가정보자원관리원");
        }
        if (clean.contains("지역정보개발원")) {
            return List.of("한국지역정보개발원");
        }
        if (clean.contains("지능정보사회진흥원")) {
            return List.of("한국지능정보사회진흥원");
        }
        if (clean.contains("국세청")) {
            // 국세청 본청 및 독립 수요기관명으로 등록될 수 있는 직속기관
            return List.of("국세청", "국세상담센터", "국세공무원교육원", "주류면허지원센터");
        }
        if (clean.contains("관세청")) {
            // 관세청 본청 및 주요 세관, 직속 분석소/인재개발원
            return List.of(
                    "관세청",
                    "서울세관", "인천공항세관", "인천세관", "부산세관",
                    "대구세관", "광주세관", "평택세관",
                    "중앙관세분석소", "관세인재개발원"
            );
        }
        return List.of(agency.trim());
    }

    /** 단일 대표 키워드 호환용 */
    public static String getSearchKeyword(String agency) {
        List<String> list = getSearchKeywords(agency);
        return list.isEmpty() ? null : list.get(0);
    }

    /**
     * 공고의 실제 수요기관명(customerName)이 대상 기관(targetAgency) 및 확인된 소속 하위기관과 매칭되는지 정밀 판별.
     * 앞뒤 공백 및 연속 공백을 정규화하고, 확인된 공식 직속조직을 포함한다.
     */
    public static boolean matches(String customerName, String targetAgency) {
        if (targetAgency == null || targetAgency.isBlank()) return true;
        if (customerName == null || customerName.isBlank()) return false;

        String c = customerName.replaceAll("\\s+", "").toLowerCase();
        String t = targetAgency.replaceAll("\\s+", "").toLowerCase();

        // 1. 행정안전부 국가정보자원관리원 (상위부처 유무 및 대전본원/광주/대구/공주센터 등 대응)
        if (t.contains("국가정보자원관리원")) {
            return c.contains("국가정보자원관리원");
        }

        // 2. 한국지역정보개발원
        if (t.contains("지역정보개발원")) {
            return c.contains("한국지역정보개발원") || c.contains("지역정보개발원");
        }

        // 3. 한국지능정보사회진흥원
        if (t.contains("지능정보사회진흥원")) {
            return c.contains("한국지능정보사회진흥원") || c.contains("지능정보사회진흥원");
        }

        // 4. 국세청 (본청, 7대 지방국세청 및 직속 교육원/상담센터/주류면허지원센터)
        if (t.contains("국세청")) {
            return c.contains("국세청")
                    || c.contains("국세상담센터")
                    || c.contains("국세공무원교육원")
                    || c.contains("주류면허지원센터");
        }

        // 5. 관세청 (본청, 소속 세관 및 중앙관세분석소/관세인재개발원)
        if (t.contains("관세청")) {
            return c.contains("관세청")
                    || c.contains("세관")
                    || c.contains("중앙관세분석소")
                    || c.contains("관세인재개발원");
        }

        // 일반 텍스트 상호 부분일치
        return c.contains(t) || t.contains(c);
    }

    /**
     * 기관코드(customerCode) 파라미터 호환용 오버로드 (검증되지 않은 임의 코드 매칭은 배제하고 정규화된 기관명 기준 매칭).
     */
    public static boolean matches(String customerName, String customerCode, String targetAgency) {
        return matches(customerName, targetAgency);
    }

    /**
     * 공고가 주어진 대상 기관 목록 중 하나라도 만족하는지 (OR 조건).
     */
    public static boolean matchesAny(String customerName, List<String> targetAgencies) {
        if (targetAgencies == null || targetAgencies.isEmpty()) return true;
        for (String target : targetAgencies) {
            if (matches(customerName, target)) {
                return true;
            }
        }
        return false;
    }

    /**
     * 공고가 주어진 대상 기관 목록 중 하나라도 만족하는지 (OR 조건, customerCode 포함 오버로드).
     */
    public static boolean matchesAny(String customerName, String customerCode, List<String> targetAgencies) {
        return matchesAny(customerName, targetAgencies);
    }

    public record DateRange(String bgngDt, String endDt) {}

    /**
     * 조회 기간이 나라장터 API 1회 상한(예: 25~30일)을 넘는 경우 기간을 분할(split).
     * 시작일과 종료일이 모두 포함되며 누락되는 날짜가 없도록 슬라이스 리스트 반환.
     */
    public static List<DateRange> splitDateRange(String bgngDt, String endDt, int maxDaysPerSlice) {
        List<DateRange> slices = new ArrayList<>();
        if (bgngDt == null || endDt == null || bgngDt.isBlank() || endDt.isBlank()) {
            return slices;
        }
        try {
            LocalDate start = LocalDate.parse(bgngDt.replace("-", "").trim(), YMD);
            LocalDate end = LocalDate.parse(endDt.replace("-", "").trim(), YMD);

            if (start.isAfter(end)) {
                LocalDate temp = start;
                start = end;
                end = temp;
            }

            LocalDate currentStart = start;
            while (!currentStart.isAfter(end)) {
                LocalDate currentEnd = currentStart.plusDays(maxDaysPerSlice - 1);
                if (currentEnd.isAfter(end)) {
                    currentEnd = end;
                }
                slices.add(new DateRange(currentStart.format(YMD), currentEnd.format(YMD)));
                currentStart = currentEnd.plusDays(1);
            }
        } catch (Exception e) {
            // 날짜 파싱 오류 시 원본 단일 범위 유지
            slices.add(new DateRange(bgngDt, endDt));
        }
        return slices;
    }
}
