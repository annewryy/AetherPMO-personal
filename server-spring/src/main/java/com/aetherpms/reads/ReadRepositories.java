package com.aetherpms.reads;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 읽기 서브리소스 리포지토리 묶음. order by는 Node reads.ts와 동일.
 * (파일당 인터페이스 1개 관례를 벗어나지만, 단순 파생 리포지토리를 한 곳에 모아
 *  reads 패키지 탐색성을 높인다 — 각 인터페이스는 최상위 public.)
 */
final class ReadRepositories {
    private ReadRepositories() {}
}

/** pms_deliverable — order by deliverable_id. */
interface DeliverableReadRepository extends JpaRepository<DeliverableEntity, Long> {
    List<DeliverableEntity> findByProjectIdOrderByDeliverableIdAsc(Long projectId);
}

/** pms_action_item — order by action_id. */
interface ActionItemReadRepository extends JpaRepository<ActionItemEntity, Long> {
    List<ActionItemEntity> findByProjectIdOrderByActionIdAsc(Long projectId);
}

/** pms_meeting_minutes — order by meeting_id. */
interface MeetingReadRepository extends JpaRepository<MeetingEntity, Long> {
    List<MeetingEntity> findByProjectIdOrderByMeetingIdAsc(Long projectId);
}

/** pms_official_doc — order by doc_id. */
interface OfficialDocReadRepository extends JpaRepository<OfficialDocEntity, Long> {
    List<OfficialDocEntity> findByProjectIdOrderByDocIdAsc(Long projectId);
}

/** pms_audit_log — order by audit_id. */
interface ActivityReadRepository extends JpaRepository<ActivityEntity, Long> {
    List<ActivityEntity> findByProjectIdOrderByAuditIdAsc(Long projectId);
}

/** pms_task — order by sort_order, task_id. */
interface TaskReadRepository extends JpaRepository<TaskEntity, Long> {
    List<TaskEntity> findByProjectIdOrderBySortOrderAscTaskIdAsc(Long projectId);
}

/** pms_vrb_info — project_id PK. */
interface VrbInfoReadRepository extends JpaRepository<VrbInfoEntity, Long> {
}

/** pms_catalog_node — order by sort_order, node_id. */
interface CatalogNodeReadRepository extends JpaRepository<CatalogNodeEntity, Long> {
    List<CatalogNodeEntity> findAllByOrderBySortOrderAscNodeIdAsc();
}

/** pms_workflow — order by workflow_id. */
interface WorkflowReadRepository extends JpaRepository<WorkflowEntity, Long> {
    List<WorkflowEntity> findAllByOrderByWorkflowIdAsc();
}

/** pms_workflow_status — order by workflow_id, sort_order, status_id. */
interface WorkflowStatusReadRepository extends JpaRepository<WorkflowStatusEntity, Long> {
    List<WorkflowStatusEntity> findAllByOrderByWorkflowIdAscSortOrderAscStatusIdAsc();
}

/** pms_workflow_transition — order by workflow_id, transition_id. */
interface WorkflowTransitionReadRepository extends JpaRepository<WorkflowTransitionEntity, Long> {
    List<WorkflowTransitionEntity> findAllByOrderByWorkflowIdAscTransitionIdAsc();
}

/** pms_workflow_transition_condition — order by transition_id, sort_order, condition_id. */
interface TransitionConditionReadRepository extends JpaRepository<TransitionConditionEntity, Long> {
    List<TransitionConditionEntity> findAllByOrderByTransitionIdAscSortOrderAscConditionIdAsc();
}

/** pms_company — order by company_id. */
interface CompanyReadRepository extends JpaRepository<CompanyEntity, Long> {
    List<CompanyEntity> findAllByOrderByCompanyIdAsc();
}

/** pms_project_member — 활성만, is_project_manager desc, member_id. */
interface ProjectMemberReadRepository extends JpaRepository<ProjectMemberEntity, Long> {
    List<ProjectMemberEntity>
        findByProjectIdAndIsActiveTrueOrderByIsProjectManagerDescMemberIdAsc(Long projectId);
}
