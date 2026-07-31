-- ---------------------------------------------------------------------
-- V39 — 0042 5단계: 인력의 부서를 **이름이 아니라 코드**로 잡는다.
--
-- 왜: pms_person.department는 부서'명' 문자열이라 부서 필터가
--       코드 → 하위 전개 → 부서명 목록 → WHERE department IN (...)
--     우회로를 탔다. 그런데 dept_nm에는 유니크 제약이 없고, 실제 조직도에
--     동명 부서가 흔하다(2026-07-29 dev 실측: 재무팀 6, 법무팀 5, CEO 5, 인사팀 4 …).
--     → 재무팀 하나를 골라도 6개 부서 인원이 전부 걸린다. 개선이 아니라 버그 수정이다.
--     추가로 아마란스에서 부서명이 바뀌면 기존 인력이 필터에서 조용히 사라졌다.
--
-- department(이름)는 지운다 vs 남긴다: **남긴다.**
--   · 외부 인력(source=EXTERNAL)의 부서는 조직도에 없는 자유 입력이라 코드가 없다.
--   · 목록·상세의 표시값으로 계속 쓴다. 필터의 축만 코드로 옮긴다.
--
-- FK를 걸지 않는 이유: pms_org_dept는 동기화가 DELETE-ALL 후 재삽입하는 미러라
--   FK가 있으면 동기화 자체가 막힌다(0020). 소프트 참조로 둔다.
-- ---------------------------------------------------------------------

ALTER TABLE pms_person
    ADD COLUMN dept_code VARCHAR(20) NULL COMMENT '조직도 부서 코드(pms_org_dept.dept_code 소프트 참조). 동명 부서를 구분하는 필터 축';

CREATE INDEX idx_person_dept_code ON pms_person(dept_code);

-- ---------------------------------------------------------------------
-- 백필 — 부서명이 조직도에서 **유일하게** 매칭되는 내부 인력만 채운다.
--   동명 부서가 다수인 이름(재무팀 등)은 어느 부서인지 확정할 수 없다. 아무거나 고르면
--   지금의 오염을 데이터로 굳히는 셈이므로 NULL로 남긴다(= 부서 미상).
--   남은 NULL은 다음 조직 동기화의 벌크 승격이 사번(amaranth_emp_no) 기준으로 정확히 채운다.
-- ---------------------------------------------------------------------
UPDATE pms_person p
  JOIN (SELECT dept_nm, MIN(dept_code) AS dept_code
          FROM pms_org_dept
         WHERE dept_nm IS NOT NULL AND dept_nm <> ''
         GROUP BY dept_nm
        HAVING COUNT(*) = 1) uniq
    ON uniq.dept_nm = p.department
   SET p.dept_code = uniq.dept_code
 WHERE p.source = 'INTERNAL'
   AND p.dept_code IS NULL;
