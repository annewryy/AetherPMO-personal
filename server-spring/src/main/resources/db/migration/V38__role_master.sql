-- 0039 — 프로젝트 참여역할을 '관리자가 편집하는 마스터'로 승격.
--   ① 경영진(EXEC)은 직급이지 프로젝트 내 역할이 아니므로 역할 권한에서 제외한다.
--      (0034에서 참여역할로 넣었다가 0041에서 자동등록을 철회했고, 여기서 어휘 자체를 뺀다.
--       전사 조회 권한은 접근 규칙의 position_code='EXEC' + project_scope='ALL'이 담당한다.)
--   ② 역할 추가·수정·삭제를 UI에서 하려면 어휘가 코드/CHECK에 박혀 있으면 안 된다.
--      pms_role_capability를 역할 마스터로 삼고(라벨·정렬 추가), participation_role의
--      CHECK 제약을 제거해 앱이 마스터를 조회해 검증하도록 바꾼다.

ALTER TABLE pms_role_capability
  ADD COLUMN label      VARCHAR(50) NULL COMMENT '표시명(한글)' AFTER role_code,
  ADD COLUMN sort_order INT NOT NULL DEFAULT 100 COMMENT '표시 순서' AFTER label;

-- role_code는 사용자가 만드는 값이라 10자는 좁다.
ALTER TABLE pms_role_capability MODIFY COLUMN role_code VARCHAR(30) NOT NULL;

UPDATE pms_role_capability SET label = CASE role_code
    WHEN 'PM'  THEN 'PM(프로젝트 관리자)'
    WHEN 'PL'  THEN 'PL(파트 리더)'
    WHEN 'PMO' THEN 'PMO'
    WHEN 'TA'  THEN 'TA(기술 아키텍트)'
    WHEN 'AA'  THEN 'AA(애플리케이션 아키텍트)'
    WHEN 'DA'  THEN 'DA(데이터 아키텍트)'
    WHEN 'DBA' THEN 'DBA'
    WHEN 'SE'  THEN 'SE(시스템 엔지니어)'
    WHEN 'DEV' THEN '개발'
    WHEN 'QA'  THEN '품질'
    WHEN 'CT'  THEN 'CT(기술 컨설턴트)'
    WHEN 'ETC' THEN '기타'
    ELSE role_code END,
  sort_order = CASE role_code
    WHEN 'PM' THEN 10 WHEN 'PL' THEN 20 WHEN 'PMO' THEN 30
    WHEN 'TA' THEN 40 WHEN 'AA' THEN 50 WHEN 'DA' THEN 60 WHEN 'DBA' THEN 70
    WHEN 'SE' THEN 80 WHEN 'DEV' THEN 90 WHEN 'QA' THEN 100 WHEN 'CT' THEN 110
    WHEN 'ETC' THEN 900 ELSE 500 END;

-- ① 경영진 제외. 남아 있는 참여인력 행이 있으면 역할을 비운다(참여 자체는 유지).
UPDATE pms_project_member SET participation_role = NULL WHERE participation_role = 'EXEC';
DELETE FROM pms_role_capability WHERE role_code = 'EXEC';

-- ② 어휘 고정 해제 — 이후 검증은 pms_role_capability 조회로 한다.
ALTER TABLE pms_project_member DROP CONSTRAINT IF EXISTS chk_pms_member_participation;
