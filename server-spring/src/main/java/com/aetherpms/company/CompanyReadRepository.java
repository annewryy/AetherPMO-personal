package com.aetherpms.company;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
/** pms_company 읽기 — order by company_id. */
public interface CompanyReadRepository extends JpaRepository<CompanyEntity, Long> {
    List<CompanyEntity> findAllByOrderByCompanyIdAsc();
}
