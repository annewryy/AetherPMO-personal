package com.aetherpms.deliverable;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
/** pms_deliverable 읽기 — order by deliverable_id. */
public interface DeliverableReadRepository extends JpaRepository<DeliverableEntity, Long> {
    List<DeliverableEntity> findByProjectIdOrderByDeliverableIdAsc(Long projectId);
    List<DeliverableEntity> findAllByOrderByDeliverableIdDesc();
}
