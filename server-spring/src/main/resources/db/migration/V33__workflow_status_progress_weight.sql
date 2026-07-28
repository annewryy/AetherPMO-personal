-- 0039 — 워크플로 상태별 진척률(%) 지정. 산출물 진척은 "승인/전체" 개수 비율이라 작성중·제출·
--   검토중이 전부 0%로 같게 취급됐다. 상태마다 가중치를 두고 그 평균을 태스크 진척률로 쓴다.
ALTER TABLE pms_workflow_status
  ADD COLUMN progress_weight INT NULL COMMENT '이 상태의 진척률(%) 0~100 — 산출물 기반 태스크 진척 산정에 사용';

ALTER TABLE pms_workflow_status
  ADD CONSTRAINT chk_pms_wf_status_progress CHECK (progress_weight IS NULL OR progress_weight BETWEEN 0 AND 100);

-- 기본 워크플로('산출물 승인') 초기값 — 관리자 콘솔에서 언제든 수정 가능.
UPDATE pms_workflow_status SET progress_weight = CASE code
    WHEN 'DRAFT'        THEN 0
    WHEN 'SUBMITTED'    THEN 30
    WHEN 'UNDER_REVIEW' THEN 60
    WHEN 'APPROVED'     THEN 100
    WHEN 'REJECTED'     THEN 20
    ELSE progress_weight END
 WHERE workflow_id = 1;
