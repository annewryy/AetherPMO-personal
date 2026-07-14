package com.aetherpms.project;
import org.springframework.data.jpa.repository.JpaRepository;
/** pms_vrb_info 읽기 — project_id PK. */
public interface VrbInfoReadRepository extends JpaRepository<VrbInfoEntity, Long> {
}
