package com.aetherpms.engine;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
/** pms_workflow_transition 읽기. */
public interface WorkflowTransitionReadRepository extends JpaRepository<WorkflowTransitionEntity, Long> {
    List<WorkflowTransitionEntity> findAllByOrderByWorkflowIdAscTransitionIdAsc();
}
