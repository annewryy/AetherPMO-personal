package com.aetherpms.engine;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
/** pms_workflow_status 읽기. */
public interface WorkflowStatusReadRepository extends JpaRepository<WorkflowStatusEntity, Long> {
    List<WorkflowStatusEntity> findAllByOrderByWorkflowIdAscSortOrderAscStatusIdAsc();
}
