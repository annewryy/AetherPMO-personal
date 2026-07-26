-- =====================================================================
-- V19 — 전 테이블/컬럼 한글 코멘트 (설계 0010 A-5 + 후속 스키마 문서화)
--   출처: pms_korean_comments.sql, V7~V17 헤더, 설계 0005/0012/0016/0019/0020/0026/0029
--   스키마/데이터 의미 변경 없음. COMMENT 설정.
--   MODIFY COLUMN 은 인라인/관련 CHECK 를 제거하므로 하단에서 명명 CHECK 를 재추가한다.
-- =====================================================================

-- bid_target_agencies
ALTER TABLE `bid_target_agencies` COMMENT = '나라장터 공고조회 대상기관 마스터';
ALTER TABLE `bid_target_agencies`
  MODIFY COLUMN `id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '기관 ID',
  MODIFY COLUMN `agency_name` varchar(200) NOT NULL COMMENT '기관명 (나라장터 조회 키)',
  MODIFY COLUMN `sort_order` int(11) NOT NULL DEFAULT 0 COMMENT '정렬 순서',
  MODIFY COLUMN `is_default` tinyint(4) NOT NULL DEFAULT 0 COMMENT '기본 선택 여부',
  MODIFY COLUMN `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '생성 일시',
  MODIFY COLUMN `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '수정 일시';

-- pms_action_item
ALTER TABLE `pms_action_item` COMMENT = '액션 아이템 (조치, to-do)';
ALTER TABLE `pms_action_item`
  MODIFY COLUMN `action_id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '액션 ID',
  MODIFY COLUMN `project_id` bigint(20) NOT NULL COMMENT '프로젝트 ID (참조)',
  MODIFY COLUMN `title` text NOT NULL COMMENT '제목',
  MODIFY COLUMN `assignee_uid` char(36) DEFAULT NULL COMMENT '담당자 ID (uuid)',
  MODIFY COLUMN `assignee_name` text DEFAULT NULL COMMENT '담당자 이름 (스냅샷)',
  MODIFY COLUMN `due_date` date DEFAULT NULL COMMENT '기한',
  MODIFY COLUMN `status` varchar(4) DEFAULT NULL COMMENT '상태 (대기, 진행, 완료)',
  MODIFY COLUMN `confirm_comment` text DEFAULT NULL COMMENT '확인 코멘트 (deprecated, A-3 이관)',
  MODIFY COLUMN `related_issue_id` bigint(20) DEFAULT NULL COMMENT '대응 리스크/이슈 ID (null=독립 조치)',
  MODIFY COLUMN `display_code` varchar(50) DEFAULT NULL COMMENT '표시 코드 (A-{순번})',
  MODIFY COLUMN `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '생성 일시',
  MODIFY COLUMN `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '수정 일시';

-- pms_app_setting
ALTER TABLE `pms_app_setting` COMMENT = '앱 설정 (key-value)';
ALTER TABLE `pms_app_setting`
  MODIFY COLUMN `setting_key` varchar(100) NOT NULL COMMENT '설정 키',
  MODIFY COLUMN `setting_value` text DEFAULT NULL COMMENT '설정 값',
  MODIFY COLUMN `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6) COMMENT '수정 일시';

-- pms_attachment
ALTER TABLE `pms_attachment` COMMENT = '첨부 파일';
ALTER TABLE `pms_attachment`
  MODIFY COLUMN `attachment_id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '첨부 ID',
  MODIFY COLUMN `entity_type` varchar(30) NOT NULL COMMENT '엔티티 유형',
  MODIFY COLUMN `entity_id` bigint(20) NOT NULL COMMENT '엔티티 ID',
  MODIFY COLUMN `file_ref` varchar(200) NOT NULL COMMENT '파일 참조 (저장 경로)',
  MODIFY COLUMN `file_name` varchar(300) DEFAULT NULL COMMENT '파일명 (표시용)',
  MODIFY COLUMN `file_size` bigint(20) DEFAULT NULL COMMENT '파일 크기 (바이트)',
  MODIFY COLUMN `content_type` varchar(100) DEFAULT NULL COMMENT '콘텐츠 타입 (MIME)',
  MODIFY COLUMN `sort_order` int(11) DEFAULT 0 COMMENT '정렬 순서',
  MODIFY COLUMN `uploaded_by` char(36) DEFAULT NULL COMMENT '업로드 사용자 ID (uuid)',
  MODIFY COLUMN `uploaded_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '업로드 일시',
  MODIFY COLUMN `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '생성 일시',
  MODIFY COLUMN `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '수정 일시';

-- pms_audit_log
ALTER TABLE `pms_audit_log` COMMENT = '변경 이력 (모든 엔티티 UPDATE/DELETE 기록)';
ALTER TABLE `pms_audit_log`
  MODIFY COLUMN `audit_id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '감사 ID',
  MODIFY COLUMN `entity_type` varchar(40) NOT NULL COMMENT '엔티티 유형 (PROJECT, TASK, DELIVERABLE 등)',
  MODIFY COLUMN `entity_id` bigint(20) NOT NULL COMMENT '엔티티 ID',
  MODIFY COLUMN `project_id` bigint(20) DEFAULT NULL COMMENT '프로젝트 ID (컨텍스트)',
  MODIFY COLUMN `action` varchar(10) NOT NULL COMMENT '액션 (INSERT, UPDATE, DELETE)',
  MODIFY COLUMN `changed_fields` longtext DEFAULT NULL COMMENT '변경 필드 목록',
  MODIFY COLUMN `before` longtext DEFAULT NULL COMMENT '변경 전 값 (JSON)',
  MODIFY COLUMN `after` longtext DEFAULT NULL COMMENT '변경 후 값 (JSON)',
  MODIFY COLUMN `changed_by_uid` char(36) DEFAULT NULL COMMENT '변경 사용자 ID (uuid)',
  MODIFY COLUMN `changed_by_name` text DEFAULT NULL COMMENT '변경 사용자 이름',
  MODIFY COLUMN `reason` text DEFAULT NULL COMMENT '변경 사유',
  MODIFY COLUMN `changed_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '변경 일시';

-- pms_catalog_node
ALTER TABLE `pms_catalog_node` COMMENT = '카탈로그 노드 (PHASE > ACTIVITY > TASK > DELIVERABLE)';
ALTER TABLE `pms_catalog_node`
  MODIFY COLUMN `node_id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '노드 ID',
  MODIFY COLUMN `parent_node_id` bigint(20) DEFAULT NULL COMMENT '부모 노드 ID',
  MODIFY COLUMN `node_type` varchar(20) NOT NULL COMMENT '노드 유형 (PHASE, ACTIVITY, TASK, DELIVERABLE)',
  MODIFY COLUMN `code` varchar(40) DEFAULT NULL COMMENT '노드 코드 (표시 코드에 상속: T-CT-2 등)',
  MODIFY COLUMN `name` varchar(300) NOT NULL COMMENT '노드명',
  MODIFY COLUMN `description` text DEFAULT NULL COMMENT '노드 설명',
  MODIFY COLUMN `is_optional` tinyint(1) NOT NULL DEFAULT 0 COMMENT '선택(옵션) 여부',
  MODIFY COLUMN `sort_order` int(11) NOT NULL DEFAULT 0 COMMENT '정렬 순서',
  MODIFY COLUMN `seq_no` int(11) DEFAULT NULL COMMENT '순번',
  MODIFY COLUMN `deliverable_category` varchar(100) DEFAULT NULL COMMENT '산출물 분류',
  MODIFY COLUMN `stage` varchar(20) DEFAULT NULL COMMENT '단계',
  MODIFY COLUMN `template_file_ref` varchar(200) DEFAULT NULL COMMENT '템플릿 파일 참조';
ALTER TABLE `pms_catalog_node`
  MODIFY COLUMN `template_tags` longtext DEFAULT NULL COMMENT '템플릿 태그 (JSON)',
  MODIFY COLUMN `workflow_id` bigint(20) DEFAULT NULL COMMENT '워크플로 ID (참조)',
  MODIFY COLUMN `is_active` tinyint(1) NOT NULL DEFAULT 1 COMMENT '활성 여부 (비활성 노드는 신규 테일러링 제외)',
  MODIFY COLUMN `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '생성 일시',
  MODIFY COLUMN `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '수정 일시',
  MODIFY COLUMN `methodology` varchar(10) DEFAULT NULL COMMENT '표준 방법론 (OPMS/ODS/OMS/BIS, NULL=표준 외)',
  MODIFY COLUMN `required_small` tinyint(1) DEFAULT NULL COMMENT '소규모 필수 여부 (10억↓)',
  MODIFY COLUMN `required_medium` tinyint(1) DEFAULT NULL COMMENT '중규모 필수 여부 (10~50억)',
  MODIFY COLUMN `required_large` tinyint(1) DEFAULT NULL COMMENT '대규모 필수 여부 (50억↑)',
  MODIFY COLUMN `doc_format` varchar(20) DEFAULT NULL COMMENT '문서 형식 (예: .hwpx)',
  MODIFY COLUMN `file_name_base` varchar(300) DEFAULT NULL COMMENT '실제 작성 파일명 베이스',
  MODIFY COLUMN `doc_template_id` bigint(20) DEFAULT NULL COMMENT '기본 양식 템플릿 ID (FK)';

-- pms_code_counter
ALTER TABLE `pms_code_counter` COMMENT = '표시 코드 발번 카운터 (프로젝트×엔티티별 순번 관리)';
ALTER TABLE `pms_code_counter`
  MODIFY COLUMN `counter_id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '카운터 ID',
  MODIFY COLUMN `project_id` bigint(20) NOT NULL COMMENT '프로젝트 ID (참조)',
  MODIFY COLUMN `entity_type` varchar(20) NOT NULL COMMENT '엔티티 유형 (TASK, DELIVERABLE, ISSUE, ACTION_ITEM)',
  MODIFY COLUMN `last_seq` bigint(20) NOT NULL DEFAULT 0 COMMENT '마지막 발번 순번 (upsert로 동시성 안전)';

-- pms_comment
ALTER TABLE `pms_comment` COMMENT = '범용 코멘트 (TASK/DELIVERABLE/ISSUE/ACTION_ITEM 공통, 상태변경 이력)';
ALTER TABLE `pms_comment`
  MODIFY COLUMN `comment_id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '코멘트 ID',
  MODIFY COLUMN `entity_type` varchar(20) NOT NULL COMMENT '엔티티 유형 (TASK, DELIVERABLE, ISSUE, ACTION_ITEM, PROJECT)',
  MODIFY COLUMN `entity_id` bigint(20) NOT NULL COMMENT '엔티티 ID (참조)',
  MODIFY COLUMN `project_id` bigint(20) NOT NULL COMMENT '프로젝트 ID (참조, cascade delete)',
  MODIFY COLUMN `body` text NOT NULL COMMENT '코멘트 본문',
  MODIFY COLUMN `comment_type` varchar(20) NOT NULL DEFAULT 'COMMENT' COMMENT '코멘트 유형 (COMMENT: 일반, STATUS_CHANGE: 상태변경 자동 기록)',
  MODIFY COLUMN `status_from` varchar(40) DEFAULT NULL COMMENT '상태 변경 시작값 (STATUS_CHANGE일 때만)',
  MODIFY COLUMN `status_to` varchar(40) DEFAULT NULL COMMENT '상태 변경 종료값 (STATUS_CHANGE일 때만)',
  MODIFY COLUMN `parent_comment_id` bigint(20) DEFAULT NULL COMMENT '대댓글(답글) 부모. null=최상위 코멘트',
  MODIFY COLUMN `author_uid` char(36) DEFAULT NULL COMMENT '작성자 ID (uuid)',
  MODIFY COLUMN `author_name` text DEFAULT NULL COMMENT '작성자 이름 (스냅샷, 이력성)',
  MODIFY COLUMN `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '생성 일시';

-- pms_company
ALTER TABLE `pms_company` COMMENT = '회사 마스터 (자사, 협력사, 고객사)';
ALTER TABLE `pms_company`
  MODIFY COLUMN `company_id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '회사 ID',
  MODIFY COLUMN `company_name` varchar(200) NOT NULL COMMENT '회사명',
  MODIFY COLUMN `company_type` varchar(20) DEFAULT NULL COMMENT '회사 유형 (OWN:자사, PARTNER:협력사, CLIENT:고객사)',
  MODIFY COLUMN `is_active` tinyint(1) DEFAULT 1 COMMENT '활성 여부',
  MODIFY COLUMN `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '생성 일시',
  MODIFY COLUMN `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '수정 일시',
  MODIFY COLUMN `agency_code` varchar(50) DEFAULT NULL COMMENT '나라장터 수요기관코드 (매칭 키)';

-- pms_contact_point
ALTER TABLE `pms_contact_point` COMMENT = '프로젝트 담당자 연락처 (등록/외부 인물)';
ALTER TABLE `pms_contact_point`
  MODIFY COLUMN `contact_id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '담당자 ID',
  MODIFY COLUMN `project_id` bigint(20) NOT NULL COMMENT '프로젝트 ID (참조)',
  MODIFY COLUMN `field` varchar(100) DEFAULT NULL COMMENT '담당 분야/역할 라벨',
  MODIFY COLUMN `contact_type` varchar(20) NOT NULL COMMENT '유형 (INTERNAL: 등록 사용자, EXTERNAL: 미등록 외부 인물)',
  MODIFY COLUMN `user_id` char(36) DEFAULT NULL COMMENT '사용자 ID (INTERNAL일 때만)',
  MODIFY COLUMN `name` varchar(200) DEFAULT NULL COMMENT '담당자 이름',
  MODIFY COLUMN `company` varchar(200) DEFAULT NULL COMMENT '회사명 (문자열 스냅샷)',
  MODIFY COLUMN `company_id` bigint(20) DEFAULT NULL COMMENT '회사 ID (FK pms_company)',
  MODIFY COLUMN `title` varchar(200) DEFAULT NULL COMMENT '직함 (예: 부장, 과장)',
  MODIFY COLUMN `phone` varchar(50) DEFAULT NULL COMMENT '연락처',
  MODIFY COLUMN `email` varchar(200) DEFAULT NULL COMMENT '이메일',
  MODIFY COLUMN `note` text DEFAULT NULL COMMENT '비고 (미매칭 회사명 등)';
ALTER TABLE `pms_contact_point`
  MODIFY COLUMN `sort_order` int(11) NOT NULL DEFAULT 0 COMMENT '정렬 순서',
  MODIFY COLUMN `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '생성 일시',
  MODIFY COLUMN `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '수정 일시';

-- pms_deliverable
ALTER TABLE `pms_deliverable` COMMENT = '산출물 (카탈로그 전개 또는 커스텀)';
ALTER TABLE `pms_deliverable`
  MODIFY COLUMN `deliverable_id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '산출물 ID',
  MODIFY COLUMN `project_id` bigint(20) NOT NULL COMMENT '프로젝트 ID (참조)',
  MODIFY COLUMN `task_id` bigint(20) DEFAULT NULL COMMENT '태스크 ID (참조)',
  MODIFY COLUMN `deliverable_name` varchar(300) NOT NULL COMMENT '산출물명',
  MODIFY COLUMN `deliverable_type` varchar(50) DEFAULT NULL COMMENT '산출물 유형',
  MODIFY COLUMN `status` varchar(20) NOT NULL DEFAULT 'DRAFT' COMMENT '상태 (workflow 정의에 따름)',
  MODIFY COLUMN `version_no` varchar(20) DEFAULT '1.0' COMMENT '버전 번호',
  MODIFY COLUMN `submitted_by` char(36) DEFAULT NULL COMMENT '제출자 ID (uuid)',
  MODIFY COLUMN `submitted_at` datetime(6) DEFAULT NULL COMMENT '제출 일시',
  MODIFY COLUMN `reviewed_by` char(36) DEFAULT NULL COMMENT '검토자 ID (uuid)',
  MODIFY COLUMN `reviewed_at` datetime(6) DEFAULT NULL COMMENT '검토 일시',
  MODIFY COLUMN `review_comment` text DEFAULT NULL COMMENT '검토 의견';
ALTER TABLE `pms_deliverable`
  MODIFY COLUMN `approved_by` char(36) DEFAULT NULL COMMENT '승인자 ID (uuid)',
  MODIFY COLUMN `approved_at` datetime(6) DEFAULT NULL COMMENT '승인 일시',
  MODIFY COLUMN `approval_comment` text DEFAULT NULL COMMENT '승인 의견',
  MODIFY COLUMN `catalog_node_id` bigint(20) DEFAULT NULL COMMENT '카탈로그 노드 ID (있으면 테일러링 전개분)',
  MODIFY COLUMN `due_date` date DEFAULT NULL COMMENT '제출 기한',
  MODIFY COLUMN `author_name` text DEFAULT NULL COMMENT '작성자 이름 (스냅샷)',
  MODIFY COLUMN `file_name` text DEFAULT NULL COMMENT '파일명 (표시용 스냅샷)',
  MODIFY COLUMN `display_code` varchar(50) DEFAULT NULL COMMENT '표시 코드 (D-{카탈로그코드} 또는 D-{순번})',
  MODIFY COLUMN `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '생성 일시',
  MODIFY COLUMN `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '수정 일시',
  MODIFY COLUMN `created_by` char(36) DEFAULT NULL COMMENT '생성자 ID (uuid)',
  MODIFY COLUMN `updated_by` char(36) DEFAULT NULL COMMENT '수정자 ID (uuid)';

-- pms_deliverable_version
ALTER TABLE `pms_deliverable_version` COMMENT = '산출물 버전 이력';
ALTER TABLE `pms_deliverable_version`
  MODIFY COLUMN `version_id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '버전 ID',
  MODIFY COLUMN `deliverable_id` bigint(20) NOT NULL COMMENT '산출물 ID (참조)',
  MODIFY COLUMN `version_no` varchar(40) NOT NULL COMMENT '버전 번호',
  MODIFY COLUMN `status` varchar(40) DEFAULT NULL COMMENT '버전 상태',
  MODIFY COLUMN `file_ref` text DEFAULT NULL COMMENT '파일 참조 (원챔버 경로)',
  MODIFY COLUMN `file_name` text DEFAULT NULL COMMENT '파일명 (표시용 스냅샷)',
  MODIFY COLUMN `change_comment` text DEFAULT NULL COMMENT '변경 사항 설명',
  MODIFY COLUMN `created_by_uid` char(36) DEFAULT NULL COMMENT '생성자 ID (uuid)',
  MODIFY COLUMN `created_by_name` text DEFAULT NULL COMMENT '생성자 이름 (스냅샷)',
  MODIFY COLUMN `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '생성 일시';

-- pms_doc_template
ALTER TABLE `pms_doc_template` COMMENT = '산출물 양식(문서 템플릿) 마스터';
ALTER TABLE `pms_doc_template`
  MODIFY COLUMN `template_id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '템플릿 ID',
  MODIFY COLUMN `name` varchar(300) NOT NULL COMMENT '양식명',
  MODIFY COLUMN `category` varchar(100) DEFAULT NULL COMMENT '분류 (착수/수행/종료단계 등)',
  MODIFY COLUMN `doc_format` varchar(20) DEFAULT NULL COMMENT '문서 형식',
  MODIFY COLUMN `file_ref` varchar(500) DEFAULT NULL COMMENT '파일 참조 (경로/파일명)',
  MODIFY COLUMN `description` text DEFAULT NULL COMMENT '설명',
  MODIFY COLUMN `is_active` tinyint(1) NOT NULL DEFAULT 1 COMMENT '활성 여부',
  MODIFY COLUMN `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '생성 일시',
  MODIFY COLUMN `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6) COMMENT '수정 일시';

-- pms_insourcing_transition
ALTER TABLE `pms_insourcing_transition` COMMENT = '자사화 전환 프로세스 (비자사→insourced)';
ALTER TABLE `pms_insourcing_transition`
  MODIFY COLUMN `transition_id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '전환 ID',
  MODIFY COLUMN `person_id` bigint(20) NOT NULL COMMENT '인력 ID (FK pms_person)',
  MODIFY COLUMN `from_type` varchar(20) NOT NULL COMMENT '전환 전 employment_type (비자사)',
  MODIFY COLUMN `to_type` varchar(20) NOT NULL DEFAULT 'insourced' COMMENT '전환 후 employment_type (기본: insourced)',
  MODIFY COLUMN `status` varchar(20) NOT NULL DEFAULT 'REQUESTED' COMMENT '상태 (REQUESTED/DOC_SENT/APPROVED/REJECTED/CANCELED)',
  MODIFY COLUMN `reason` text DEFAULT NULL COMMENT '전환 사유',
  MODIFY COLUMN `official_doc_ref` varchar(200) DEFAULT NULL COMMENT '아마란스 공문 번호',
  MODIFY COLUMN `decision_note` text DEFAULT NULL COMMENT '승인/반려 메모',
  MODIFY COLUMN `requested_by` varchar(36) DEFAULT NULL COMMENT '요청자 ID (uuid)',
  MODIFY COLUMN `requested_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '요청 일시',
  MODIFY COLUMN `doc_sent_at` datetime(6) DEFAULT NULL COMMENT '공문 발신 일시',
  MODIFY COLUMN `decided_by` varchar(36) DEFAULT NULL COMMENT '결정자 ID (uuid)';
ALTER TABLE `pms_insourcing_transition`
  MODIFY COLUMN `decided_at` datetime(6) DEFAULT NULL COMMENT '결정 일시',
  MODIFY COLUMN `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6) COMMENT '수정 일시';

-- pms_issue
ALTER TABLE `pms_issue` COMMENT = '이슈/위험 (리스크 관리, type 플립 가능)';
ALTER TABLE `pms_issue`
  MODIFY COLUMN `issue_id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '이슈 ID',
  MODIFY COLUMN `project_id` bigint(20) NOT NULL COMMENT '프로젝트 ID (참조)',
  MODIFY COLUMN `title` text NOT NULL COMMENT '제목',
  MODIFY COLUMN `type` text NOT NULL COMMENT '유형 (리스크/이슈 등, 사용자 정의)',
  MODIFY COLUMN `priority` varchar(4) DEFAULT NULL COMMENT '우선순위 (상, 중, 하)',
  MODIFY COLUMN `owner_uid` char(36) DEFAULT NULL COMMENT '담당자 ID (uuid)',
  MODIFY COLUMN `owner_name` text DEFAULT NULL COMMENT '담당자 이름 (스냅샷)',
  MODIFY COLUMN `reported_date` date NOT NULL COMMENT '보고일',
  MODIFY COLUMN `resolved_date` date DEFAULT NULL COMMENT '해결일',
  MODIFY COLUMN `due_date` date DEFAULT NULL COMMENT '목표 해결일',
  MODIFY COLUMN `status` varchar(6) DEFAULT NULL COMMENT '상태 (발생, 조치중, 완료)',
  MODIFY COLUMN `review_comment` text DEFAULT NULL COMMENT '검토 코멘트 (deprecated, A-3 이관)';
ALTER TABLE `pms_issue`
  MODIFY COLUMN `source_rule_id` bigint(20) DEFAULT NULL COMMENT '자동 등록 마커 (신호 규칙 ID, null=수동)',
  MODIFY COLUMN `related_task_id` bigint(20) DEFAULT NULL COMMENT '파생 태스크 ID (null=프로젝트 수준/독립)',
  MODIFY COLUMN `display_code` varchar(50) DEFAULT NULL COMMENT '표시 코드 (I-{순번}, type 플립 후에도 불변)',
  MODIFY COLUMN `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '생성 일시',
  MODIFY COLUMN `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '수정 일시';

-- pms_meeting_minutes
ALTER TABLE `pms_meeting_minutes` COMMENT = '회의록';
ALTER TABLE `pms_meeting_minutes`
  MODIFY COLUMN `meeting_id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '회의 ID',
  MODIFY COLUMN `project_id` bigint(20) NOT NULL COMMENT '프로젝트 ID (참조)',
  MODIFY COLUMN `title` text NOT NULL COMMENT '회의 제목',
  MODIFY COLUMN `meet_date` datetime(6) NOT NULL COMMENT '회의 일시',
  MODIFY COLUMN `location` text DEFAULT NULL COMMENT '회의 장소',
  MODIFY COLUMN `attendees` longtext DEFAULT NULL COMMENT '참석자 목록 (JSON)',
  MODIFY COLUMN `content` text DEFAULT NULL COMMENT '회의록 내용',
  MODIFY COLUMN `remarks` text DEFAULT NULL COMMENT '비고',
  MODIFY COLUMN `author_uid` char(36) DEFAULT NULL COMMENT '작성자 ID (uuid)',
  MODIFY COLUMN `author_name` text DEFAULT NULL COMMENT '작성자 이름 (스냅샷)',
  MODIFY COLUMN `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '생성 일시',
  MODIFY COLUMN `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '수정 일시';

-- pms_member_availability
ALTER TABLE `pms_member_availability` COMMENT = '외부 인력 가용/근태 (일자별)';
ALTER TABLE `pms_member_availability`
  MODIFY COLUMN `avail_id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '가용 ID',
  MODIFY COLUMN `member_id` bigint(20) NOT NULL COMMENT '프로젝트 멤버 ID (참조)',
  MODIFY COLUMN `date` date NOT NULL COMMENT '일자',
  MODIFY COLUMN `availability` varchar(4) DEFAULT NULL COMMENT '가용 상태 (가능, 연차, 반차, 불가)',
  MODIFY COLUMN `note` text DEFAULT NULL COMMENT '비고',
  MODIFY COLUMN `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '생성 일시',
  MODIFY COLUMN `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '수정 일시';

-- pms_notification
ALTER TABLE `pms_notification` COMMENT = '알림 (멘션·답글·신호·워크플로 등)';
ALTER TABLE `pms_notification`
  MODIFY COLUMN `notification_id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '알림 ID',
  MODIFY COLUMN `recipient_uid` char(36) NOT NULL COMMENT '수신자 ID (uuid)',
  MODIFY COLUMN `type` varchar(20) NOT NULL DEFAULT 'MENTION' COMMENT '유형 (MENTION/REPLY/SIGNAL/WORKFLOW/DEADLINE/SYSTEM)',
  MODIFY COLUMN `project_id` bigint(20) DEFAULT NULL COMMENT '프로젝트 ID (null=전역/시스템)',
  MODIFY COLUMN `entity_type` varchar(20) NOT NULL COMMENT '알림 대상 엔티티 유형',
  MODIFY COLUMN `entity_id` bigint(20) NOT NULL COMMENT '알림 대상 엔티티 ID',
  MODIFY COLUMN `comment_id` bigint(20) DEFAULT NULL COMMENT '관련 코멘트 ID',
  MODIFY COLUMN `actor_uid` char(36) DEFAULT NULL COMMENT '유발 사용자 ID (시스템 발생은 null)',
  MODIFY COLUMN `actor_name` text DEFAULT NULL COMMENT '유발 사용자 이름 (스냅샷)',
  MODIFY COLUMN `preview` text DEFAULT NULL COMMENT '요약 (목록 표시)',
  MODIFY COLUMN `is_read` tinyint(1) NOT NULL DEFAULT 0 COMMENT '읽음 여부',
  MODIFY COLUMN `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '생성 일시';

-- pms_official_doc
ALTER TABLE `pms_official_doc` COMMENT = '전자결재 문서 (아마란스 연계)';
ALTER TABLE `pms_official_doc`
  MODIFY COLUMN `doc_id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '문서 ID',
  MODIFY COLUMN `project_id` bigint(20) NOT NULL COMMENT '프로젝트 ID (참조)',
  MODIFY COLUMN `amaranth_approval_id` text DEFAULT NULL COMMENT '아마란스 결재건 ID',
  MODIFY COLUMN `doc_number` text DEFAULT NULL COMMENT '문서 번호',
  MODIFY COLUMN `title` text NOT NULL COMMENT '문서 제목',
  MODIFY COLUMN `category` varchar(6) DEFAULT NULL COMMENT '문서 분류 (품의문, 공문)',
  MODIFY COLUMN `draft_dept` text DEFAULT NULL COMMENT '기안부서',
  MODIFY COLUMN `drafter_uid` char(36) DEFAULT NULL COMMENT '기안자 ID (uuid)',
  MODIFY COLUMN `drafter_name` text DEFAULT NULL COMMENT '기안자 이름 (스냅샷)',
  MODIFY COLUMN `draft_date` date DEFAULT NULL COMMENT '기안일',
  MODIFY COLUMN `approval_line` longtext DEFAULT NULL COMMENT '결재선 (JSON, 아마란스 동기화 캐시)',
  MODIFY COLUMN `current_approver` text DEFAULT NULL COMMENT '현재 결재자';
ALTER TABLE `pms_official_doc`
  MODIFY COLUMN `current_status` varchar(6) DEFAULT NULL COMMENT '현재 결재 상태 (기안, 결재중, 완료, 반려)',
  MODIFY COLUMN `last_synced_at` datetime(6) DEFAULT NULL COMMENT '마지막 동기화 일시',
  MODIFY COLUMN `remarks` text DEFAULT NULL COMMENT '비고',
  MODIFY COLUMN `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '생성 일시',
  MODIFY COLUMN `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '수정 일시';

-- pms_org_dept
ALTER TABLE `pms_org_dept` COMMENT = '아마란스 부서 트리 미러';
ALTER TABLE `pms_org_dept`
  MODIFY COLUMN `dept_code` varchar(20) NOT NULL COMMENT '부서 코드',
  MODIFY COLUMN `upper_dept_code` varchar(20) DEFAULT NULL COMMENT '상위 부서 코드 (루트는 NULL)',
  MODIFY COLUMN `dept_nm` varchar(500) NOT NULL COMMENT '부서명',
  MODIFY COLUMN `synced_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '동기화 일시';

-- pms_org_duty_code
ALTER TABLE `pms_org_duty_code` COMMENT = '아마란스 직책 코드 마스터';
ALTER TABLE `pms_org_duty_code`
  MODIFY COLUMN `duty_code` varchar(50) NOT NULL COMMENT '직책 코드',
  MODIFY COLUMN `duty_nm` varchar(100) NOT NULL COMMENT '직책명';

-- pms_org_member
ALTER TABLE `pms_org_member` COMMENT = '아마란스 회원 미러';
ALTER TABLE `pms_org_member`
  MODIFY COLUMN `mber_id` varchar(20) NOT NULL COMMENT '아마란스 회원 ID',
  MODIFY COLUMN `mber_nm` varchar(50) NOT NULL COMMENT '회원명',
  MODIFY COLUMN `email` varchar(50) DEFAULT NULL COMMENT '이메일',
  MODIFY COLUMN `status` varchar(15) DEFAULT NULL COMMENT '상태 (P=재직, D=퇴직)',
  MODIFY COLUMN `synced_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '동기화 일시';

-- pms_org_member_dept
ALTER TABLE `pms_org_member_dept` COMMENT = '아마란스 회원-부서(겸직) 미러';
ALTER TABLE `pms_org_member_dept`
  MODIFY COLUMN `mber_id` varchar(20) NOT NULL COMMENT '아마란스 회원 ID',
  MODIFY COLUMN `dept_code` varchar(20) NOT NULL COMMENT '부서 코드',
  MODIFY COLUMN `dept_nm` varchar(500) DEFAULT NULL COMMENT '부서명 (스냅샷)',
  MODIFY COLUMN `duty_code` varchar(50) DEFAULT NULL COMMENT '직책 코드',
  MODIFY COLUMN `synced_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '동기화 일시';

-- pms_person
ALTER TABLE `pms_person` COMMENT = '단일 사람 마스터 (내부/외부 인력)';
ALTER TABLE `pms_person`
  MODIFY COLUMN `person_id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '인력 ID',
  MODIFY COLUMN `source` varchar(20) NOT NULL DEFAULT 'EXTERNAL' COMMENT '출처 (INTERNAL: 내부, EXTERNAL: 외부)',
  MODIFY COLUMN `amaranth_emp_no` varchar(50) DEFAULT NULL COMMENT '아마란스 사번 (동기화 키, 외부는 NULL)',
  MODIFY COLUMN `name` varchar(200) NOT NULL COMMENT '이름',
  MODIFY COLUMN `employment_type` varchar(20) NOT NULL DEFAULT 'regular' COMMENT '고용 형태 (regular/insourced/project_contract/turnkey/freelancer)',
  MODIFY COLUMN `company_id` bigint(20) DEFAULT NULL COMMENT '소속 회사 ID (FK)',
  MODIFY COLUMN `department` varchar(200) DEFAULT NULL COMMENT '부서',
  MODIFY COLUMN `position` varchar(200) DEFAULT NULL COMMENT '직책',
  MODIFY COLUMN `phone` varchar(50) DEFAULT NULL COMMENT '연락처',
  MODIFY COLUMN `email` varchar(200) DEFAULT NULL COMMENT '이메일',
  MODIFY COLUMN `status` varchar(20) NOT NULL DEFAULT '재직' COMMENT '상태 (재직, 종료)',
  MODIFY COLUMN `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '생성 일시';
ALTER TABLE `pms_person`
  MODIFY COLUMN `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '수정 일시';

-- pms_project
ALTER TABLE `pms_project` COMMENT = '프로젝트 (입찰~완료)';
ALTER TABLE `pms_project`
  MODIFY COLUMN `project_id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '프로젝트 ID',
  MODIFY COLUMN `project_name` varchar(200) NOT NULL COMMENT '프로젝트명',
  MODIFY COLUMN `project_code` varchar(50) DEFAULT NULL COMMENT '프로젝트 코드 (표시용)',
  MODIFY COLUMN `description` text DEFAULT NULL COMMENT '프로젝트 설명',
  MODIFY COLUMN `pm_id` char(36) DEFAULT NULL COMMENT 'PM 사용자 ID (uuid)',
  MODIFY COLUMN `client_company_id` bigint(20) DEFAULT NULL COMMENT '고객사 ID (FK)',
  MODIFY COLUMN `status` varchar(20) NOT NULL DEFAULT '입찰' COMMENT '진행 상태 (입찰, 진행중, 지연, 보류, 완료)',
  MODIFY COLUMN `project_stage` varchar(20) NOT NULL DEFAULT 'EXECUTION' COMMENT '프로젝트 단계 (BIDDING/EXECUTION/COMPLETED)',
  MODIFY COLUMN `planned_start_date` date DEFAULT NULL COMMENT '계획 시작일',
  MODIFY COLUMN `planned_end_date` date DEFAULT NULL COMMENT '계획 종료일',
  MODIFY COLUMN `actual_start_date` date DEFAULT NULL COMMENT '실제 시작일',
  MODIFY COLUMN `actual_end_date` date DEFAULT NULL COMMENT '실제 종료일';
ALTER TABLE `pms_project`
  MODIFY COLUMN `contract_amount` decimal(15,2) DEFAULT NULL COMMENT '계약 금액',
  MODIFY COLUMN `progress_rate` int(11) DEFAULT 0 COMMENT '진척률 (%)',
  MODIFY COLUMN `risk_level` varchar(10) DEFAULT '보통' COMMENT '위험 수준',
  MODIFY COLUMN `team` varchar(100) DEFAULT NULL COMMENT '담당 팀',
  MODIFY COLUMN `location` varchar(200) DEFAULT NULL COMMENT '수행 장소',
  MODIFY COLUMN `business_type` varchar(100) DEFAULT NULL COMMENT '사업 유형',
  MODIFY COLUMN `bid_status` varchar(20) DEFAULT NULL COMMENT '입찰 상태 (제안준비중, 제안제출, 결과대기, 수주, 실패)',
  MODIFY COLUMN `consortium_role` varchar(100) DEFAULT NULL COMMENT '컨소시엄 역할',
  MODIFY COLUMN `consortium_share` decimal(5,2) DEFAULT NULL COMMENT '컨소시엄 지분율 (%)',
  MODIFY COLUMN `vrb_status` varchar(50) DEFAULT NULL COMMENT 'VRB 상태',
  MODIFY COLUMN `announcement_no` varchar(100) DEFAULT NULL COMMENT '공고 번호',
  MODIFY COLUMN `proposal_deadline` date DEFAULT NULL COMMENT '제안 마감일';
ALTER TABLE `pms_project`
  MODIFY COLUMN `pm_name` varchar(200) DEFAULT NULL COMMENT 'PM 이름 (스냅샷)',
  MODIFY COLUMN `dept` varchar(200) DEFAULT NULL COMMENT '부서',
  MODIFY COLUMN `customer_name` varchar(200) DEFAULT NULL COMMENT '고객사명 (스냅샷)',
  MODIFY COLUMN `budget` decimal(18,2) DEFAULT NULL COMMENT '예산',
  MODIFY COLUMN `milestones` text DEFAULT NULL COMMENT '마일스톤',
  MODIFY COLUMN `inspection_date` date DEFAULT NULL COMMENT '검수일',
  MODIFY COLUMN `remarks` text DEFAULT NULL COMMENT '비고',
  MODIFY COLUMN `resources` decimal(18,2) DEFAULT NULL COMMENT '투입 자원/인력 규모',
  MODIFY COLUMN `bid_number` varchar(100) DEFAULT NULL COMMENT '입찰 번호',
  MODIFY COLUMN `sales_owner` varchar(200) DEFAULT NULL COMMENT '영업 담당',
  MODIFY COLUMN `proposal_owner` varchar(200) DEFAULT NULL COMMENT '제안 담당',
  MODIFY COLUMN `proposal_pm` varchar(200) DEFAULT NULL COMMENT '제안 PM';
ALTER TABLE `pms_project`
  MODIFY COLUMN `business_manager` varchar(200) DEFAULT NULL COMMENT '사업 관리자',
  MODIFY COLUMN `contract_owner` varchar(200) DEFAULT NULL COMMENT '계약 담당',
  MODIFY COLUMN `legal_owner` varchar(200) DEFAULT NULL COMMENT '법무 담당',
  MODIFY COLUMN `source_project_id` bigint(20) DEFAULT NULL COMMENT '출처(원본) 프로젝트 ID (입찰→수행 lineage)',
  MODIFY COLUMN `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '생성 일시',
  MODIFY COLUMN `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '수정 일시',
  MODIFY COLUMN `created_by` char(36) DEFAULT NULL COMMENT '생성자 ID (uuid)',
  MODIFY COLUMN `updated_by` char(36) DEFAULT NULL COMMENT '수정자 ID (uuid)';

-- pms_project_code_counter
ALTER TABLE `pms_project_code_counter` COMMENT = '프로젝트 코드 발번 카운터 (연도별 전역)';
ALTER TABLE `pms_project_code_counter`
  MODIFY COLUMN `year_val` int(11) NOT NULL COMMENT '연도',
  MODIFY COLUMN `last_seq` bigint(20) NOT NULL DEFAULT 0 COMMENT '마지막 발번 순번';

-- pms_project_company
ALTER TABLE `pms_project_company` COMMENT = '프로젝트↔회사 참여 (컨소시엄/고객사)';
ALTER TABLE `pms_project_company`
  MODIFY COLUMN `project_company_id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '프로젝트-회사 ID',
  MODIFY COLUMN `project_id` bigint(20) NOT NULL COMMENT '프로젝트 ID (참조)',
  MODIFY COLUMN `company_id` bigint(20) DEFAULT NULL COMMENT '회사 ID (FK)',
  MODIFY COLUMN `company_name` text DEFAULT NULL COMMENT '회사명 (스냅샷)',
  MODIFY COLUMN `role` varchar(20) DEFAULT NULL COMMENT '역할 (주사업자, 부사업자, 협력사, 고객사, 기타)',
  MODIFY COLUMN `share_rate` decimal(9,2) DEFAULT NULL COMMENT '지분율 (%)',
  MODIFY COLUMN `description` text DEFAULT NULL COMMENT '설명',
  MODIFY COLUMN `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '생성 일시',
  MODIFY COLUMN `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '수정 일시';

-- pms_project_member
ALTER TABLE `pms_project_member` COMMENT = '프로젝트 참여 인력 (내부/외부)';
ALTER TABLE `pms_project_member`
  MODIFY COLUMN `member_id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '멤버 ID',
  MODIFY COLUMN `person_id` bigint(20) DEFAULT NULL COMMENT '사람 마스터 ID (FK pms_person)',
  MODIFY COLUMN `project_id` bigint(20) NOT NULL COMMENT '프로젝트 ID (참조)',
  MODIFY COLUMN `member_type` varchar(20) NOT NULL COMMENT '인력 유형 (INTERNAL: 내부, EXTERNAL: 외부)',
  MODIFY COLUMN `user_uid` char(36) DEFAULT NULL COMMENT '사용자 UUID (INTERNAL일 때 계정 참조)',
  MODIFY COLUMN `name` varchar(200) NOT NULL COMMENT '인력명',
  MODIFY COLUMN `company` varchar(200) DEFAULT NULL COMMENT '소속사명 (문자열 스냅샷)',
  MODIFY COLUMN `company_id` bigint(20) DEFAULT NULL COMMENT '회사 ID (FK pms_company, 외부 인력 소속사)',
  MODIFY COLUMN `role_name` varchar(200) DEFAULT NULL COMMENT '직무명 (예: Front-End 개발)',
  MODIFY COLUMN `position` varchar(200) DEFAULT NULL COMMENT '직책',
  MODIFY COLUMN `department` varchar(200) DEFAULT NULL COMMENT '부서',
  MODIFY COLUMN `participation_role` varchar(10) DEFAULT NULL COMMENT '참여 역할 (PM, PL, PMO, TA, AA, DA, DBA, SE, DEV, QA, CT, ETC)';
ALTER TABLE `pms_project_member`
  MODIFY COLUMN `employment_type` varchar(20) NOT NULL DEFAULT 'regular' COMMENT '고용 형태',
  MODIFY COLUMN `is_project_manager` tinyint(1) DEFAULT 0 COMMENT 'PM 여부',
  MODIFY COLUMN `is_active` tinyint(1) DEFAULT 1 COMMENT '활성 여부',
  MODIFY COLUMN `start_date` date DEFAULT NULL COMMENT '참여 시작일',
  MODIFY COLUMN `end_date` date DEFAULT NULL COMMENT '참여 종료일',
  MODIFY COLUMN `memo` text DEFAULT NULL COMMENT '메모',
  MODIFY COLUMN `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '생성 일시',
  MODIFY COLUMN `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '수정 일시';

-- pms_project_tailoring
ALTER TABLE `pms_project_tailoring` COMMENT = '프로젝트 테일러링 (카탈로그 선택 및 전개)';
ALTER TABLE `pms_project_tailoring`
  MODIFY COLUMN `tailoring_id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '테일러링 ID',
  MODIFY COLUMN `project_id` bigint(20) NOT NULL COMMENT '프로젝트 ID (참조)',
  MODIFY COLUMN `catalog_node_id` bigint(20) DEFAULT NULL COMMENT '카탈로그 노드 ID (참조)',
  MODIFY COLUMN `is_selected` tinyint(1) NOT NULL DEFAULT 1 COMMENT '선택 여부',
  MODIFY COLUMN `exclude_reason` text DEFAULT NULL COMMENT '제외 사유',
  MODIFY COLUMN `generated_task_id` bigint(20) DEFAULT NULL COMMENT '생성된 태스크 ID',
  MODIFY COLUMN `generated_deliverable_id` bigint(20) DEFAULT NULL COMMENT '생성된 산출물 ID',
  MODIFY COLUMN `planned_start_date` date DEFAULT NULL COMMENT '노드별 계획 시작일 (v1: PHASE)',
  MODIFY COLUMN `planned_end_date` date DEFAULT NULL COMMENT '노드별 계획 종료일 (v1: PHASE)',
  MODIFY COLUMN `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '생성 일시',
  MODIFY COLUMN `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '수정 일시';

-- pms_signal_rule
ALTER TABLE `pms_signal_rule` COMMENT = '대시보드 신호 규칙 (사용자 등록형)';
ALTER TABLE `pms_signal_rule`
  MODIFY COLUMN `rule_id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '규칙 ID',
  MODIFY COLUMN `project_id` bigint(20) DEFAULT NULL COMMENT '프로젝트 ID (null=전역 규칙)',
  MODIFY COLUMN `name` varchar(100) NOT NULL COMMENT '규칙명',
  MODIFY COLUMN `metric` varchar(40) NOT NULL COMMENT '신호 지표 (PROGRESS_DELAY_PCT 등)',
  MODIFY COLUMN `operator` varchar(10) NOT NULL DEFAULT 'GT' COMMENT '연산자 (GT, LTE 등)',
  MODIFY COLUMN `threshold` decimal(18,4) DEFAULT NULL COMMENT '임계값',
  MODIFY COLUMN `params` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '추가 파라미터 (JSON)',
  MODIFY COLUMN `action` varchar(20) NOT NULL DEFAULT 'SHOW' COMMENT '액션 (SHOW/CREATE_RISK/ESCALATE_ISSUE)',
  MODIFY COLUMN `enabled` tinyint(1) NOT NULL DEFAULT 1 COMMENT '활성 여부',
  MODIFY COLUMN `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '생성 일시',
  MODIFY COLUMN `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '수정 일시';

-- pms_task
ALTER TABLE `pms_task` COMMENT = '태스크 (카탈로그 전개 또는 커스텀)';
ALTER TABLE `pms_task`
  MODIFY COLUMN `task_id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '태스크 ID',
  MODIFY COLUMN `parent_task_id` bigint(20) DEFAULT NULL COMMENT '부모 태스크 ID',
  MODIFY COLUMN `project_id` bigint(20) NOT NULL COMMENT '프로젝트 ID (참조)',
  MODIFY COLUMN `task_name` varchar(300) NOT NULL COMMENT '태스크명',
  MODIFY COLUMN `status` varchar(20) NOT NULL DEFAULT 'TODO' COMMENT '상태 (workflow 정의에 따름)',
  MODIFY COLUMN `progress_rate` int(11) DEFAULT 0 COMMENT '진척률 (%)',
  MODIFY COLUMN `assignee_id` char(36) DEFAULT NULL COMMENT '담당자 ID (uuid)',
  MODIFY COLUMN `assignee_name` text DEFAULT NULL COMMENT '담당자 이름 (직접 저장, 아마란스 조직도용)',
  MODIFY COLUMN `planned_start_date` date DEFAULT NULL COMMENT '계획 시작일',
  MODIFY COLUMN `actual_start_date` date DEFAULT NULL COMMENT '실제 시작일',
  MODIFY COLUMN `planned_end_date` date DEFAULT NULL COMMENT '계획 종료일',
  MODIFY COLUMN `actual_end_date` date DEFAULT NULL COMMENT '실제 종료일';
ALTER TABLE `pms_task`
  MODIFY COLUMN `planned_effort` decimal(10,2) DEFAULT NULL COMMENT '계획 공수',
  MODIFY COLUMN `actual_effort` decimal(10,2) DEFAULT NULL COMMENT '실제 공수',
  MODIFY COLUMN `depth` int(11) DEFAULT 0 COMMENT '트리 깊이',
  MODIFY COLUMN `sort_order` int(11) DEFAULT 0 COMMENT '정렬 순서',
  MODIFY COLUMN `description` text DEFAULT NULL COMMENT '설명',
  MODIFY COLUMN `catalog_node_id` bigint(20) DEFAULT NULL COMMENT '카탈로그 노드 ID (있으면 테일러링 전개분)',
  MODIFY COLUMN `display_code` varchar(50) DEFAULT NULL COMMENT '표시 코드 (T-{카탈로그코드} 또는 T-{순번})',
  MODIFY COLUMN `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '생성 일시',
  MODIFY COLUMN `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '수정 일시',
  MODIFY COLUMN `created_by` char(36) DEFAULT NULL COMMENT '생성자 ID (uuid)',
  MODIFY COLUMN `updated_by` char(36) DEFAULT NULL COMMENT '수정자 ID (uuid)';

-- pms_task_assignment_history
ALTER TABLE `pms_task_assignment_history` COMMENT = '태스크 담당자 변경 이력';
ALTER TABLE `pms_task_assignment_history`
  MODIFY COLUMN `history_id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '이력 ID',
  MODIFY COLUMN `task_id` bigint(20) NOT NULL COMMENT '태스크 ID (참조)',
  MODIFY COLUMN `from_user_id` char(36) DEFAULT NULL COMMENT '변경 전 담당자 ID (uuid)',
  MODIFY COLUMN `to_user_id` char(36) DEFAULT NULL COMMENT '변경 후 담당자 ID (uuid)',
  MODIFY COLUMN `changed_by` char(36) DEFAULT NULL COMMENT '변경 수행자 ID (uuid)',
  MODIFY COLUMN `change_reason` text DEFAULT NULL COMMENT '변경 사유',
  MODIFY COLUMN `changed_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '변경 일시';

-- pms_user
ALTER TABLE `pms_user` COMMENT = '내부 사용자 (PM, 팀원)';
ALTER TABLE `pms_user`
  MODIFY COLUMN `user_id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '사용자 ID',
  MODIFY COLUMN `username` varchar(50) NOT NULL COMMENT '사용자명 (로그인 ID)',
  MODIFY COLUMN `email` varchar(100) NOT NULL COMMENT '이메일 주소',
  MODIFY COLUMN `password` varchar(255) DEFAULT NULL COMMENT '비밀번호 해시',
  MODIFY COLUMN `full_name` varchar(100) DEFAULT NULL COMMENT '사용자 이름',
  MODIFY COLUMN `role` varchar(20) DEFAULT NULL COMMENT '역할 (ADMIN, PM, MEMBER)',
  MODIFY COLUMN `is_active` tinyint(1) DEFAULT 1 COMMENT '활성 여부',
  MODIFY COLUMN `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '생성 일시',
  MODIFY COLUMN `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '수정 일시';

-- pms_vrb_info
ALTER TABLE `pms_vrb_info` COMMENT = 'VRB 상세 (프로젝트당 0~1건)';
ALTER TABLE `pms_vrb_info`
  MODIFY COLUMN `project_id` bigint(20) NOT NULL COMMENT '프로젝트 ID (PK/참조)',
  MODIFY COLUMN `status` varchar(10) NOT NULL COMMENT '상태 (미상신, 상신예정, 상신완료, 승인, 반려)',
  MODIFY COLUMN `planned_date` date DEFAULT NULL COMMENT '예정일',
  MODIFY COLUMN `submitted_date` date DEFAULT NULL COMMENT '상신일',
  MODIFY COLUMN `approved_date` date DEFAULT NULL COMMENT '승인일',
  MODIFY COLUMN `vrb_number` text DEFAULT NULL COMMENT 'VRB 번호',
  MODIFY COLUMN `memo` text DEFAULT NULL COMMENT '메모',
  MODIFY COLUMN `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '생성 일시',
  MODIFY COLUMN `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '수정 일시';

-- pms_workflow
ALTER TABLE `pms_workflow` COMMENT = '워크플로 정의 (상태, 전이, 조건)';
ALTER TABLE `pms_workflow`
  MODIFY COLUMN `workflow_id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '워크플로 ID',
  MODIFY COLUMN `name` varchar(100) NOT NULL COMMENT '워크플로명',
  MODIFY COLUMN `description` text DEFAULT NULL COMMENT '워크플로 설명',
  MODIFY COLUMN `is_default` tinyint(1) NOT NULL DEFAULT 0 COMMENT '기본 워크플로 여부',
  MODIFY COLUMN `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '생성 일시',
  MODIFY COLUMN `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '수정 일시';

-- pms_workflow_status
ALTER TABLE `pms_workflow_status` COMMENT = '워크플로 상태 (상태 코드, 이름)';
ALTER TABLE `pms_workflow_status`
  MODIFY COLUMN `status_id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '상태 ID',
  MODIFY COLUMN `workflow_id` bigint(20) NOT NULL COMMENT '워크플로 ID (참조)',
  MODIFY COLUMN `code` varchar(40) DEFAULT NULL COMMENT '상태 코드 (영문, 예: TODO, DONE)',
  MODIFY COLUMN `name` varchar(100) NOT NULL COMMENT '상태명 (한글 UI용)',
  MODIFY COLUMN `color` varchar(20) DEFAULT NULL COMMENT '표시 색상',
  MODIFY COLUMN `category` varchar(20) DEFAULT NULL COMMENT '상태 범주 (TODO/IN_PROGRESS/DONE)',
  MODIFY COLUMN `is_initial` tinyint(1) NOT NULL DEFAULT 0 COMMENT '초기 상태 여부',
  MODIFY COLUMN `is_final` tinyint(1) NOT NULL DEFAULT 0 COMMENT '최종 상태 여부',
  MODIFY COLUMN `sort_order` int(11) NOT NULL DEFAULT 0 COMMENT '정렬 순서',
  MODIFY COLUMN `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '생성 일시',
  MODIFY COLUMN `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '수정 일시';

-- pms_workflow_transition
ALTER TABLE `pms_workflow_transition` COMMENT = '워크플로 전이 (상태 이동 규칙)';
ALTER TABLE `pms_workflow_transition`
  MODIFY COLUMN `transition_id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '전이 ID',
  MODIFY COLUMN `workflow_id` bigint(20) NOT NULL COMMENT '워크플로 ID (참조)',
  MODIFY COLUMN `from_status_id` bigint(20) NOT NULL COMMENT '시작 상태 ID',
  MODIFY COLUMN `to_status_id` bigint(20) NOT NULL COMMENT '종료 상태 ID',
  MODIFY COLUMN `name` varchar(100) DEFAULT NULL COMMENT '전이명',
  MODIFY COLUMN `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '생성 일시',
  MODIFY COLUMN `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '수정 일시';

-- pms_workflow_transition_condition
ALTER TABLE `pms_workflow_transition_condition` COMMENT = '전이 조건 (실행 요건)';
ALTER TABLE `pms_workflow_transition_condition`
  MODIFY COLUMN `condition_id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '조건 ID',
  MODIFY COLUMN `transition_id` bigint(20) NOT NULL COMMENT '전이 ID (참조)',
  MODIFY COLUMN `group_id` bigint(20) DEFAULT NULL COMMENT '조건 그룹 ID (향후 AND/OR 트리용, 현재 미사용)',
  MODIFY COLUMN `logic_op` varchar(4) NOT NULL DEFAULT 'AND' COMMENT '논리 연산 (AND/OR)',
  MODIFY COLUMN `subject_scope` varchar(20) NOT NULL DEFAULT 'SELF' COMMENT '대상 범위 (SELF, PROJECT 등)',
  MODIFY COLUMN `left_field` varchar(60) DEFAULT NULL COMMENT '평가 대상 필드 (예: version_count)',
  MODIFY COLUMN `operator` varchar(30) NOT NULL COMMENT '연산자 (GTE, LTE, COMMENT_REQUIRED 등)',
  MODIFY COLUMN `params` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '연산 파라미터 (JSON)',
  MODIFY COLUMN `error_message` varchar(200) DEFAULT NULL COMMENT '미충족 시 오류 메시지',
  MODIFY COLUMN `is_blocking` tinyint(1) NOT NULL DEFAULT 1 COMMENT '차단 여부 (true: 미충족 시 전이 불가)',
  MODIFY COLUMN `sort_order` int(11) NOT NULL DEFAULT 0 COMMENT '정렬 순서',
  MODIFY COLUMN `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) COMMENT '생성 일시';

-- ---------------------------------------------------------------------
-- CHECK 제약 재추가 (MODIFY 로 제거된 제약 복원 — 명명 제약)
-- ---------------------------------------------------------------------
ALTER TABLE `pms_user` DROP CONSTRAINT IF EXISTS `chk_pms_user_role`;
ALTER TABLE `pms_company` DROP CONSTRAINT IF EXISTS `chk_pms_company_type`;
ALTER TABLE `pms_workflow_status` DROP CONSTRAINT IF EXISTS `chk_pms_wf_status_category`;
ALTER TABLE `pms_workflow_transition_condition` DROP CONSTRAINT IF EXISTS `chk_pms_wftc_logic_op`;
ALTER TABLE `pms_project` DROP CONSTRAINT IF EXISTS `chk_pms_project_status`;
ALTER TABLE `pms_project` DROP CONSTRAINT IF EXISTS `chk_pms_project_stage`;
ALTER TABLE `pms_project` DROP CONSTRAINT IF EXISTS `chk_pms_project_bid_status`;
ALTER TABLE `pms_project_company` DROP CONSTRAINT IF EXISTS `chk_pms_proj_co_role`;
ALTER TABLE `pms_catalog_node` DROP CONSTRAINT IF EXISTS `chk_pms_catalog_node_type`;
ALTER TABLE `pms_catalog_node` DROP CONSTRAINT IF EXISTS `chk_pms_catalog_methodology`;
ALTER TABLE `pms_task` DROP CONSTRAINT IF EXISTS `chk_pms_task_status`;
ALTER TABLE `pms_task` DROP CONSTRAINT IF EXISTS `chk_pms_task_progress`;
ALTER TABLE `pms_deliverable` DROP CONSTRAINT IF EXISTS `chk_pms_deliverable_status`;
ALTER TABLE `pms_issue` DROP CONSTRAINT IF EXISTS `chk_pms_issue_priority`;
ALTER TABLE `pms_issue` DROP CONSTRAINT IF EXISTS `chk_pms_issue_status`;
ALTER TABLE `pms_comment` DROP CONSTRAINT IF EXISTS `chk_pms_comment_entity`;
ALTER TABLE `pms_comment` DROP CONSTRAINT IF EXISTS `chk_pms_comment_type`;
ALTER TABLE `pms_code_counter` DROP CONSTRAINT IF EXISTS `chk_pms_code_counter_entity`;
ALTER TABLE `pms_contact_point` DROP CONSTRAINT IF EXISTS `chk_pms_contact_type`;
ALTER TABLE `pms_project_member` DROP CONSTRAINT IF EXISTS `chk_pms_member_type`;
ALTER TABLE `pms_project_member` DROP CONSTRAINT IF EXISTS `chk_pms_member_participation`;
ALTER TABLE `pms_project_member` DROP CONSTRAINT IF EXISTS `chk_pms_member_employment`;
ALTER TABLE `pms_member_availability` DROP CONSTRAINT IF EXISTS `chk_pms_avail`;
ALTER TABLE `pms_action_item` DROP CONSTRAINT IF EXISTS `chk_pms_action_status`;
ALTER TABLE `pms_official_doc` DROP CONSTRAINT IF EXISTS `chk_pms_odoc_category`;
ALTER TABLE `pms_official_doc` DROP CONSTRAINT IF EXISTS `chk_pms_odoc_status`;
ALTER TABLE `pms_vrb_info` DROP CONSTRAINT IF EXISTS `chk_pms_vrb_status`;
ALTER TABLE `pms_audit_log` DROP CONSTRAINT IF EXISTS `chk_pms_audit_action`;
ALTER TABLE `pms_signal_rule` DROP CONSTRAINT IF EXISTS `chk_pms_signal_action`;
ALTER TABLE `pms_notification` DROP CONSTRAINT IF EXISTS `chk_pms_notif_type`;
ALTER TABLE `pms_person` DROP CONSTRAINT IF EXISTS `chk_pms_person_source`;
ALTER TABLE `pms_person` DROP CONSTRAINT IF EXISTS `chk_pms_person_employment`;
ALTER TABLE `pms_person` DROP CONSTRAINT IF EXISTS `chk_pms_person_status`;
ALTER TABLE `pms_insourcing_transition` DROP CONSTRAINT IF EXISTS `chk_pms_insource_status`;
ALTER TABLE `pms_user` ADD CONSTRAINT `chk_pms_user_role` CHECK (role IN ('ADMIN','PM','MEMBER'));
ALTER TABLE `pms_company` ADD CONSTRAINT `chk_pms_company_type` CHECK (company_type IN ('OWN','PARTNER','CLIENT'));
ALTER TABLE `pms_workflow_status` ADD CONSTRAINT `chk_pms_wf_status_category` CHECK (category IN ('TODO','IN_PROGRESS','DONE'));
ALTER TABLE `pms_workflow_transition_condition` ADD CONSTRAINT `chk_pms_wftc_logic_op` CHECK (logic_op IN ('AND','OR'));
ALTER TABLE `pms_project` ADD CONSTRAINT `chk_pms_project_status` CHECK (status IN ('입찰','진행중','지연','보류','완료'));
ALTER TABLE `pms_project` ADD CONSTRAINT `chk_pms_project_stage` CHECK (project_stage IN ('BIDDING','EXECUTION','COMPLETED'));
ALTER TABLE `pms_project` ADD CONSTRAINT `chk_pms_project_bid_status` CHECK (bid_status IS NULL OR bid_status IN ('제안준비중','제안제출','결과대기','수주','실패'));
ALTER TABLE `pms_project_company` ADD CONSTRAINT `chk_pms_proj_co_role` CHECK (role IN ('주사업자','부사업자','협력사','고객사','기타'));
ALTER TABLE `pms_catalog_node` ADD CONSTRAINT `chk_pms_catalog_node_type` CHECK (node_type IN ('PHASE','ACTIVITY','TASK','DELIVERABLE'));
ALTER TABLE `pms_catalog_node` ADD CONSTRAINT `chk_pms_catalog_methodology` CHECK (methodology IS NULL OR methodology IN ('OPMS','ODS','OMS','BIS'));
ALTER TABLE `pms_task` ADD CONSTRAINT `chk_pms_task_status` CHECK (status IN ('TODO','IN_PROGRESS','REVIEW','REJECTED','DONE'));
ALTER TABLE `pms_task` ADD CONSTRAINT `chk_pms_task_progress` CHECK (progress_rate IS NULL OR (progress_rate BETWEEN 0 AND 100));
ALTER TABLE `pms_deliverable` ADD CONSTRAINT `chk_pms_deliverable_status` CHECK (status IN ('DRAFT','SUBMITTED','UNDER_REVIEW','APPROVED','REJECTED'));
ALTER TABLE `pms_issue` ADD CONSTRAINT `chk_pms_issue_priority` CHECK (priority IS NULL OR priority IN ('상','중','하'));
ALTER TABLE `pms_issue` ADD CONSTRAINT `chk_pms_issue_status` CHECK (status IS NULL OR status IN ('발생','조치중','완료'));
ALTER TABLE `pms_comment` ADD CONSTRAINT `chk_pms_comment_entity` CHECK (entity_type IN ('TASK','DELIVERABLE','ISSUE','ACTION_ITEM','PROJECT'));
ALTER TABLE `pms_comment` ADD CONSTRAINT `chk_pms_comment_type` CHECK (comment_type IN ('COMMENT','STATUS_CHANGE'));
ALTER TABLE `pms_code_counter` ADD CONSTRAINT `chk_pms_code_counter_entity` CHECK (entity_type IN ('TASK','DELIVERABLE','ISSUE','ACTION_ITEM'));
ALTER TABLE `pms_contact_point` ADD CONSTRAINT `chk_pms_contact_type` CHECK (contact_type IN ('INTERNAL','EXTERNAL'));
ALTER TABLE `pms_project_member` ADD CONSTRAINT `chk_pms_member_type` CHECK (member_type IN ('INTERNAL','EXTERNAL'));
ALTER TABLE `pms_project_member` ADD CONSTRAINT `chk_pms_member_participation` CHECK (participation_role IS NULL OR participation_role IN ('PM','PL','PMO','TA','AA','DA','DBA','SE','DEV','QA','CT','ETC'));
ALTER TABLE `pms_project_member` ADD CONSTRAINT `chk_pms_member_employment` CHECK (employment_type IN ('regular','insourced','project_contract','turnkey','freelancer'));
ALTER TABLE `pms_member_availability` ADD CONSTRAINT `chk_pms_avail` CHECK (availability IS NULL OR availability IN ('가능','연차','반차','불가'));
ALTER TABLE `pms_action_item` ADD CONSTRAINT `chk_pms_action_status` CHECK (status IS NULL OR status IN ('대기','진행','완료'));
ALTER TABLE `pms_official_doc` ADD CONSTRAINT `chk_pms_odoc_category` CHECK (category IS NULL OR category IN ('품의문','공문'));
ALTER TABLE `pms_official_doc` ADD CONSTRAINT `chk_pms_odoc_status` CHECK (current_status IS NULL OR current_status IN ('기안','결재중','완료','반려'));
ALTER TABLE `pms_vrb_info` ADD CONSTRAINT `chk_pms_vrb_status` CHECK (status IN ('미상신','상신예정','상신완료','승인','반려'));
ALTER TABLE `pms_audit_log` ADD CONSTRAINT `chk_pms_audit_action` CHECK (action IN ('INSERT','UPDATE','DELETE'));
ALTER TABLE `pms_signal_rule` ADD CONSTRAINT `chk_pms_signal_action` CHECK (action IN ('SHOW','CREATE_RISK','ESCALATE_ISSUE'));
ALTER TABLE `pms_notification` ADD CONSTRAINT `chk_pms_notif_type` CHECK (type IN ('MENTION','REPLY','SIGNAL','WORKFLOW','DEADLINE','SYSTEM'));
ALTER TABLE `pms_person` ADD CONSTRAINT `chk_pms_person_source` CHECK (source IN ('INTERNAL','EXTERNAL'));
ALTER TABLE `pms_person` ADD CONSTRAINT `chk_pms_person_employment` CHECK (employment_type IN ('regular','insourced','project_contract','turnkey','freelancer'));
ALTER TABLE `pms_person` ADD CONSTRAINT `chk_pms_person_status` CHECK (status IN ('재직','종료'));
ALTER TABLE `pms_insourcing_transition` ADD CONSTRAINT `chk_pms_insource_status` CHECK (status IN ('REQUESTED','DOC_SENT','APPROVED','REJECTED','CANCELED'));

