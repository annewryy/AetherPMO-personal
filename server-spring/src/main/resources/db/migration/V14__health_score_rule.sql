-- V14 — 0026 §A D3: 건강도 점수(HEALTH_SCORE) 전역 규칙 시드.
--   대시보드 "주의가 필요한 프로젝트" 감점 가중치를 관리자 콘솔(신호 규칙)에서 수정할 수 있게
--   pms_signal_rule 1행으로 둔다. action=SHOW(표시 전용) — evaluate()는 미지 metric이라 생략(fail-closed).
--   params 키: delay·issueHigh·issueMid·issueLow(건당)·overdueDeliverablePer(건당)·progressGapMax(상한)
--             ·warnBelow·dangerBelow(레벨 경계). 행이 없으면 서비스가 동일 기본값을 사용한다.
INSERT INTO pms_signal_rule (project_id, name, metric, operator, threshold, params, action, enabled)
SELECT NULL, '건강도 점수 가중치', 'HEALTH_SCORE', 'LT', NULL,
       '{"delay":-25,"issueHigh":-15,"issueMid":-10,"issueLow":-5,"overdueDeliverablePer":-3,"progressGapMax":-15,"warnBelow":70,"dangerBelow":50}',
       'SHOW', 1
 WHERE NOT EXISTS (SELECT 1 FROM pms_signal_rule WHERE metric = 'HEALTH_SCORE');
