package com.aetherpms.g2b;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class BidTargetAgencyTest {

    @Test
    @DisplayName("기본 5개 관심기관 목록 정의 확인")
    void defaultAgencies() {
        assertThat(BidTargetAgency.DEFAULT_AGENCIES).containsExactly(
                "행정안전부 국가정보자원관리원",
                "한국지역정보개발원",
                "한국지능정보사회진흥원",
                "국세청",
                "관세청"
        );
    }

    @ParameterizedTest
    @CsvSource({
            "행정안전부 국가정보자원관리원, 행정안전부 국가정보자원관리원, true",
            "국가정보자원관리원, 행정안전부 국가정보자원관리원, true",
            "국가정보자원관리원 대전본원, 행정안전부 국가정보자원관리원, true",
            "국가정보자원관리원 광주센터, 행정안전부 국가정보자원관리원, true",
            "국가정보자원관리원 대구센터, 행정안전부 국가정보자원관리원, true",
            "한국지역정보개발원, 한국지역정보개발원, true",
            "한국지능정보사회진흥원, 한국지능정보사회진흥원, true",
            "국세청, 국세청, true",
            "서울지방국세청, 국세청, true",
            "중부지방국세청, 국세청, true",
            "부산지방국세청, 국세청, true",
            "인천지방국세청, 국세청, true",
            "국세상담센터, 국세청, true",
            "국세공무원교육원, 국세청, true",
            "주류면허지원센터, 국세청, true",
            "관세청, 관세청, true",
            "관세청 서울세관, 관세청, true",
            "인천공항세관, 관세청, true",
            "부산세관, 관세청, true",
            "중앙관세분석소, 관세청, true",
            "관세인재개발원, 관세청, true",
            "서울대학교, 국세청, false",
            "한국도로공사, 관세청, false",
            "행정안전부 경찰청, 행정안전부 국가정보자원관리원, false"
    })
    @DisplayName("정규화된 수요기관명 및 확인된 직속/소속 하위기관 매칭 검증")
    void matchesAgency(String customerName, String targetAgency, boolean expected) {
        boolean result = BidTargetAgency.matches(customerName, targetAgency);
        assertThat(result).isEqualTo(expected);
    }

    @Test
    @DisplayName("다중 기관 OR 조건 매칭 검증")
    void matchesAny() {
        List<String> targets = List.of("국세청", "관세청");
        assertThat(BidTargetAgency.matchesAny("서울지방국세청", targets)).isTrue();
        assertThat(BidTargetAgency.matchesAny("인천공항세관", targets)).isTrue();
        assertThat(BidTargetAgency.matchesAny("국세상담센터", targets)).isTrue();
        assertThat(BidTargetAgency.matchesAny("한국지역정보개발원", targets)).isFalse();
    }

    @Test
    @DisplayName("수집 누락 방지를 위한 직속/소속 하위기관 검색 키워드 목록 확장 검증")
    void getSearchKeywords() {
        // 관세청: 본청 및 세관, 직속 분석소/인재개발원 포함
        List<String> kcsKeys = BidTargetAgency.getSearchKeywords("관세청");
        assertThat(kcsKeys).contains("관세청", "서울세관", "인천공항세관", "중앙관세분석소", "관세인재개발원");

        // 국세청: 본청 및 상담센터, 교육원, 주류면허지원센터 포함
        List<String> ntsKeys = BidTargetAgency.getSearchKeywords("국세청");
        assertThat(ntsKeys).contains("국세청", "국세상담센터", "국세공무원교육원", "주류면허지원센터");

        // 국가정보자원관리원
        List<String> nirsKeys = BidTargetAgency.getSearchKeywords("행정안전부 국가정보자원관리원");
        assertThat(nirsKeys).containsExactly("국가정보자원관리원");
    }

    @Test
    @DisplayName("조회기간 분할: 31일 기간은 25일 이하 슬라이스로 분할되어 누락 없이 커버된다")
    void splitDateRange() {
        List<BidTargetAgency.DateRange> slices =
                BidTargetAgency.splitDateRange("20260901", "20261001", 25);
        assertThat(slices).hasSize(2);
        assertThat(slices.get(0).bgngDt()).isEqualTo("20260901");
        assertThat(slices.get(0).endDt()).isEqualTo("20260925");
        assertThat(slices.get(1).bgngDt()).isEqualTo("20260926");
        assertThat(slices.get(1).endDt()).isEqualTo("20261001");
    }
}
