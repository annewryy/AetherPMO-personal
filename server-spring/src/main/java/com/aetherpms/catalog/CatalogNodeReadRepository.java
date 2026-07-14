package com.aetherpms.catalog;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
/** pms_catalog_node 읽기 — order by sort_order, node_id. */
public interface CatalogNodeReadRepository extends JpaRepository<CatalogNodeEntity, Long> {
    List<CatalogNodeEntity> findAllByOrderBySortOrderAscNodeIdAsc();
}
