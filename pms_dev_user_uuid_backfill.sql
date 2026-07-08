-- ============================================================================
-- AetherPMS 개발용 시드: 참여인력 user_uid 백필 (0012 멘션·알림 데모 활성화)
--   배경: 인증(0005) 전이라 pms_project_member.user_uid가 전부 null → 멘션 대상·
--         현재 사용자·알림 수신자가 성립 안 함. dev에서 결정적 uuid를 부여해 데모 동작.
--   교체: 0005 아마란스 SSO 도입 시 실제 신원 uuid로 대체(이 시드는 폐기).
--   멱등: user_uid가 null인 행에만, 이름 기반 결정적 uuid(uuid_generate_v5 대체 = md5→uuid)로 부여.
-- ============================================================================

-- 이름 기준 결정적 uuid: 같은 이름은 항상 같은 uuid(재실행 안전, 조인 안정)
update public.pms_project_member m
set user_uid = (
  -- md5(이름) 16바이트를 uuid 포맷으로 (버전/변이 비트는 dev용이라 엄밀 준수 안 함)
  (substr(md5('aether-dev:' || coalesce(m.name, m.member_id::text)), 1, 8)  || '-' ||
   substr(md5('aether-dev:' || coalesce(m.name, m.member_id::text)), 9, 4)  || '-' ||
   substr(md5('aether-dev:' || coalesce(m.name, m.member_id::text)), 13, 4) || '-' ||
   substr(md5('aether-dev:' || coalesce(m.name, m.member_id::text)), 17, 4) || '-' ||
   substr(md5('aether-dev:' || coalesce(m.name, m.member_id::text)), 21, 12))::uuid
)
where m.user_uid is null;

-- 확인용(주석): select member_id, name, user_uid from public.pms_project_member order by project_id, member_id;
