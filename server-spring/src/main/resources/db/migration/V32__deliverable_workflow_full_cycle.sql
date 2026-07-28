-- 0039 — '산출물 승인' 워크플로가 단방향(작성중→제출, 검토중→승인)뿐이라 승인 이후 되돌릴 수
--   없었고, 제출→검토중 경로조차 없어 실제 결재 흐름이 끊겼다. 반려 상태 신설 + 왕복 전이 보강.
--   (pms_deliverable.status 화이트리스트에는 REJECTED가 이미 있음 — 워크플로 정의에만 없었다)

-- 반려 상태(status_id는 AUTO_INCREMENT)
INSERT INTO pms_workflow_status (workflow_id, code, name, category, is_initial, is_final, sort_order)
SELECT 1, 'REJECTED', '반려', 'IN_PROGRESS', 0, 0, 5
 WHERE NOT EXISTS (SELECT 1 FROM pms_workflow_status WHERE workflow_id = 1 AND code = 'REJECTED');

-- 누락된 전이 보강. 이름은 화면 버튼 라벨로 쓰인다.
INSERT INTO pms_workflow_transition (workflow_id, from_status_id, to_status_id, name)
SELECT 1, f.status_id, t.status_id, v.label
  FROM (
        SELECT 'SUBMITTED' AS f_code, 'UNDER_REVIEW' AS t_code, '검토 시작' AS label
  UNION ALL SELECT 'SUBMITTED',    'DRAFT',        '회수'
  UNION ALL SELECT 'UNDER_REVIEW', 'REJECTED',     '반려'
  UNION ALL SELECT 'REJECTED',     'DRAFT',        '재작업'
  UNION ALL SELECT 'REJECTED',     'SUBMITTED',    '재제출'
  UNION ALL SELECT 'APPROVED',     'UNDER_REVIEW', '승인 취소(재검토)'
  UNION ALL SELECT 'APPROVED',     'DRAFT',        '승인 취소(재작업)'
       ) v
  JOIN pms_workflow_status f ON f.workflow_id = 1 AND f.code = v.f_code
  JOIN pms_workflow_status t ON t.workflow_id = 1 AND t.code = v.t_code
 WHERE NOT EXISTS (
        SELECT 1 FROM pms_workflow_transition x
         WHERE x.workflow_id = 1 AND x.from_status_id = f.status_id AND x.to_status_id = t.status_id);

-- 승인은 더 이상 최종 상태가 아니다(되돌릴 수 있음).
UPDATE pms_workflow_status SET is_final = 0 WHERE workflow_id = 1 AND code = 'APPROVED';
