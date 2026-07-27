-- V27 — 0034 2단계: 프로젝트 내 역할(④, participation_role)별 전역 관리포인트 권한.
CREATE TABLE pms_role_capability (
  role_code    VARCHAR(10) NOT NULL PRIMARY KEY,
  capabilities TEXT NOT NULL COMMENT '0034 §3 어휘 JSON(project.edit/member.manage/task.edit 등)',
  updated_at   DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
);

-- 기본값(관리자 콘솔 > 프로젝트 역할 권한에서 편집 가능). all=전체, own=본인 담당만, false=불가.
INSERT INTO pms_role_capability (role_code, capabilities) VALUES
  ('EXEC', '{"project.edit":true,"member.manage":true,"task.edit":"all","issue.edit":"all","action.edit":"all","deliverable.edit":"all","meeting.write":true,"doc.write":true}'),
  ('PM',   '{"project.edit":true,"member.manage":true,"task.edit":"all","issue.edit":"all","action.edit":"all","deliverable.edit":"all","meeting.write":true,"doc.write":true}'),
  ('PL',   '{"project.edit":false,"member.manage":false,"task.edit":"all","issue.edit":"all","action.edit":"all","deliverable.edit":"all","meeting.write":true,"doc.write":true}'),
  ('PMO',  '{"project.edit":false,"member.manage":false,"task.edit":"all","issue.edit":"all","action.edit":"all","deliverable.edit":"all","meeting.write":true,"doc.write":true}'),
  ('TA',   '{"project.edit":false,"member.manage":false,"task.edit":"own","issue.edit":"own","action.edit":"own","deliverable.edit":"own","meeting.write":true,"doc.write":false}'),
  ('AA',   '{"project.edit":false,"member.manage":false,"task.edit":"own","issue.edit":"own","action.edit":"own","deliverable.edit":"own","meeting.write":true,"doc.write":false}'),
  ('DA',   '{"project.edit":false,"member.manage":false,"task.edit":"own","issue.edit":"own","action.edit":"own","deliverable.edit":"own","meeting.write":true,"doc.write":false}'),
  ('DBA',  '{"project.edit":false,"member.manage":false,"task.edit":"own","issue.edit":"own","action.edit":"own","deliverable.edit":"own","meeting.write":true,"doc.write":false}'),
  ('SE',   '{"project.edit":false,"member.manage":false,"task.edit":"own","issue.edit":"own","action.edit":"own","deliverable.edit":"own","meeting.write":true,"doc.write":false}'),
  ('DEV',  '{"project.edit":false,"member.manage":false,"task.edit":"own","issue.edit":"own","action.edit":"own","deliverable.edit":"own","meeting.write":true,"doc.write":false}'),
  ('QA',   '{"project.edit":false,"member.manage":false,"task.edit":"own","issue.edit":"own","action.edit":"own","deliverable.edit":"own","meeting.write":true,"doc.write":false}'),
  ('CT',   '{"project.edit":false,"member.manage":false,"task.edit":"own","issue.edit":"own","action.edit":"own","deliverable.edit":"own","meeting.write":true,"doc.write":false}'),
  ('ETC',  '{"project.edit":false,"member.manage":false,"task.edit":false,"issue.edit":false,"action.edit":false,"deliverable.edit":false,"meeting.write":false,"doc.write":false}');
