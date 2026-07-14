package com.aetherpms.actionitem;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
/** pms_action_item 읽기 — order by action_id. */
public interface ActionItemReadRepository extends JpaRepository<ActionItemEntity, Long> {
    List<ActionItemEntity> findByProjectIdOrderByActionIdAsc(Long projectId);
    List<ActionItemEntity> findAllByOrderByActionIdDesc();
}
