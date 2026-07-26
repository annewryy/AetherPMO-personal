-- V21 — 0034 후속(요구 0004 §4): 프로젝트 코드 발번 패턴을 설정으로 커스터마이징.
--   토큰: {연도}=4자리 연도 · {연도2}=2자리 연도 · {순번}=연도별 순번(3자리 0패딩).
--   예: 'PRJ-{연도}-{순번}' → PRJ-2026-005 · 'OKC{연도2}-{순번}' → OKC26-005 (테일러링 가이드 OKC26 체계).
--   {순번}은 필수(코드 유일성). 관리자 콘솔 > 테일러링에서 수정.
INSERT INTO pms_app_setting (setting_key, setting_value)
SELECT 'project.code.pattern', 'PRJ-{연도}-{순번}'
 WHERE NOT EXISTS (SELECT 1 FROM pms_app_setting WHERE setting_key = 'project.code.pattern');
