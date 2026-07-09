package com.aetherpms.project;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ProjectCompanyRepository extends JpaRepository<ProjectCompanyEntity, Long> {
    // Node reads.ts: order by project_company_id
    List<ProjectCompanyEntity> findAllByOrderByProjectCompanyIdAsc();
}
