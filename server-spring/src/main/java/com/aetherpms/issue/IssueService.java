package com.aetherpms.issue;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.aetherpms.common.ApiException;

/**
 * POST /api/issues — 트랜잭션 쓰기 + display_code 발번.
 * Node routes/work-surface.ts validateIssuePayload + A-3 POST 코어 이식.
 *
 * 슬라이스 범위 축소: Node는 pms_audit_log INSERT도 하지만, audit 테이블은 이 마일스톤
 * 스키마에 없어 생략한다(발번·트랜잭션·계약 검증이 목적). 후속 포팅 시 audit 추가.
 */
@Service
public class IssueService {

    private static final Set<String> ALLOWED = Set.of(
            "project_id", "title", "type", "priority",
            "owner_uid", "owner_name", "due_date", "reported_date");
    private static final Set<String> PRIORITIES = Set.of("상", "중", "하");
    private static final Set<String> TYPES = Set.of("리스크", "이슈");

    private final IssueRepository issueRepository;
    private final DisplayCodeService displayCodeService;
    private final JdbcTemplate jdbc;

    public IssueService(IssueRepository issueRepository,
                        DisplayCodeService displayCodeService,
                        JdbcTemplate jdbc) {
        this.issueRepository = issueRepository;
        this.displayCodeService = displayCodeService;
        this.jdbc = jdbc;
    }

    @Transactional
    public Map<String, Object> createIssue(Map<String, Object> body) {
        IssueEntity issue = validate(body);
        long projectId = issue.getProjectId();

        Integer exists = jdbc.queryForObject(
                "SELECT COUNT(*) FROM pms_project WHERE project_id = ?", Integer.class, projectId);
        if (exists == null || exists == 0) {
            throw ApiException.notFound("프로젝트를 찾을 수 없습니다.");
        }

        String displayCode = displayCodeService.nextIssueDisplayCode(projectId);
        issue.setSourceRuleId(null); // 수동 등록 마커
        issue.setDisplayCode(displayCode);
        // status 미지정 생성이 NULL로 저장되면 대시보드 신호·오픈 집계(status <> '완료')에서
        // 통째로 누락된다(2026-07-27 시드 중 발견) — 초기 상태 '발생' 기본값.
        if (issue.getStatus() == null) issue.setStatus("발생");

        IssueEntity saved = issueRepository.saveAndFlush(issue);
        return IssueMapper.mapIssue(saved);
    }

    /** validateIssuePayload 이식 — 화이트리스트·필수·enum 검증. */
    IssueEntity validate(Map<String, Object> body) {
        List<String> unknown = body.keySet().stream()
                .filter(k -> !ALLOWED.contains(k))
                .toList();
        if (!unknown.isEmpty()) {
            throw ApiException.badRequest(
                    "허용되지 않는 필드: " + String.join(", ", unknown)
                    + " (허용: " + String.join(", ", ALLOWED) + ")");
        }

        Object pidRaw = body.get("project_id");
        long projectId = asPositiveLong(pidRaw);
        if (projectId <= 0) {
            throw ApiException.badRequest("project_id는 필수이며 양의 정수여야 합니다.");
        }

        String title = body.get("title") == null ? "" : body.get("title").toString().trim();
        if (title.isEmpty()) {
            throw ApiException.badRequest("title은 필수입니다.");
        }

        String type = String.valueOf(body.get("type"));
        if (!TYPES.contains(type)) {
            throw ApiException.badRequest("유효하지 않은 type 값: " + body.get("type")
                    + " (허용: " + String.join(", ", TYPES) + ")");
        }

        IssueEntity issue = new IssueEntity();
        issue.setProjectId(projectId);
        issue.setTitle(title);
        issue.setType(type);

        if (body.get("priority") != null) {
            String priority = String.valueOf(body.get("priority"));
            if (!PRIORITIES.contains(priority)) {
                throw ApiException.badRequest("유효하지 않은 priority 값: " + priority
                        + " (허용: " + String.join(", ", PRIORITIES) + ")");
            }
            issue.setPriority(priority);
        }
        if (body.get("owner_uid") != null) issue.setOwnerUid(String.valueOf(body.get("owner_uid")));
        if (body.get("owner_name") != null) issue.setOwnerName(String.valueOf(body.get("owner_name")));
        if (body.get("due_date") != null) issue.setDueDate(LocalDate.parse(String.valueOf(body.get("due_date"))));

        // reported_date NOT NULL — 미지정 시 오늘(서버 date).
        Object reported = body.get("reported_date");
        issue.setReportedDate(reported != null
                ? LocalDate.parse(String.valueOf(reported))
                : LocalDate.now());
        return issue;
    }

    private static long asPositiveLong(Object v) {
        if (v == null) return 0;
        try {
            if (v instanceof Number n) return n.longValue();
            return Long.parseLong(v.toString());
        } catch (NumberFormatException e) {
            return 0;
        }
    }
}
