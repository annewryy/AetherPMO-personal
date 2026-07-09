package com.aetherpms.reads;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** pms_meeting_minutes — GET /api/projects/:id/meeting-minutes (mapMeeting). */
@Entity
@Table(name = "pms_meeting_minutes")
public class MeetingEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "meeting_id")
    private Long meetingId;

    @Column(name = "project_id")
    private Long projectId;

    @Column(name = "title")
    private String title;

    @Column(name = "meet_date")
    private LocalDateTime meetDate;

    // attendees JSON — MariaDB JSON은 longtext 별칭이라 validate 정합 위해 String으로 읽고
    // 매퍼에서 Jackson으로 배열/객체 원형 복원(프론트 무매핑 사용).
    @Column(name = "attendees", columnDefinition = "json")
    private String attendees;

    @Column(name = "content")
    private String content;

    @Column(name = "remarks")
    private String remarks;

    @Column(name = "author_uid", columnDefinition = "char(36)")
    private String authorUid;

    public Long getMeetingId() { return meetingId; }
    public Long getProjectId() { return projectId; }
    public String getTitle() { return title; }
    public LocalDateTime getMeetDate() { return meetDate; }
    public String getAttendees() { return attendees; }
    public String getContent() { return content; }
    public String getRemarks() { return remarks; }
    public String getAuthorUid() { return authorUid; }
}
