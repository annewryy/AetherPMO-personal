package com.aetherpms.task;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
/** pms_task 읽기 — order by sort_order, task_id. */
public interface TaskReadRepository extends JpaRepository<TaskEntity, Long> {
    List<TaskEntity> findByProjectIdOrderBySortOrderAscTaskIdAsc(Long projectId);
}
