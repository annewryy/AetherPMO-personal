package com.aetherpms.officialdoc;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
/** pms_official_doc 읽기 — order by doc_id. */
public interface OfficialDocReadRepository extends JpaRepository<OfficialDocEntity, Long> {
    List<OfficialDocEntity> findByProjectIdOrderByDocIdAsc(Long projectId);
    List<OfficialDocEntity> findAllByOrderByDocIdDesc();
}
