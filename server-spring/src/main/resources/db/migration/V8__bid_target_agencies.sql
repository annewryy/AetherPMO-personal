-- =====================================================================
-- V8 — 나라장터 공고조회 대상기관 마스터 bid_target_agencies (설계 0016 §A)
--
-- 자유텍스트(dminsttNm) 대신 관리 가능한 기관 드롭다운의 근거 테이블.
--   - agency_name: 나라장터 조회 키(dminsttNm)로 그대로 사용.
--   - sort_order: 드롭다운 정렬.
--   - is_default: 기본 선택(TINYINT boolean).
-- 시드 3건은 설계 0016 §A 기본 항목. "직접입력"은 프론트 특수항목이라 시드 아님.
-- =====================================================================

CREATE TABLE bid_target_agencies (
    id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    agency_name  VARCHAR(200) NOT NULL,
    sort_order   INT NOT NULL DEFAULT 0,
    is_default   TINYINT NOT NULL DEFAULT 0,
    created_at   DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at   DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT uk_bid_target_agency_name UNIQUE (agency_name)
);

-- 시드(설계 0016 §A): 국가정보자원관리원을 기본 선택.
INSERT INTO bid_target_agencies (agency_name, sort_order, is_default) VALUES
    ('국가정보자원관리원',       1, 1),
    ('한국지역정보개발원',       2, 0),
    ('한국지능정보사회진흥원',   3, 0);
