package com.aetherpms.activity;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
/** pms_audit_log 읽기(활동로그) — order by audit_id. */
public interface ActivityReadRepository extends JpaRepository<ActivityEntity, Long> {
    List<ActivityEntity> findByProjectIdOrderByAuditIdAsc(Long projectId);
}
