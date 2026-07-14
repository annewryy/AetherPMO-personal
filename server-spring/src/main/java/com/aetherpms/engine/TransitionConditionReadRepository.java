package com.aetherpms.engine;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
/** pms_workflow_transition_condition 읽기. */
public interface TransitionConditionReadRepository extends JpaRepository<TransitionConditionEntity, Long> {
    List<TransitionConditionEntity> findAllByOrderByTransitionIdAscSortOrderAscConditionIdAsc();
}
