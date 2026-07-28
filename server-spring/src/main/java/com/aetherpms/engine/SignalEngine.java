package com.aetherpms.engine;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.aetherpms.common.Actor;
import com.aetherpms.common.Json;
import com.aetherpms.progress.ProgressService;

/**
 * 신호 엔진 — Node engine/signals.ts 이식 (0007 대시보드 신호 · 0008 자동 등록/전환).
 *  - GET  /api/dashboard/signals : 지연 신호 + Today 목록(읽기, 쓰기 0)
 *  - POST /api/signals/evaluate  : 규칙 평가 + 자동 리스크 등록/해소 + 리스크→이슈 전환(멱등)
 * 응답 형태는 web/src/types.ts DashboardSignals·ProjectDelaySignal·TodaySignalItem과 일치.
 */
@Service
public class SignalEngine {

    private com.aetherpms.notification.NotificationService notify;

    private final JdbcTemplate jdbc;
    private final ProgressService progressService;

    public SignalEngine(JdbcTemplate jdbc, ProgressService progressService, com.aetherpms.notification.NotificationService notify) {
        this.jdbc = jdbc;
        this.progressService = progressService;
        this.notify = notify;
    }

    // ---- 공용 SQL (Node 상수 이식, PG→MariaDB) ----------------------------
    private static final String ACTIVE_PROJECTS_SQL =
            "SELECT * FROM pms_project WHERE status <> '완료' ORDER BY project_id";

    // 0039 — PHASE 계획일정은 대부분 pms_project_tailoring에 직접 입력되지 않고
    //   (WBS/일정 탭처럼) 하위 TASK 계획일정의 min/max로만 파생된다. 예전 SQL은 tailoring의
    //   원본 컬럼만 읽어 거의 항상 NULL → phases 비어 fallbackUsed=true(프로젝트 전체 기간 선형
    //   기대치)로 새 버려, WBS 표의 단계별 목표%와 동떨어진 값이 나왔다. WbsService와 동일하게
    //   TASK min(start)/max(end) 파생을 여기서도 적용.
    private static final String PHASE_PLAN_SQL = """
        WITH RECURSIVE deliv AS (
          SELECT t.catalog_node_id AS node_id FROM pms_project_tailoring t
            JOIN pms_deliverable d ON d.deliverable_id = t.generated_deliverable_id
           WHERE t.project_id = ? AND t.is_selected = 1
        ),
        rollup AS (
          SELECT node_id FROM deliv
          UNION ALL
          SELECT c.parent_node_id AS node_id FROM rollup r
            JOIN pms_catalog_node c ON c.node_id = r.node_id
           WHERE c.parent_node_id IS NOT NULL
        ),
        agg AS (SELECT node_id, CAST(COUNT(*) AS SIGNED) AS total FROM rollup GROUP BY node_id),
        task_plan AS (
          SELECT act.parent_node_id AS phase_node_id,
                 MIN(tk.planned_start_date) AS min_start,
                 MAX(tk.planned_end_date) AS max_end
            FROM pms_project_tailoring tt
            JOIN pms_catalog_node tn ON tn.node_id = tt.catalog_node_id AND tn.node_type = 'TASK'
            JOIN pms_catalog_node act ON act.node_id = tn.parent_node_id
            JOIN pms_task tk ON tk.task_id = tt.generated_task_id
           WHERE tt.project_id = ? AND tt.is_selected = 1
           GROUP BY act.parent_node_id
        )
        SELECT COALESCE(t.planned_start_date, tp.min_start) AS planned_start_date,
               COALESCE(t.planned_end_date, tp.max_end) AS planned_end_date,
               COALESCE(a.total, 0) AS weight
          FROM pms_project_tailoring t
          JOIN pms_catalog_node n ON n.node_id = t.catalog_node_id AND n.node_type = 'PHASE'
          LEFT JOIN agg a ON a.node_id = n.node_id
          LEFT JOIN task_plan tp ON tp.phase_node_id = n.node_id
         WHERE t.project_id = ? AND t.is_selected = 1
        """;

    private static final String STALLED_DELIVERABLES_SQL = """
        SELECT d.deliverable_id, d.project_id, d.deliverable_name, d.status,
               COALESCE((SELECT MAX(l.changed_at) FROM pms_audit_log l
                          WHERE l.entity_type = 'DELIVERABLE' AND l.entity_id = d.deliverable_id
                            AND JSON_UNQUOTE(JSON_EXTRACT(l.`after`, '$.status')) = d.status),
                        d.updated_at, d.created_at) AS entered_at
          FROM pms_deliverable d JOIN pms_project p ON p.project_id = d.project_id
         WHERE d.status <> 'APPROVED' AND p.status <> '완료'
        """;

    private static final String DUE_ITEMS_SQL = """
        SELECT 'ACTION_ITEM' AS entity_type, a.action_id AS entity_id, a.project_id, a.title,
               a.due_date, p.project_name
          FROM pms_action_item a JOIN pms_project p ON p.project_id = a.project_id
         WHERE a.status <> '완료' AND a.due_date IS NOT NULL AND p.status <> '완료'
        UNION ALL
        SELECT 'DELIVERABLE', d.deliverable_id, d.project_id, d.deliverable_name, d.due_date, p.project_name
          FROM pms_deliverable d JOIN pms_project p ON p.project_id = d.project_id
         WHERE d.status <> 'APPROVED' AND d.due_date IS NOT NULL AND p.status <> '완료'
        """;

    private static final String TODAY_INSPECTIONS_SQL =
            "SELECT project_id, project_name, inspection_date FROM pms_project "
          + "WHERE status <> '완료' AND inspection_date = ?";

    private static final String TODAY_HIGH_PRIORITY_SQL = """
        SELECT i.issue_id AS id, i.project_id, i.title, i.type, i.priority, i.source_rule_id, p.project_name
          FROM pms_issue i JOIN pms_project p ON p.project_id = i.project_id
         WHERE i.priority = '상' AND i.status <> '완료' AND p.status <> '완료'
        """;

    private static final String ENABLED_RULES_SQL =
            "SELECT * FROM pms_signal_rule WHERE enabled = 1 ORDER BY rule_id";
    private static final String OPEN_TASKS_SQL = """
        SELECT t.task_id, t.project_id, t.task_name, t.status, t.progress_rate,
               t.planned_start_date, t.planned_end_date
          FROM pms_task t JOIN pms_project p ON p.project_id = t.project_id
         WHERE t.status <> 'DONE' AND p.status <> '완료'
        """;
    private static final String DELIVERABLE_REJECTS_SQL = """
        SELECT d.deliverable_id, d.project_id, d.deliverable_name, CAST(COUNT(*) AS SIGNED) AS reject_count
          FROM pms_audit_log l JOIN pms_deliverable d ON d.deliverable_id = l.entity_id
          JOIN pms_project p ON p.project_id = d.project_id
         WHERE l.entity_type = 'DELIVERABLE'
           AND JSON_UNQUOTE(JSON_EXTRACT(l.`after`, '$.status')) = 'REJECTED' AND p.status <> '완료'
         GROUP BY d.deliverable_id, d.project_id, d.deliverable_name
        """;
    private static final String OPEN_TYPED_RISKS_SQL = """
        SELECT i.*, p.project_name FROM pms_issue i JOIN pms_project p ON p.project_id = i.project_id
         WHERE i.type = '리스크' AND i.status <> '완료' AND p.status <> '완료' ORDER BY i.issue_id
        """;
    // 0039 — 이슈↔액션아이템은 이제 N:M 링크 테이블(pms_action_item_issue_link)이 원본.
    //   레거시 related_issue_id 단일 컬럼은 V31에서 이 테이블로 백필됐고 신규 등록은 더 이상 채우지 않는다.
    private static final String RISK_ACTION_COUNTS_SQL =
            "SELECT issue_id AS related_issue_id, CAST(COUNT(*) AS SIGNED) AS cnt "
          + "FROM pms_action_item_issue_link GROUP BY issue_id";

    // =====================================================================
    // 지연 신호 (ProjectDelaySignal)
    // =====================================================================

    record DelaySignal(long projectId, String projectName, Integer expected, int actual,
                       Integer delayPct, boolean fallbackUsed) {}

    private Integer[] computeExpected(long projectId, Map<String, Object> projectRow, LocalDate today) {
        // returns [expected, fallbackUsed(0/1)] or null
        List<Map<String, Object>> rows = jdbc.queryForList(PHASE_PLAN_SQL, projectId, projectId, projectId);
        List<int[]> planned = new ArrayList<>(); // [expected, weight]
        long totalWeight = 0;
        List<LocalDate[]> phases = new ArrayList<>();
        List<Long> weights = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            LocalDate s = SignalDates.parseDateOnly(r.get("planned_start_date"));
            LocalDate e = SignalDates.parseDateOnly(r.get("planned_end_date"));
            if (s != null && e != null) {
                phases.add(new LocalDate[]{s, e});
                long w = r.get("weight") == null ? 0 : ((Number) r.get("weight")).longValue();
                weights.add(w);
                totalWeight += w;
            }
        }
        if (!phases.isEmpty()) {
            double acc = 0;
            for (int i = 0; i < phases.size(); i++) {
                long w = totalWeight > 0 ? weights.get(i) : 1;
                acc += w * SignalDates.linearExpected(phases.get(i)[0], phases.get(i)[1], today);
            }
            int expected = (int) Math.round(acc / (totalWeight > 0 ? totalWeight : phases.size()));
            return new Integer[]{expected, 0};
        }
        LocalDate s = SignalDates.parseDateOnly(projectRow.get("planned_start_date"));
        LocalDate e = SignalDates.parseDateOnly(projectRow.get("planned_end_date"));
        if (s != null && e != null) return new Integer[]{SignalDates.linearExpected(s, e, today), 1};
        return null;
    }

    private List<DelaySignal> computeDelaySignals(List<Map<String, Object>> projects, LocalDate today) {
        List<DelaySignal> signals = new ArrayList<>();
        for (Map<String, Object> p : projects) {
            long projectId = ((Number) p.get("project_id")).longValue();
            String projectName = str(p.get("project_name"));
            int actual = ((Number) progressService.getProjectProgress(projectId).get("overall")).intValue();
            Integer[] exp = computeExpected(projectId, p, today);
            if (exp == null) {
                signals.add(new DelaySignal(projectId, projectName, null, actual, null, false));
            } else {
                signals.add(new DelaySignal(projectId, projectName, exp[0], actual,
                        exp[0] - actual, exp[1] == 1));
            }
        }
        signals.sort((a, b) -> Integer.compare(
                b.delayPct == null ? Integer.MIN_VALUE : b.delayPct,
                a.delayPct == null ? Integer.MIN_VALUE : a.delayPct));
        return signals;
    }

    // =====================================================================
    // GET /api/dashboard/signals
    // =====================================================================

    /** 0026: 위젯 서비스용 — 활성 프로젝트 지연 신호만(camelCase 맵). Today 계산 없이 가볍게. */
    public List<Map<String, Object>> delaySignalMaps() {
        LocalDate today = LocalDate.now();
        List<Map<String, Object>> projects = jdbc.queryForList(ACTIVE_PROJECTS_SQL);
        List<Map<String, Object>> out = new ArrayList<>();
        for (DelaySignal s : computeDelaySignals(projects, today)) out.add(delaySignalMap(s));
        return out;
    }

    public Map<String, Object> dashboardSignals() {
        LocalDate today = LocalDate.now();
        List<Map<String, Object>> projects = jdbc.queryForList(ACTIVE_PROJECTS_SQL);
        List<DelaySignal> signals = computeDelaySignals(projects, today);
        List<Map<String, Object>> todayItems = fetchTodayItems(today, signals);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("generatedAt", nowIso());
        List<Map<String, Object>> sigOut = new ArrayList<>();
        for (DelaySignal s : signals) sigOut.add(delaySignalMap(s));
        out.put("signals", sigOut);
        out.put("today", todayItems);
        return out;
    }

    private Map<String, Object> delaySignalMap(DelaySignal s) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("projectId", s.projectId);
        m.put("projectName", s.projectName);
        m.put("expected", s.expected);
        m.put("actual", s.actual);
        m.put("delayPct", s.delayPct);
        m.put("fallbackUsed", s.fallbackUsed);
        return m;
    }

    private List<Map<String, Object>> fetchTodayItems(LocalDate today, List<DelaySignal> delaySignals) {
        String todayStr = SignalDates.toDateStr(today);
        List<Map<String, Object>> dueItems = jdbc.queryForList(DUE_ITEMS_SQL);
        List<Map<String, Object>> inspections = jdbc.queryForList(TODAY_INSPECTIONS_SQL, todayStr);
        List<Map<String, Object>> issues = jdbc.queryForList(TODAY_HIGH_PRIORITY_SQL);

        List<Map<String, Object>> items = new ArrayList<>();
        for (DelaySignal s : delaySignals) {
            if (s.delayPct == null || s.delayPct <= 0) continue;
            Map<String, Object> it = todayItem("DELAY", "PROJECT", null, s.projectId, s.projectName,
                    "진척 지연: 기대 " + s.expected + "% 대비 실제 " + s.actual + "% (" + s.delayPct + "%p)");
            it.put("delayPct", s.delayPct);
            items.add(it);
        }
        for (Map<String, Object> r : dueItems) {
            LocalDate due = SignalDates.parseDateOnly(r.get("due_date"));
            if (due == null) continue;
            int overdueDays = SignalDates.dayDiff(due, today);
            if (overdueDays < 0) continue;
            Map<String, Object> it = todayItem(overdueDays > 0 ? "DELAY" : "DUE_TODAY",
                    str(r.get("entity_type")), toLong(r.get("entity_id")),
                    ((Number) r.get("project_id")).longValue(), str(r.get("project_name")), str(r.get("title")));
            it.put("dueDate", SignalDates.toDateStr(due));
            items.add(it);
        }
        for (Map<String, Object> r : inspections) {
            Map<String, Object> it = todayItem("DUE_TODAY", "PROJECT", null,
                    ((Number) r.get("project_id")).longValue(), str(r.get("project_name")),
                    ("검수일: " + (r.get("project_name") == null ? "" : r.get("project_name"))).trim());
            it.put("dueDate", todayStr);
            items.add(it);
        }
        for (Map<String, Object> r : issues) {
            Map<String, Object> it = todayItem("HIGH_PRIORITY", "ISSUE", toLong(r.get("id")),
                    ((Number) r.get("project_id")).longValue(), str(r.get("project_name")), str(r.get("title")));
            it.put("priority", r.get("priority"));
            it.put("auto", r.get("source_rule_id") != null);
            items.add(it);
        }

        Map<String, Integer> rank = Map.of("DELAY", 1, "DUE_TODAY", 2, "HIGH_PRIORITY", 3);
        items.sort(Comparator
                .comparingInt((Map<String, Object> m) -> rank.getOrDefault(str(m.get("kind")), 99))
                .thenComparing(m -> {
                    Object d = m.get("delayPct");
                    return d == null ? Integer.MIN_VALUE : ((Number) d).intValue();
                }, Comparator.reverseOrder())
                .thenComparing(m -> m.get("dueDate") == null ? "9999" : m.get("dueDate").toString())
                .thenComparingLong(m -> ((Number) m.get("projectId")).longValue())
                .thenComparingLong(m -> m.get("entityId") == null ? 0 : ((Number) m.get("entityId")).longValue()));
        return items;
    }

    private Map<String, Object> todayItem(String kind, String entityType, Long entityId,
                                          long projectId, String projectName, String title) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("kind", kind);
        m.put("entityType", entityType);
        m.put("entityId", entityId);
        m.put("projectId", projectId);
        m.put("projectName", projectName);
        m.put("title", title);
        m.put("dueDate", null);
        m.put("priority", null);
        return m;
    }

    // =====================================================================
    // POST /api/signals/evaluate  (트랜잭션)
    // =====================================================================

    @Transactional
    public Map<String, Object> evaluate(Actor actor) {
        LocalDate today = LocalDate.now();
        String todayStr = SignalDates.toDateStr(today);
        String actorUid = actor.userId();

        List<Map<String, Object>> rules = jdbc.queryForList(ENABLED_RULES_SQL);
        List<Map<String, Object>> projects = jdbc.queryForList(ACTIVE_PROJECTS_SQL);
        MetricContext ctx = new MetricContext(today, projects);

        // 오버라이드 인덱스: metric → 프로젝트 전용 규칙이 있는 project_id 집합
        Map<String, Set<Long>> overridesByMetric = new LinkedHashMap<>();
        for (Map<String, Object> r : rules) {
            if (r.get("project_id") == null) continue;
            overridesByMetric.computeIfAbsent(str(r.get("metric")), k -> new LinkedHashSet<>())
                    .add(((Number) r.get("project_id")).longValue());
        }

        List<Map<String, Object>> reports = new ArrayList<>();
        for (Map<String, Object> rule : rules) {
            reports.add(evaluateRule(ctx, rule, overridesByMetric, todayStr, actorUid));
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("evaluatedAt", nowIso());
        out.put("rules", reports);
        return out;
    }

    private Map<String, Object> evaluateRule(MetricContext ctx, Map<String, Object> rule,
            Map<String, Set<Long>> overridesByMetric, String todayStr, String actorUid) {
        long ruleId = ((Number) rule.get("rule_id")).longValue();
        Long ruleProjectId = rule.get("project_id") == null ? null : ((Number) rule.get("project_id")).longValue();
        String operator = rule.get("operator") == null ? "GT" : str(rule.get("operator"));
        Double threshold = rule.get("threshold") == null ? null : ((Number) rule.get("threshold")).doubleValue();
        String metric = str(rule.get("metric"));
        String action = str(rule.get("action"));

        List<RuleMatch> matched = new ArrayList<>();
        Set<Long> evaluated = new LinkedHashSet<>();
        Set<Long> overrideSet = overridesByMetric.getOrDefault(metric, Set.of());

        java.util.function.LongPredicate applies = pid ->
                ruleProjectId != null ? pid == ruleProjectId : !overrideSet.contains(pid);
        if (ruleProjectId == null) evaluated.addAll(overrideSet);

        boolean isCreate = SignalConstants.CREATE_METRICS.contains(metric);
        boolean isEscalate = SignalConstants.ESCALATE_METRICS.contains(metric);

        Map<String, Object> report = new LinkedHashMap<>();
        report.put("ruleId", ruleId);
        report.put("projectId", ruleProjectId);
        report.put("name", str(rule.get("name")));
        report.put("metric", metric);
        report.put("action", action);
        List<Long> createdIds = new ArrayList<>();
        List<Long> resolvedIds = new ArrayList<>();
        List<Long> escalatedIds = new ArrayList<>();
        int[] skipped = {0};

        String note = null;
        if (!isCreate && !isEscalate) {
            note = "미지 metric(" + metric + ") — 평가 생략(fail-closed)";
        } else if ("CREATE_RISK".equals(action) && isEscalate) {
            note = "전환 계열 metric(" + metric + ")은 CREATE_RISK와 함께 쓸 수 없습니다 — 평가 생략";
        } else if ("ESCALATE_ISSUE".equals(action) && isCreate) {
            note = "등록 계열 metric(" + metric + ")은 ESCALATE_ISSUE와 함께 쓸 수 없습니다 — 평가 생략";
        }

        if (note == null && isCreate) {
            matched = ctx.evalCreateMetric(metric, operator, threshold, applies, evaluated, rule);
            if ("CREATE_RISK".equals(action)) {
                for (RuleMatch m : matched) {
                    Long relatedTaskId = m.relatedTaskId;
                    boolean dup = hasOpenRiskDup(ruleId, m.projectId, relatedTaskId);
                    if (dup) { skipped[0]++; continue; }
                    Map<String, Object> project = ctx.projectById.get(m.projectId);
                    String title = autoRiskTitle(rule, metric, m);
                    jdbc.update(
                            "INSERT INTO pms_issue (project_id, title, type, priority, owner_uid, owner_name, "
                          + "reported_date, status, source_rule_id, related_task_id) "
                          + "VALUES (?, ?, '리스크', '중', ?, ?, ?, '발생', ?, ?)",
                            m.projectId, title,
                            project == null ? null : project.get("pm_id"),
                            project == null ? null : project.get("pm_name"),
                            todayStr, ruleId, relatedTaskId);
                    Long issueId = jdbc.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
                    createdIds.add(issueId);
                    // 0033 ⑧ — 규칙 발동 자동 리스크 → 프로젝트 PM 알림
                    if (project != null && project.get("pm_name") != null) {
                        notify.notifyByName(m.projectId, String.valueOf(project.get("pm_name")),
                                "RULE_RISK", "ISSUE", issueId, "[자동 등록] " + title);
                    }
                    Map<String, Object> after = new LinkedHashMap<>();
                    after.put("status", "발생"); after.put("title", title);
                    after.put("source_rule_id", ruleId); after.put("related_task_id", relatedTaskId);
                    insertAudit("ISSUE", issueId, m.projectId, "INSERT", null, null, after,
                            actorUid, "[자동] 신호 규칙 평가 — 리스크 자동 등록 (rule_id=" + ruleId + ")");
                }
                // 해소
                Set<String> matchedKeys = new LinkedHashSet<>();
                for (RuleMatch m : matched) matchedKeys.add(riskKey(m.projectId, m.relatedTaskId));
                List<Map<String, Object>> openRisks = jdbc.queryForList(
                        "SELECT * FROM pms_issue WHERE source_rule_id = ? AND status <> '완료' ORDER BY issue_id", ruleId);
                for (Map<String, Object> risk : openRisks) {
                    long pid = ((Number) risk.get("project_id")).longValue();
                    Long rtid = risk.get("related_task_id") == null ? null : ((Number) risk.get("related_task_id")).longValue();
                    if (matchedKeys.contains(riskKey(pid, rtid))) continue;
                    boolean active = ctx.projectById.containsKey(pid);
                    if (active && !evaluated.contains(pid)) continue;
                    if (isHumanTouched(risk)) continue;
                    jdbc.update("UPDATE pms_issue SET status = '완료', resolved_date = ? WHERE issue_id = ?",
                            todayStr, risk.get("issue_id"));
                    long issueId = ((Number) risk.get("issue_id")).longValue();
                    resolvedIds.add(issueId);
                    Map<String, Object> before = Map.of("status", str(risk.get("status")));
                    Map<String, Object> after = new LinkedHashMap<>();
                    after.put("status", "완료"); after.put("resolved_date", todayStr);
                    insertAudit("ISSUE", issueId, pid, "UPDATE", List.of("status", "resolved_date"),
                            before, after, actorUid, "[자동] 신호 조건 해소 — 자동 완료 (rule_id=" + ruleId + ")");
                }
            }
        } else if (note == null && isEscalate) {
            for (Map<String, Object> risk : ctx.getOpenRisks()) {
                long pid = ((Number) risk.get("project_id")).longValue();
                if (!applies.test(pid)) continue;
                double[] verdict = ctx.evalEscalateMetric(metric, operator, threshold, rule, risk);
                if (verdict == null) continue; // 판정 불가
                evaluated.add(pid);
                if (verdict[0] == 0) continue; // ok=false
                RuleMatch m = new RuleMatch(pid, str(risk.get("project_name")), verdict[1],
                        null, null, risk.get("related_task_id") == null ? null
                                : ((Number) risk.get("related_task_id")).longValue());
                matched.add(m);
                if ("ESCALATE_ISSUE".equals(action)) {
                    jdbc.update("UPDATE pms_issue SET type = '이슈' WHERE issue_id = ?", risk.get("issue_id"));
                    long issueId = ((Number) risk.get("issue_id")).longValue();
                    escalatedIds.add(issueId);
                    insertAudit("ISSUE", issueId, pid, "UPDATE", List.of("type"),
                            Map.of("type", "리스크"), Map.of("type", "이슈"), actorUid,
                            "[자동 전환] " + rule.get("name") + ": " + metric + "=" + fmt(verdict[1])
                                    + " — 리스크→이슈 전환 (rule_id=" + ruleId + ")");
                }
            }
        }

        report.put("matched", matched.stream().map(SignalEngine::matchMap).toList());
        report.put("createdIssueIds", createdIds);
        report.put("skippedExisting", skipped[0]);
        report.put("resolvedIssueIds", resolvedIds);
        report.put("escalatedIssueIds", escalatedIds);
        if (note != null) report.put("note", note);
        return report;
    }

    private boolean hasOpenRiskDup(long ruleId, long projectId, Long relatedTaskId) {
        String sql = "SELECT COUNT(*) FROM pms_issue WHERE source_rule_id = ? AND project_id = ? "
                + "AND related_task_id " + (relatedTaskId == null ? "IS NULL" : "= ?") + " AND status <> '완료'";
        Integer c = relatedTaskId == null
                ? jdbc.queryForObject(sql, Integer.class, ruleId, projectId)
                : jdbc.queryForObject(sql, Integer.class, ruleId, projectId, relatedTaskId);
        return c != null && c > 0;
    }

    private boolean isHumanTouched(Map<String, Object> issue) {
        Integer cnt = jdbc.queryForObject(
                "SELECT COUNT(*) FROM pms_audit_log WHERE entity_type = 'ISSUE' AND entity_id = ? AND action = 'UPDATE'",
                Integer.class, issue.get("issue_id"));
        if (cnt != null && cnt > 0) return true;
        Object rc = issue.get("review_comment");
        if (rc != null && !rc.toString().trim().isEmpty()) return true;
        if (issue.get("resolved_date") != null) return true;
        LocalDateTime created = toDateTime(issue.get("created_at"));
        LocalDateTime updated = toDateTime(issue.get("updated_at"));
        if (created != null && updated != null
                && java.time.Duration.between(created, updated).toMillis() > 1000) return true;
        return false;
    }

    private void insertAudit(String entityType, long entityId, Long projectId, String action,
                             List<String> changedFields, Object before, Object after, String actorUid, String reason) {
        jdbc.update(
                "INSERT INTO pms_audit_log (entity_type, entity_id, project_id, action, changed_fields, "
              + "`before`, `after`, changed_by_uid, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                entityType, entityId, projectId, action,
                Json.write(changedFields), Json.write(before), Json.write(after), actorUid, reason);
    }

    // ---- RuleMatch + 제목 -------------------------------------------------

    static final class RuleMatch {
        final long projectId;
        final String projectName;
        final double value;
        final Integer expected;
        final Integer actual;
        final Long relatedTaskId;
        String taskName;
        List<Map<String, Object>> detail;

        RuleMatch(long projectId, String projectName, double value, Integer expected,
                  Integer actual, Long relatedTaskId) {
            this.projectId = projectId;
            this.projectName = projectName;
            this.value = value;
            this.expected = expected;
            this.actual = actual;
            this.relatedTaskId = relatedTaskId;
        }

        RuleMatch withTask(String name) { this.taskName = name; return this; }
        RuleMatch withDetail(List<Map<String, Object>> d) { this.detail = d; return this; }
    }

    private static Map<String, Object> matchMap(RuleMatch m) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("projectId", m.projectId);
        out.put("projectName", m.projectName);
        out.put("value", numOut(m.value));
        if (m.expected != null) out.put("expected", m.expected);
        if (m.actual != null) out.put("actual", m.actual);
        if (m.relatedTaskId != null) out.put("relatedTaskId", m.relatedTaskId);
        if (m.taskName != null) out.put("taskName", m.taskName);
        if (m.detail != null) out.put("detail", m.detail);
        return out;
    }

    private String autoRiskTitle(Map<String, Object> rule, String metric, RuleMatch m) {
        Object proj = m.projectName != null ? m.projectName : m.projectId;
        if (m.expected != null && m.actual != null) {
            return "[자동] " + rule.get("name") + ": " + proj + " — 기대 " + m.expected + "% 대비 실제 "
                    + m.actual + "% (" + fmt(m.value) + "%p 지연)";
        }
        if (m.relatedTaskId != null) {
            return "[자동] " + rule.get("name") + ": " + proj + " — 태스크 '"
                    + (m.taskName != null ? m.taskName : m.relatedTaskId) + "' " + metric + "=" + fmt(m.value);
        }
        return "[자동] " + rule.get("name") + ": " + proj + " — " + metric + "=" + fmt(m.value);
    }

    private static String riskKey(long pid, Long taskId) {
        return pid + "|" + (taskId == null ? "" : taskId);
    }

    // =====================================================================
    // metric 평가 컨텍스트 (캐시)
    // =====================================================================

    private final class MetricContext {
        final LocalDate today;
        final List<Map<String, Object>> projects;
        final Map<Long, Map<String, Object>> projectById = new LinkedHashMap<>();

        private List<DelaySignal> delayCache;
        private Map<Long, StalledInfo> stalledCache;
        private List<Map<String, Object>> dueCache;
        private List<Map<String, Object>> taskCache;
        private List<Map<String, Object>> rejectCache;
        private List<Map<String, Object>> riskCache;
        private Map<Long, Integer> actionCountCache;

        MetricContext(LocalDate today, List<Map<String, Object>> projects) {
            this.today = today;
            this.projects = projects;
            for (Map<String, Object> p : projects) projectById.put(((Number) p.get("project_id")).longValue(), p);
        }

        List<DelaySignal> getDelay() {
            if (delayCache == null) delayCache = computeDelaySignals(projects, today);
            return delayCache;
        }

        Map<Long, StalledInfo> getStalled() {
            if (stalledCache != null) return stalledCache;
            stalledCache = new LinkedHashMap<>();
            for (Map<String, Object> r : jdbc.queryForList(STALLED_DELIVERABLES_SQL)) {
                LocalDateTime entered = toDateTime(r.get("entered_at"));
                if (entered == null) continue;
                int days = SignalDates.dayDiff(entered.toLocalDate(), today);
                long pid = ((Number) r.get("project_id")).longValue();
                StalledInfo cur = stalledCache.computeIfAbsent(pid, k -> new StalledInfo());
                cur.value = Math.max(cur.value, days);
                Map<String, Object> d = new LinkedHashMap<>();
                d.put("deliverableId", ((Number) r.get("deliverable_id")).longValue());
                d.put("name", r.get("deliverable_name")); d.put("status", r.get("status"));
                d.put("stalledDays", days);
                cur.detail.add(d);
            }
            return stalledCache;
        }

        List<Map<String, Object>> getDueItems() {
            if (dueCache != null) return dueCache;
            dueCache = new ArrayList<>();
            for (Map<String, Object> r : jdbc.queryForList(DUE_ITEMS_SQL)) {
                LocalDate due = SignalDates.parseDateOnly(r.get("due_date"));
                if (due == null) continue;
                Map<String, Object> row = new LinkedHashMap<>(r);
                row.put("due_in_days", SignalDates.dayDiff(today, due)); // 음수=연체
                dueCache.add(row);
            }
            return dueCache;
        }

        List<Map<String, Object>> getTasks() {
            if (taskCache == null) taskCache = jdbc.queryForList(OPEN_TASKS_SQL);
            return taskCache;
        }

        List<Map<String, Object>> getRejectCounts() {
            if (rejectCache == null) rejectCache = jdbc.queryForList(DELIVERABLE_REJECTS_SQL);
            return rejectCache;
        }

        List<Map<String, Object>> getOpenRisks() {
            if (riskCache == null) riskCache = jdbc.queryForList(OPEN_TYPED_RISKS_SQL);
            return riskCache;
        }

        Map<Long, Integer> getActionCounts() {
            if (actionCountCache != null) return actionCountCache;
            actionCountCache = new LinkedHashMap<>();
            for (Map<String, Object> r : jdbc.queryForList(RISK_ACTION_COUNTS_SQL)) {
                actionCountCache.put(((Number) r.get("related_issue_id")).longValue(),
                        ((Number) r.get("cnt")).intValue());
            }
            return actionCountCache;
        }

        String projectName(long pid) {
            Map<String, Object> p = projectById.get(pid);
            return p == null ? null : str(p.get("project_name"));
        }

        // ---- 등록 계열 metric ----
        List<RuleMatch> evalCreateMetric(String metric, String op, Double th,
                java.util.function.LongPredicate applies, Set<Long> evaluated, Map<String, Object> rule) {
            List<RuleMatch> matched = new ArrayList<>();
            switch (metric) {
                case "PROGRESS_DELAY_PCT" -> {
                    for (DelaySignal s : getDelay()) {
                        if (!applies.test(s.projectId)) continue;
                        if (s.delayPct == null) continue;
                        evaluated.add(s.projectId);
                        if (SignalConstants.compare(op, s.delayPct, th)) {
                            matched.add(new RuleMatch(s.projectId, s.projectName, s.delayPct,
                                    s.expected, s.actual, null));
                        }
                    }
                }
                case "STALLED_DAYS" -> {
                    markAllEvaluated(applies, evaluated);
                    for (Map.Entry<Long, StalledInfo> e : getStalled().entrySet()) {
                        long pid = e.getKey();
                        if (!applies.test(pid)) continue;
                        if (SignalConstants.compare(op, e.getValue().value, th)) {
                            List<Map<String, Object>> det = e.getValue().detail.stream()
                                    .filter(d -> SignalConstants.compare(op, ((Number) d.get("stalledDays")).doubleValue(), th))
                                    .toList();
                            matched.add(new RuleMatch(pid, projectName(pid), e.getValue().value, null, null, null)
                                    .withDetail(new ArrayList<>(det)));
                        }
                    }
                }
                case "DUE_IN_DAYS" -> {
                    markAllEvaluated(applies, evaluated);
                    Map<Long, List<Map<String, Object>>> byProject = new LinkedHashMap<>();
                    for (Map<String, Object> i : getDueItems()) {
                        long pid = ((Number) i.get("project_id")).longValue();
                        if (!applies.test(pid)) continue;
                        if (!SignalConstants.compare(op, ((Number) i.get("due_in_days")).doubleValue(), th)) continue;
                        byProject.computeIfAbsent(pid, k -> new ArrayList<>()).add(i);
                    }
                    for (Map.Entry<Long, List<Map<String, Object>>> e : byProject.entrySet()) {
                        List<Map<String, Object>> det = new ArrayList<>();
                        for (Map<String, Object> i : e.getValue()) {
                            Map<String, Object> d = new LinkedHashMap<>();
                            d.put("entityType", i.get("entity_type"));
                            d.put("entityId", ((Number) i.get("entity_id")).longValue());
                            d.put("title", i.get("title"));
                            d.put("dueInDays", ((Number) i.get("due_in_days")).intValue());
                            det.add(d);
                        }
                        matched.add(new RuleMatch(e.getKey(), projectName(e.getKey()), e.getValue().size(), null, null, null)
                                .withDetail(det));
                    }
                }
                case "TASK_OVERDUE_DAYS" -> {
                    markAllEvaluated(applies, evaluated);
                    for (Map<String, Object> t : getTasks()) {
                        long pid = ((Number) t.get("project_id")).longValue();
                        if (!applies.test(pid)) continue;
                        Integer days = taskOverdueDays(t);
                        if (days == null) continue;
                        if (SignalConstants.compare(op, days, th)) {
                            matched.add(new RuleMatch(pid, projectName(pid), days,
                                    null, null, ((Number) t.get("task_id")).longValue())
                                    .withTask(str(t.get("task_name"))));
                        }
                    }
                }
                case "TASK_PROGRESS_GAP" -> {
                    markAllEvaluated(applies, evaluated);
                    for (Map<String, Object> t : getTasks()) {
                        long pid = ((Number) t.get("project_id")).longValue();
                        if (!applies.test(pid)) continue;
                        Integer gap = taskProgressGap(t);
                        if (gap == null) continue;
                        if (SignalConstants.compare(op, gap, th)) {
                            matched.add(new RuleMatch(pid, projectName(pid), gap,
                                    null, null, ((Number) t.get("task_id")).longValue())
                                    .withTask(str(t.get("task_name"))));
                        }
                    }
                }
                case "DELIVERABLE_REJECT_COUNT" -> {
                    markAllEvaluated(applies, evaluated);
                    Map<Long, List<Map<String, Object>>> byProject = new LinkedHashMap<>();
                    for (Map<String, Object> r : getRejectCounts()) {
                        long pid = ((Number) r.get("project_id")).longValue();
                        if (!applies.test(pid)) continue;
                        if (!SignalConstants.compare(op, ((Number) r.get("reject_count")).doubleValue(), th)) continue;
                        byProject.computeIfAbsent(pid, k -> new ArrayList<>()).add(r);
                    }
                    for (Map.Entry<Long, List<Map<String, Object>>> e : byProject.entrySet()) {
                        double max = e.getValue().stream().mapToDouble(r -> ((Number) r.get("reject_count")).doubleValue()).max().orElse(0);
                        List<Map<String, Object>> det = new ArrayList<>();
                        for (Map<String, Object> r : e.getValue()) {
                            Map<String, Object> d = new LinkedHashMap<>();
                            d.put("deliverableId", ((Number) r.get("deliverable_id")).longValue());
                            d.put("name", r.get("deliverable_name"));
                            d.put("rejectCount", ((Number) r.get("reject_count")).intValue());
                            det.add(d);
                        }
                        matched.add(new RuleMatch(e.getKey(), projectName(e.getKey()), max, null, null, null).withDetail(det));
                    }
                }
                case "DELIVERABLE_OVERDUE_COUNT" -> {
                    markAllEvaluated(applies, evaluated);
                    Map<Long, List<Map<String, Object>>> byProject = new LinkedHashMap<>();
                    for (Map<String, Object> i : getDueItems()) {
                        if (!"DELIVERABLE".equals(str(i.get("entity_type")))) continue;
                        if (((Number) i.get("due_in_days")).intValue() >= 0) continue;
                        long pid = ((Number) i.get("project_id")).longValue();
                        if (!applies.test(pid)) continue;
                        byProject.computeIfAbsent(pid, k -> new ArrayList<>()).add(i);
                    }
                    for (Map.Entry<Long, List<Map<String, Object>>> e : byProject.entrySet()) {
                        if (!SignalConstants.compare(op, e.getValue().size(), th)) continue;
                        List<Map<String, Object>> det = new ArrayList<>();
                        for (Map<String, Object> i : e.getValue()) {
                            Map<String, Object> d = new LinkedHashMap<>();
                            d.put("deliverableId", ((Number) i.get("entity_id")).longValue());
                            d.put("title", i.get("title"));
                            d.put("dueInDays", ((Number) i.get("due_in_days")).intValue());
                            det.add(d);
                        }
                        matched.add(new RuleMatch(e.getKey(), projectName(e.getKey()), e.getValue().size(), null, null, null).withDetail(det));
                    }
                }
                default -> { }
            }
            return matched;
        }

        void markAllEvaluated(java.util.function.LongPredicate applies, Set<Long> evaluated) {
            for (Map<String, Object> p : projects) {
                long pid = ((Number) p.get("project_id")).longValue();
                if (applies.test(pid)) evaluated.add(pid);
            }
        }

        Integer taskOverdueDays(Map<String, Object> task) {
            LocalDate end = SignalDates.parseDateOnly(task.get("planned_end_date"));
            if (end == null) return null;
            int days = SignalDates.dayDiff(end, today);
            return days > 0 ? days : null;
        }

        Integer taskProgressGap(Map<String, Object> task) {
            LocalDate start = SignalDates.parseDateOnly(task.get("planned_start_date"));
            LocalDate end = SignalDates.parseDateOnly(task.get("planned_end_date"));
            if (start == null || end == null) return null;
            int progress = task.get("progress_rate") == null ? 0 : ((Number) task.get("progress_rate")).intValue();
            return SignalDates.linearExpected(start, end, today) - progress;
        }

        // ---- 전환 계열 metric — return null(판정불가) 또는 [ok(0/1), value] ----
        double[] evalEscalateMetric(String metric, String op, Double th, Map<String, Object> rule, Map<String, Object> risk) {
            switch (metric) {
                case "RISK_UNRESOLVED_DAYS" -> {
                    Integer age = riskAgeDays(risk);
                    if (age == null) return null;
                    return new double[]{SignalConstants.compare(op, age, th) ? 1 : 0, age};
                }
                case "RISK_PRIORITY_AGE" -> {
                    Integer age = riskAgeDays(risk);
                    if (age == null) return null;
                    Object paramsObj = Json.readObject(str(rule.get("params")));
                    @SuppressWarnings("unchecked")
                    Map<String, Object> params = (Map<String, Object>) paramsObj;
                    Object lim = params.get(str(risk.get("priority")));
                    if (!(lim instanceof Number)) return null;
                    return new double[]{SignalConstants.compare(op, age, ((Number) lim).doubleValue()) ? 1 : 0, age};
                }
                case "SOURCE_METRIC_WORSENED" -> {
                    if (risk.get("source_rule_id") == null) return null;
                    List<Map<String, Object>> srows = jdbc.queryForList(
                            "SELECT * FROM pms_signal_rule WHERE rule_id = ?", risk.get("source_rule_id"));
                    if (srows.isEmpty()) return null;
                    Map<String, Object> sourceRule = srows.get(0);
                    Double value = currentMetricValue(sourceRule, ((Number) risk.get("project_id")).longValue(),
                            risk.get("related_task_id") == null ? null : ((Number) risk.get("related_task_id")).longValue());
                    if (value == null) return null;
                    return new double[]{SignalConstants.compare(op, value, th) ? 1 : 0, value};
                }
                case "RISK_NO_ACTION_DAYS" -> {
                    Integer age = riskAgeDays(risk);
                    if (age == null) return null;
                    int cnt = getActionCounts().getOrDefault(((Number) risk.get("issue_id")).longValue(), 0);
                    if (cnt > 0) return new double[]{0, age};
                    return new double[]{SignalConstants.compare(op, age, th) ? 1 : 0, age};
                }
                default -> { return null; }
            }
        }

        Integer riskAgeDays(Map<String, Object> risk) {
            LocalDate base = SignalDates.parseDateOnly(risk.get("reported_date"));
            if (base == null) base = SignalDates.parseDateOnly(risk.get("created_at"));
            if (base == null) return null;
            return SignalDates.dayDiff(base, today);
        }

        Double currentMetricValue(Map<String, Object> sourceRule, long projectId, Long relatedTaskId) {
            String sm = str(sourceRule.get("metric"));
            switch (sm) {
                case "PROGRESS_DELAY_PCT" -> {
                    for (DelaySignal s : getDelay()) if (s.projectId == projectId) return s.delayPct == null ? null : (double) s.delayPct;
                    return null;
                }
                case "STALLED_DAYS" -> {
                    StalledInfo si = getStalled().get(projectId);
                    return si == null ? 0.0 : (double) si.value;
                }
                case "DUE_IN_DAYS" -> {
                    String op = sourceRule.get("operator") == null ? "GT" : str(sourceRule.get("operator"));
                    Double th = sourceRule.get("threshold") == null ? null : ((Number) sourceRule.get("threshold")).doubleValue();
                    long cnt = getDueItems().stream().filter(i -> ((Number) i.get("project_id")).longValue() == projectId
                            && SignalConstants.compare(op, ((Number) i.get("due_in_days")).doubleValue(), th)).count();
                    return (double) cnt;
                }
                case "TASK_OVERDUE_DAYS" -> {
                    double max = 0;
                    for (Map<String, Object> t : getTasks()) {
                        if (((Number) t.get("project_id")).longValue() != projectId) continue;
                        if (relatedTaskId != null && ((Number) t.get("task_id")).longValue() != relatedTaskId) continue;
                        Integer d = taskOverdueDays(t);
                        max = Math.max(max, d == null ? 0 : d);
                    }
                    return max;
                }
                case "TASK_PROGRESS_GAP" -> {
                    double max = 0;
                    for (Map<String, Object> t : getTasks()) {
                        if (((Number) t.get("project_id")).longValue() != projectId) continue;
                        if (relatedTaskId != null && ((Number) t.get("task_id")).longValue() != relatedTaskId) continue;
                        Integer g = taskProgressGap(t);
                        max = Math.max(max, g == null ? 0 : g);
                    }
                    return max;
                }
                case "DELIVERABLE_REJECT_COUNT" -> {
                    double max = 0;
                    for (Map<String, Object> r : getRejectCounts()) {
                        if (((Number) r.get("project_id")).longValue() == projectId) {
                            max = Math.max(max, ((Number) r.get("reject_count")).doubleValue());
                        }
                    }
                    return max;
                }
                case "DELIVERABLE_OVERDUE_COUNT" -> {
                    long cnt = getDueItems().stream().filter(i ->
                            ((Number) i.get("project_id")).longValue() == projectId
                            && "DELIVERABLE".equals(str(i.get("entity_type")))
                            && ((Number) i.get("due_in_days")).intValue() < 0).count();
                    return (double) cnt;
                }
                default -> { return null; }
            }
        }
    }

    private static final class StalledInfo {
        int value = 0;
        List<Map<String, Object>> detail = new ArrayList<>();
    }

    // ---- 값 헬퍼 ----------------------------------------------------------

    private static Object numOut(double d) {
        return d == Math.floor(d) && !Double.isInfinite(d) ? (long) d : d;
    }

    private static String fmt(double d) {
        return d == Math.floor(d) && !Double.isInfinite(d) ? String.valueOf((long) d) : String.valueOf(d);
    }

    private static LocalDateTime toDateTime(Object o) {
        if (o == null) return null;
        if (o instanceof LocalDateTime dt) return dt;
        if (o instanceof java.sql.Timestamp ts) return ts.toLocalDateTime();
        if (o instanceof java.sql.Date d) return d.toLocalDate().atStartOfDay();
        if (o instanceof LocalDate d) return d.atStartOfDay();
        return null;
    }

    private static Long toLong(Object o) {
        return o == null ? null : ((Number) o).longValue();
    }

    private static String str(Object o) { return o == null ? null : o.toString(); }

    private static String nowIso() {
        return java.time.OffsetDateTime.now(java.time.ZoneOffset.UTC)
                .format(java.time.format.DateTimeFormatter.ISO_OFFSET_DATE_TIME);
    }
}
