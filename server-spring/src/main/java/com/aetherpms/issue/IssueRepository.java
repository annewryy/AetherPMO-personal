package com.aetherpms.issue;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface IssueRepository extends JpaRepository<IssueEntity, Long> {
    // Node reads.ts: GET /api/projects/:id/issues — order by issue_id.
    List<IssueEntity> findByProjectIdOrderByIssueIdAsc(Long projectId);
}
