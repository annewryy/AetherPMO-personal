package com.aetherpms.g2b;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 나라장터 공고 단건 상세 (배치14 / 설계 0017 §A — inqryDiv=2 풀필드).
 *
 * getBidPblancListInfoServc(inqryDiv=2, bidNtceNo)의 응답 메시지 명세를 camelCase로 노출한다.
 * 리스트용 {@link BidNotice}(8필드)와 정합되도록 핵심 필드(announcementNo·name·customer·
 * publishDate·endDate·budget·url·noticeType)를 동일 키로 유지하고, 상세 페이지/생성 마법사
 * 프리필에 필요한 리치 필드를 추가로 노출한다.
 *
 * 명세에 값이 없는 필드는 null(더미데이터 금지 — [[no-dummy-data]]).
 */
public record BidNoticeDetail(
        // --- 리스트(BidNotice)와 정합되는 핵심 필드 ---
        String announcementNo,   // bidNtceNo   입찰공고번호
        String noticeType,       // 배지: "main"(본공고 단건조회는 항상 main)
        String name,             // bidNtceNm   입찰공고명
        String customer,         // dminsttNm   수요기관명
        String publishDate,      // bidNtceDt   입찰공고일시(원문 그대로 YYYY-MM-DD HH:MM:SS)
        String endDate,          // bidClseDt   입찰마감일시
        Long budget,             // asignBdgtAmt→presmptPrce  배정예산/추정가격(원)
        String url,              // bidNtceDtlUrl 입찰공고상세URL

        // --- 공고 식별/상태 ---
        String noticeOrder,      // bidNtceOrd   입찰공고차수
        String reNoticeYn,       // reNtceYn     재공고여부(Y/N)
        String registerTypeName, // rgstTyNm     등록유형명
        String noticeKindName,   // ntceKindNm   공고종류명(등록/변경/취소/재공고)
        String intlBidYn,        // intrbidYn    국제입찰여부(Y/N)
        String refNo,            // refNo        참조번호
        String registerDate,     // rgstDt       등록일시
        String changeDate,       // chgDt        변경일시
        String changeNoticeReason, // chgNtceRsn 변경공고사유
        String preSpecRegisterNo,  // bfSpecRgstNo 사전규격등록번호
        String unifiedNoticeNo,  // untyNtceNo   통합공고번호
        String orderPlanUnifiedNo, // orderPlanUntyNo 발주계획통합번호

        // --- 기관 ---
        String noticeAgencyCode, // ntceInsttCd  공고기관코드
        String noticeAgencyName, // ntceInsttNm  공고기관명
        String demandAgencyCode, // dminsttCd    수요기관코드
        String demandAgencyName, // dminsttNm    수요기관명

        // --- 방식/방법 ---
        String bidMethodName,        // bidMethdNm       입찰방식명
        String contractMethodName,   // cntrctCnclsMthdNm 계약체결방법명
        String bidwinnerMethodCode,  // sucsfbidMthdCd   낙찰방법코드
        String bidwinnerMethodName,  // sucsfbidMthdNm   낙찰방법명
        String bidwinnerMethodAppStd, // sucsfbidMthdAppStd 낙찰방법적용기준
        String serviceDivName,       // srvceDivNm       용역구분명(일반/기술용역)

        // --- 일정(원문 문자열) ---
        String bidQlfctRegisterDeadline, // bidQlfctRgstDt  입찰참가자격등록마감일시
        String bidBeginDate,     // bidBeginDt   입찰개시일시
        String openingDate,      // opengDt      개찰일시
        String openingPlace,     // opengPlce    개찰장소
        String briefingDate,     // dcmtgOprtnDt 설명회실시일시
        String briefingPlace,    // dcmtgOprtnPlce 설명회실시장소

        // --- 금액 ---
        Long assignBudgetAmount, // asignBdgtAmt 배정예산금액
        Long estimatedPrice,     // presmptPrce  추정가격
        Long vat,                // VAT          부가가치세
        Double bidwinnerLowerRate, // sucsfbidLwltRate 낙찰하한율(%)

        // --- 제한 ---
        String industryLimitYn,  // indstrytyLmtYn 업종제한여부(Y/N)
        String regionLimitJudgeName, // rgnLmtBidLocplcJdgmBssNm 지역제한입찰소재지판단기준명
        String bidParticipationLimitYn, // bidPrtcptLmtYn 입찰참가제한여부(Y/N)
        List<String> jointContractDutyRegions, // jntcontrctDutyRgnNm1..3 공동도급의무지역명

        // --- 담당자 ---
        String noticeAgencyOfficialName,  // ntceInsttOfclNm       공고기관담당자명
        String noticeAgencyOfficialTel,   // ntceInsttOfclTelNo    공고기관담당자전화번호
        String noticeAgencyOfficialEmail, // ntceInsttOfclEmailAdrs 공고기관담당자이메일주소
        String demandAgencyOfficialEmail, // dminsttOfclEmailAdrs  수요기관담당자이메일주소
        String executiveName,             // exctvNm               집행관명

        // --- 분류 ---
        String pubProcurementLargeClassName, // pubPrcrmntLrgclsfcNm 공공조달대분류명
        String pubProcurementMidClassName,   // pubPrcrmntMidclsfcNm 공공조달중분류명
        String pubProcurementClassNo,        // pubPrcrmntClsfcNo    공공조달분류번호
        String pubProcurementClassName,      // pubPrcrmntClsfcNm    공공조달분류명

        // --- 첨부/원문 URL ---
        List<SpecDoc> specDocs,  // ntceSpecDocUrl1..10 / ntceSpecFileNm1..10 공고규격서URL·파일명
        String stdNoticeDocUrl,  // stdNtceDocUrl 표준공고서URL
        String noticeDetailUrl,  // bidNtceDtlUrl 입찰공고상세URL
        String noticeUrl         // bidNtceUrl   입찰공고URL
) {

    /** 공고규격서 첨부 항목 (URL + 파일명 쌍). */
    public record SpecDoc(String url, String fileName) {
        public Map<String, Object> toDto() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("url", url);
            m.put("fileName", fileName);
            return m;
        }
    }

    /** 응답 직렬화용 camelCase DTO. null 값도 명시적으로 노출(프론트 스키마 안정). */
    public Map<String, Object> toDto() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("announcementNo", announcementNo);
        m.put("noticeType", noticeType);
        m.put("name", name);
        m.put("customer", customer);
        m.put("publishDate", publishDate);
        m.put("endDate", endDate);
        m.put("budget", budget);
        m.put("url", url);

        m.put("noticeOrder", noticeOrder);
        m.put("reNoticeYn", reNoticeYn);
        m.put("registerTypeName", registerTypeName);
        m.put("noticeKindName", noticeKindName);
        m.put("intlBidYn", intlBidYn);
        m.put("refNo", refNo);
        m.put("registerDate", registerDate);
        m.put("changeDate", changeDate);
        m.put("changeNoticeReason", changeNoticeReason);
        m.put("preSpecRegisterNo", preSpecRegisterNo);
        m.put("unifiedNoticeNo", unifiedNoticeNo);
        m.put("orderPlanUnifiedNo", orderPlanUnifiedNo);

        m.put("noticeAgencyCode", noticeAgencyCode);
        m.put("noticeAgencyName", noticeAgencyName);
        m.put("demandAgencyCode", demandAgencyCode);
        m.put("demandAgencyName", demandAgencyName);

        m.put("bidMethodName", bidMethodName);
        m.put("contractMethodName", contractMethodName);
        m.put("bidwinnerMethodCode", bidwinnerMethodCode);
        m.put("bidwinnerMethodName", bidwinnerMethodName);
        m.put("bidwinnerMethodAppStd", bidwinnerMethodAppStd);
        m.put("serviceDivName", serviceDivName);

        m.put("bidQlfctRegisterDeadline", bidQlfctRegisterDeadline);
        m.put("bidBeginDate", bidBeginDate);
        m.put("openingDate", openingDate);
        m.put("openingPlace", openingPlace);
        m.put("briefingDate", briefingDate);
        m.put("briefingPlace", briefingPlace);

        m.put("assignBudgetAmount", assignBudgetAmount);
        m.put("estimatedPrice", estimatedPrice);
        m.put("vat", vat);
        m.put("bidwinnerLowerRate", bidwinnerLowerRate);

        m.put("industryLimitYn", industryLimitYn);
        m.put("regionLimitJudgeName", regionLimitJudgeName);
        m.put("bidParticipationLimitYn", bidParticipationLimitYn);
        m.put("jointContractDutyRegions", jointContractDutyRegions);

        m.put("noticeAgencyOfficialName", noticeAgencyOfficialName);
        m.put("noticeAgencyOfficialTel", noticeAgencyOfficialTel);
        m.put("noticeAgencyOfficialEmail", noticeAgencyOfficialEmail);
        m.put("demandAgencyOfficialEmail", demandAgencyOfficialEmail);
        m.put("executiveName", executiveName);

        m.put("pubProcurementLargeClassName", pubProcurementLargeClassName);
        m.put("pubProcurementMidClassName", pubProcurementMidClassName);
        m.put("pubProcurementClassNo", pubProcurementClassNo);
        m.put("pubProcurementClassName", pubProcurementClassName);

        List<Map<String, Object>> docs = specDocs == null ? List.of()
                : specDocs.stream().map(SpecDoc::toDto).toList();
        m.put("specDocs", docs);
        m.put("stdNoticeDocUrl", stdNoticeDocUrl);
        m.put("noticeDetailUrl", noticeDetailUrl);
        m.put("noticeUrl", noticeUrl);
        return m;
    }
}
