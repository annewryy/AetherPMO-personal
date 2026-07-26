-- V22 — 0035: pms_user.person_id 백필 재시도(0005 §G).
--   V20 이메일 매칭이 0건(이메일 체계 불일치) → 조직 미러 경유 이름 매칭으로 보강:
--   user.username = org_member.mber_id → mber_nm 과 동명이 pms_person에 정확히 1명일 때만 연결(동명이인 제외).
--   잔여 미연결은 관리자 콘솔 > 사용자에서 수동 연결.
UPDATE pms_user u
  JOIN pms_org_member om ON om.mber_id = u.username
  JOIN pms_person p ON p.name = om.mber_nm
   SET u.person_id = p.person_id
 WHERE u.person_id IS NULL
   AND (SELECT COUNT(*) FROM pms_person p2 WHERE p2.name = om.mber_nm) = 1;
