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

    private com.aetherpms.notification.NotificationService notify;

    private static final Set<String> ALLOWED = Set.of(
            "project_id", "title", "type", "priority",
            "owner_uid", "owner_name", "due_date", "reported_date", "task_ids");
    private static final Set<String> PRIORITIES = Set.of("상", "중", "하");
    private static final Set<String> TYPES = Set.of("리스크", "이슈");

    private final IssueRepository issueRepository;
    private final DisplayCodeService displayCodeService;
    private final JdbcTemplate jdbc;

    public IssueService(IssueRepository issueRepository,
                        DisplayCodeService displayCodeService,
                        JdbcTemplate jdbc, com.aetherpms.notification.NotificationService notify) {
        this.issueRepository = issueRepository;
        this.displayCodeService = displayCodeService;
        this.jdbc = jdbc;
        this.notify = notify;
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

        List<Long> taskIds = validateTaskIds(body.get("task_ids"), projectId);

        String displayCode = displayCodeService.nextIssueDisplayCode(projectId);
        issue.setSourceRuleId(null); // 수동 등록 마커
        issue.setDisplayCode(displayCode);
        // status 미지정 생성이 NULL로 저장되면 대시보드 신호·오픈 집계(status <> '완료')에서
        // 통째로 누락된다(2026-07-27 시드 중 발견) — 초기 상태 '발생' 기본값.
        if (issue.getStatus() == null) issue.setStatus("발생");

        IssueEntity saved = issueRepository.saveAndFlush(issue);
        syncTaskLinks(saved.getIssueId(), taskIds);
        if (saved.getOwnerName() != null) {
            notify.notifyByName(projectId, saved.getOwnerName(), "ASSIGNED", "ISSUE",
                    saved.getIssueId(), "담당자로 지정되었습니다: " + saved.getTitle());  // 0033 ①
        }
        Map<String, Object> out = IssueMapper.mapIssue(saved);
        out.put("taskIds", taskIds);
        return out;
    }

    /** 이슈에 현재 매핑된 태스크 id 목록(태스크 매핑을 건드리지 않은 PATCH 응답에 그대로 반영하기 위함). */
    public List<Long> currentTaskIds(long issueId) {
        return jdbc.query("SELECT task_id FROM pms_issue_task_link WHERE issue_id = ? ORDER BY task_id",
                (rs, i) -> rs.getLong(1), issueId);
    }

    /** task_ids 페이로드 검증 — 같은 프로젝트의 태스크만 허용. null이면 빈 목록(변경 없음 아님, 전체 해제). */
    public List<Long> validateTaskIds(Object raw, long projectId) {
        if (raw == null) return List.of();
        if (!(raw instanceof List<?> list)) throw ApiException.badRequest("task_ids는 정수 배열이어야 합니다.");
        List<Long> ids = new java.util.ArrayList<>();
        for (Object o : list) {
            long tid = asPositiveLong(o);
            if (tid <= 0) throw ApiException.badRequest("task_ids에 유효하지 않은 값이 있습니다: " + o);
            ids.add(tid);
        }
        if (ids.isEmpty()) return List.of();
        String placeholders = String.join(",", java.util.Collections.nCopies(ids.size(), "?"));
        Object[] args = new Object[ids.size() + 1];
        args[0] = projectId;
        for (int i = 0; i < ids.size(); i++) args[i + 1] = ids.get(i);
        Integer matched = jdbc.queryForObject(
                "SELECT COUNT(*) FROM pms_task WHERE project_id = ? AND task_id IN (" + placeholders + ")",
                Integer.class, args);
        if (matched == null || matched != ids.size()) {
            throw ApiException.badRequest("task_ids에 이 프로젝트의 태스크가 아닌 값이 있습니다.");
        }
        return ids;
    }

    public void syncTaskLinks(long issueId, List<Long> taskIds) {
        jdbc.update("DELETE FROM pms_issue_task_link WHERE issue_id = ?", issueId);
        for (Long tid : taskIds) {
            jdbc.update("INSERT INTO pms_issue_task_link (issue_id, task_id) VALUES (?, ?)", issueId, tid);
        }
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
