package com.aetherpms.engine;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
/** pms_workflow 읽기 — order by workflow_id. */
public interface WorkflowReadRepository extends JpaRepository<WorkflowEntity, Long> {
    List<WorkflowEntity> findAllByOrderByWorkflowIdAsc();
}
