package com.aetherpms.meeting;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
/** pms_meeting_minutes 읽기 — order by meeting_id. */
public interface MeetingReadRepository extends JpaRepository<MeetingEntity, Long> {
    List<MeetingEntity> findByProjectIdOrderByMeetingIdAsc(Long projectId);
    List<MeetingEntity> findAllByOrderByMeetingIdDesc();
}
