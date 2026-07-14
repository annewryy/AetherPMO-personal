package com.aetherpms.person;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
/** pms_project_member 읽기 — 활성만, is_project_manager desc, member_id. */
public interface ProjectMemberReadRepository extends JpaRepository<ProjectMemberEntity, Long> {
    List<ProjectMemberEntity>
        findByProjectIdAndIsActiveTrueOrderByIsProjectManagerDescMemberIdAsc(Long projectId);
}
