package com.aetherpms.project;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProjectRepository extends JpaRepository<ProjectEntity, Long> {
    // Node reads.ts: order by project_id
    List<ProjectEntity> findAllByOrderByProjectIdAsc();

    /**
     * 0015 §B 서버측 목록 필터. 선택적 파라미터(null이면 해당 조건 무시)이므로 하위호환.
     *   - locationLike: 서울/대전/대구/광주 → LIKE '%값%' (location은 자유텍스트)
     *   - locationEtc:  '기타' → 4종 어느 것에도 매칭되지 않는(또는 값이 없는) 행
     *   - status:       DB 저장값(한글, 예 '진행중') 정확일치
     * location은 정규 5종 중 하나만 지정되므로 locationLike / locationEtc 는 상호배타적.
     */
    @Query("""
            SELECT p FROM ProjectEntity p
            WHERE (:status IS NULL OR p.status = :status)
              AND (:locationLike IS NULL OR (p.location IS NOT NULL AND p.location LIKE %:locationLike%))
              AND (:locationEtc = FALSE OR (
                    p.location IS NULL OR (
                        p.location NOT LIKE '%서울%'
                    AND p.location NOT LIKE '%대전%'
                    AND p.location NOT LIKE '%대구%'
                    AND p.location NOT LIKE '%광주%')))
            ORDER BY p.projectId ASC
            """)
    List<ProjectEntity> findFiltered(@Param("locationLike") String locationLike,
                                     @Param("locationEtc") boolean locationEtc,
                                     @Param("status") String status);
}
