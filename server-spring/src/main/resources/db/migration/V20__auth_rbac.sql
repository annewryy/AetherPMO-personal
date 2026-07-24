-- V20 — 0031 §A: 자체 로그인 + RBAC + 사용자 테이블 정리.
--   pms_user: person_id FK(단일 사람 마스터 연결, 0005 §G) · password_algo · role 5종 확장.
--   pms_session: 로그인 세션 토큰. dev 역할별 계정 시드(초기 비번 pms1234!, PBKDF2).

-- 1) role 5종 확장 + 기존값 매핑(ADMIN→SYS_ADMIN, MEMBER→WORKER, PM 유지)
--    V19(한글 코멘트)가 명명 CHECK(chk_pms_user_role, 구 3종)를 재부여하므로 값 변경 전 드롭.
ALTER TABLE pms_user DROP CONSTRAINT IF EXISTS chk_pms_user_role;
UPDATE pms_user SET role = 'SYS_ADMIN' WHERE role = 'ADMIN';
UPDATE pms_user SET role = 'WORKER'    WHERE role = 'MEMBER';
ALTER TABLE pms_user
    ADD CONSTRAINT chk_pms_user_role
        CHECK (role IN ('SYS_ADMIN','EXEC_ADMIN','PM','WORKER','VIEWER'));

-- 2) 사람 마스터 연결 + 해시 알고리즘 태그
ALTER TABLE pms_user
    ADD COLUMN person_id BIGINT NULL,
    ADD COLUMN password_algo VARCHAR(20) NULL,
    ADD CONSTRAINT fk_user_person FOREIGN KEY (person_id)
        REFERENCES pms_person(person_id) ON DELETE SET NULL;

-- 3) 세션
CREATE TABLE pms_session (
    token      CHAR(64) PRIMARY KEY,
    user_id    BIGINT NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    expires_at DATETIME(6) NOT NULL,
    CONSTRAINT fk_session_user FOREIGN KEY (user_id)
        REFERENCES pms_user(user_id) ON DELETE CASCADE
);
CREATE INDEX idx_session_user ON pms_session(user_id);

-- 4) dev 역할별 계정(초기 비번 pms1234! — 최초 로그인 후 변경 권장). password_algo=pbkdf2-sha256.
INSERT INTO pms_user (username, email, password, password_algo, full_name, role, is_active) VALUES
 ('admin',  'admin@aetherpms.local',  'pbkdf2-sha256$100000$x+mJKKgJZwfcz98B0pPNNQ==$277wrPPdPOlYlpkjz7JW8h6ybn35AIeOB4rB8GVq+08=', 'pbkdf2-sha256', '시스템관리자', 'SYS_ADMIN', 1),
 ('exec',   'exec@aetherpms.local',   'pbkdf2-sha256$100000$fjF0smcbhfY3Z1Qi66sRZQ==$0l+3IrKIG0q+atgSFY13BICet4rWbDxr2NtjuAeL388=', 'pbkdf2-sha256', '사업총괄',   'EXEC_ADMIN', 1),
 ('pm',     'pm@aetherpms.local',     'pbkdf2-sha256$100000$1xWEGzNHe9/WWdjvR6+BzA==$4iro+188aqJ9QzML4s6Y80FCpxjrwRzkfw8zoKkDH80=', 'pbkdf2-sha256', '프로젝트매니저', 'PM', 1),
 ('worker', 'worker@aetherpms.local', 'pbkdf2-sha256$100000$TAmXrRmEPYJexbeAvAGZvA==$NovaeQ9TU9xxBIKqAfjWIySYlkgrncfnT8XnADV8HRw=', 'pbkdf2-sha256', '수행담당',   'WORKER', 1),
 ('viewer', 'viewer@aetherpms.local', 'pbkdf2-sha256$100000$/gqrDMrtQvH8i7SgDFd4ww==$h7W3XqXf+tollpkbRIJcY+DcnWm8uUipLYA1NeIJ9mo=', 'pbkdf2-sha256', '조회자',     'VIEWER', 1);

-- 5) RBAC 시행 스위치(dev 점진 적용) — OFF: 게이트 안 함(로그인 없이 사용 가능, 현행 유지)
INSERT INTO pms_app_setting (setting_key, setting_value) VALUES ('rbac.enforce', 'false')
    ON DUPLICATE KEY UPDATE setting_key = setting_key;
