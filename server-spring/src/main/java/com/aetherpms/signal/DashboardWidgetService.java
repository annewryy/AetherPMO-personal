package com.aetherpms.signal;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import com.aetherpms.common.Json;
import com.aetherpms.engine.SignalEngine;

/**
 * 0026 §A — GET /api/dashboard/widgets 계산(읽기 전용, 쓰기 0).
 *  - today:  오늘 해야할 일 3열(태스크·액션아이템·미제출 산출물, due ≤ 오늘)
 *  - recent: 최근 활동 3열(공문·회의록·제출 산출물, 각 5건)
 *  - attention/risks/recommendations: 규칙 기반 3위젯(AI 미채택 — 0003 결정 1).
 *    건강도 감점 가중치는 pms_signal_rule metric=HEALTH_SCORE params(JSON)로 설정 가능,
 *    행이 없으면 DEFAULT_WEIGHTS(fail-open).
 */
@Service
public class DashboardWidgetService {

    private static final int RECENT_LIMIT = 5;

    /** 0036 — 관리자 편집 기준의 기본값(행 없을 때 fail-open). delayRiskPct=파생 리스크·권장
     *  조치 진척 갭 하한(%p), topLimit=위젯 표시 건수. DashboardCriteriaController가 편집. */
    static final Map<String, Number> DEFAULT_WEIGHTS = Map.of(
            "delay", -25, "issueHigh", -15, "issueMid", -10, "issueLow", -5,
            "overdueDeliverablePer", -3, "progressGapMax", -15,
            "warnBelow", 70, "dangerBelow", 50,
            "delayRiskPct", 10, "topLimit", 5);

    private final JdbcTemplate jdbc;
    private final SignalEngine engine;

    public DashboardWidgetService(JdbcTemplate jdbc, SignalEngine engine) {
        this.jdbc = jdbc;
        this.engine = engine;
    }

    public Map<String, Object> widgets() {
        LocalDate today = LocalDate.now();
        String todayStr = today.toString();

        List<Map<String, Object>> delaySignals = engine.delaySignalMaps();
        Map<String, Number> w = healthWeights();  // 0036 — 위젯 기준(관리자 편집) 1회 로드

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("generatedAt", java.time.OffsetDateTime.now(java.time.ZoneOffset.UTC)
                .format(java.time.format.DateTimeFormatter.ISO_OFFSET_DATE_TIME));
        out.put("today", todaySection(todayStr));
        out.put("recent", recentSection());
        out.put("attention", attentionSection(todayStr, delaySignals, w));
        out.put("risks", risksSection(today, delaySignals, w));
        out.put("recommendations", recommendationsSection(todayStr, delaySignals, w));
        return out;
    }

    // ---- D1: 오늘 해야할 일 -------------------------------------------------

    private Map<String, Object> todaySection(String todayStr) {
        List<Map<String, Object>> tasks = new ArrayList<>();
        jdbc.query("""
                SELECT t.task_id, t.project_id, p.project_name, t.task_name,
                       COALESCE(t.progress_rate, 0) AS progress, t.planned_end_date
                  FROM pms_task t JOIN pms_project p ON p.project_id = t.project_id
                 WHERE p.status <> '완료' AND t.status <> 'DONE'
                   AND COALESCE(t.progress_rate, 0) < 100
                   AND t.planned_end_date IS NOT NULL AND t.planned_end_date <= ?
                 ORDER BY t.planned_end_date, t.task_id""",
                rs -> { tasks.add(row(Map.of(
                        "taskId", rs.getLong(1), "projectId", rs.getLong(2),
                        "projectName", s(rs.getString(3)), "name", s(rs.getString(4)),
                        "progress", rs.getInt(5), "dueDate", s(rs.getString(6)),
                        "overdue", rs.getString(6).compareTo(todayStr) < 0))); },
                todayStr);

        List<Map<String, Object>> actions = new ArrayList<>();
        jdbc.query("""
                SELECT a.action_id, a.project_id, p.project_name, a.title, a.assignee_name, a.due_date
                  FROM pms_action_item a JOIN pms_project p ON p.project_id = a.project_id
                 WHERE p.status <> '완료' AND a.status <> '완료'
                   AND a.due_date IS NOT NULL AND a.due_date <= ?
                 ORDER BY a.due_date, a.action_id""",
                rs -> { actions.add(row(mapOfNullable(
                        "actionId", rs.getLong(1), "projectId", rs.getLong(2),
                        "projectName", s(rs.getString(3)), "title", s(rs.getString(4)),
                        "assigneeName", rs.getString(5), "dueDate", s(rs.getString(6)),
                        "overdue", rs.getString(6).compareTo(todayStr) < 0))); },
                todayStr);

        List<Map<String, Object>> deliverables = new ArrayList<>();
        jdbc.query("""
                SELECT d.deliverable_id, d.project_id, p.project_name, d.deliverable_name, d.due_date
                  FROM pms_deliverable d JOIN pms_project p ON p.project_id = d.project_id
                 WHERE p.status <> '완료' AND d.status <> 'APPROVED' AND d.submitted_at IS NULL
                   AND d.due_date IS NOT NULL AND d.due_date <= ?
                 ORDER BY d.due_date, d.deliverable_id""",
                rs -> { deliverables.add(row(Map.of(
                        "deliverableId", rs.getLong(1), "projectId", rs.getLong(2),
                        "projectName", s(rs.getString(3)), "name", s(rs.getString(4)),
                        "dueDate", s(rs.getString(5)),
                        "overdue", rs.getString(5).compareTo(todayStr) < 0))); },
                todayStr);

        Map<String, Object> section = new LinkedHashMap<>();
        section.put("tasks", tasks);
        section.put("actions", actions);
        section.put("deliverables", deliverables);
        return section;
    }

    // ---- D2: 최근 활동 ------------------------------------------------------

    private Map<String, Object> recentSection() {
        List<Map<String, Object>> docs = new ArrayList<>();
        jdbc.query("""
                SELECT o.doc_id, o.project_id, p.project_name, o.doc_number, o.title,
                       o.category, o.drafter_name, o.draft_date, o.current_status
                  FROM pms_official_doc o JOIN pms_project p ON p.project_id = o.project_id
                 ORDER BY o.draft_date IS NULL, o.draft_date DESC, o.doc_id DESC
                 LIMIT %d""".formatted(RECENT_LIMIT),
                rs -> { docs.add(row(mapOfNullable(
                        "docId", rs.getLong(1), "projectId", rs.getLong(2),
                        "projectName", s(rs.getString(3)), "docNumber", rs.getString(4),
                        "title", s(rs.getString(5)), "category", rs.getString(6),
                        "drafterName", rs.getString(7), "draftDate", rs.getString(8),
                        "currentStatus", rs.getString(9)))); });

        List<Map<String, Object>> meetings = new ArrayList<>();
        jdbc.query("""
                SELECT m.meeting_id, m.project_id, p.project_name, m.title, m.location, m.meet_date
                  FROM pms_meeting_minutes m JOIN pms_project p ON p.project_id = m.project_id
                 ORDER BY m.meet_date DESC, m.meeting_id DESC
                 LIMIT %d""".formatted(RECENT_LIMIT),
                rs -> { meetings.add(row(mapOfNullable(
                        "meetingId", rs.getLong(1), "projectId", rs.getLong(2),
                        "projectName", s(rs.getString(3)), "title", s(rs.getString(4)),
                        "location", rs.getString(5), "meetDate", rs.getString(6)))); });

        List<Map<String, Object>> deliverables = new ArrayList<>();
        jdbc.query("""
                SELECT d.deliverable_id, d.project_id, p.project_name, d.deliverable_name,
                       d.file_name, d.author_name, d.submitted_at, d.status
                  FROM pms_deliverable d JOIN pms_project p ON p.project_id = d.project_id
                 WHERE d.submitted_at IS NOT NULL
                 ORDER BY d.submitted_at DESC, d.deliverable_id DESC
                 LIMIT %d""".formatted(RECENT_LIMIT),
                rs -> { deliverables.add(row(mapOfNullable(
                        "deliverableId", rs.getLong(1), "projectId", rs.getLong(2),
                        "projectName", s(rs.getString(3)), "name", s(rs.getString(4)),
                        "fileName", rs.getString(5), "authorName", rs.getString(6),
                        "submittedAt", rs.getString(7), "status", rs.getString(8)))); });

        Map<String, Object> section = new LinkedHashMap<>();
        section.put("officialDocs", docs);
        section.put("meetings", meetings);
        section.put("deliverables", deliverables);
        return section;
    }

    // ---- D3: 주의가 필요한 프로젝트(건강도 점수) ------------------------------

    private Map<String, Number> healthWeights() {
        try {
            List<Map<String, Object>> rows = jdbc.queryForList(
                    "SELECT params FROM pms_signal_rule WHERE metric = 'HEALTH_SCORE' AND enabled = 1 "
                  + "AND project_id IS NULL ORDER BY rule_id LIMIT 1");
            if (rows.isEmpty()) return DEFAULT_WEIGHTS;
            Object parsed = Json.readObject(String.valueOf(rows.get(0).get("params")));
            if (!(parsed instanceof Map<?, ?> m)) return DEFAULT_WEIGHTS;
            Map<String, Number> merged = new LinkedHashMap<>(DEFAULT_WEIGHTS);
            for (Map.Entry<?, ?> e : m.entrySet()) {
                if (e.getValue() instanceof Number n) merged.put(String.valueOf(e.getKey()), n);
            }
            return merged;
        } catch (RuntimeException e) {
            return DEFAULT_WEIGHTS; // params 파싱 실패 등 — 기본 가중치로 폴백(fail-open)
        }
    }

    private List<Map<String, Object>> attentionSection(String todayStr, List<Map<String, Object>> delaySignals,
                                                       Map<String, Number> w) {

        List<Map<String, Object>> projects = jdbc.queryForList(
                "SELECT project_id, project_name, status, planned_end_date FROM pms_project "
              + "WHERE status <> '완료' ORDER BY project_id");

        // 프로젝트별 오픈 이슈 우선순위 카운트 / 지연 미제출 산출물 카운트 (GROUP BY, N+1 금지)
        Map<Long, int[]> issueCounts = new LinkedHashMap<>(); // [상, 중, 하]
        jdbc.query("""
                SELECT project_id, priority, COUNT(*) FROM pms_issue
                 WHERE status <> '완료' GROUP BY project_id, priority""",
                rs -> {
                    int[] c = issueCounts.computeIfAbsent(rs.getLong(1), k -> new int[3]);
                    switch (String.valueOf(rs.getString(2))) {
                        case "상" -> c[0] += rs.getInt(3);
                        case "중" -> c[1] += rs.getInt(3);
                        default -> c[2] += rs.getInt(3);
                    }
                });
        Map<Long, Integer> overdueDeliv = new LinkedHashMap<>();
        jdbc.query("""
                SELECT project_id, COUNT(*) FROM pms_deliverable
                 WHERE status <> 'APPROVED' AND submitted_at IS NULL
                   AND due_date IS NOT NULL AND due_date < ?
                 GROUP BY project_id""",
                rs -> { overdueDeliv.put(rs.getLong(1), rs.getInt(2)); }, todayStr);
        Map<Long, Integer> delayPctById = new LinkedHashMap<>();
        for (Map<String, Object> sig : delaySignals) {
            Object d = sig.get("delayPct");
            if (d instanceof Number n) delayPctById.put(((Number) sig.get("projectId")).longValue(), n.intValue());
        }

        List<Map<String, Object>> scored = new ArrayList<>();
        for (Map<String, Object> p : projects) {
            long pid = ((Number) p.get("project_id")).longValue();
            int score = 100;
            List<String> factors = new ArrayList<>();

            String status = String.valueOf(p.get("status"));
            Object endDate = p.get("planned_end_date");
            boolean overdueProject = endDate != null && String.valueOf(endDate).compareTo(todayStr) < 0;
            if ("지연".equals(status) || overdueProject) {
                score += w.get("delay").intValue();
                factors.add("지연".equals(status) ? "상태 지연" : "종료 예정일 경과");
            }

            int[] ic = issueCounts.getOrDefault(pid, new int[3]);
            if (ic[0] > 0) { score += w.get("issueHigh").intValue() * ic[0]; factors.add("우선순위 상 이슈 " + ic[0] + "건"); }
            if (ic[1] > 0) { score += w.get("issueMid").intValue() * ic[1]; factors.add("우선순위 중 이슈 " + ic[1] + "건"); }
            if (ic[2] > 0) { score += w.get("issueLow").intValue() * ic[2]; factors.add("우선순위 하 이슈 " + ic[2] + "건"); }

            int od = overdueDeliv.getOrDefault(pid, 0);
            if (od > 0) { score += w.get("overdueDeliverablePer").intValue() * od; factors.add("지연 산출물 " + od + "건"); }

            Integer gap = delayPctById.get(pid);
            if (gap != null && gap > 0) {
                int cap = Math.abs(w.get("progressGapMax").intValue());
                int penalty = -Math.min(gap, cap);
                score += penalty;
                factors.add("진척 갭 " + gap + "%p");
            }

            score = Math.max(0, Math.min(100, score));
            int warn = w.get("warnBelow").intValue();
            int danger = w.get("dangerBelow").intValue();
            String level = score < danger ? "DANGER" : score < warn ? "WARN" : "OK";

            Map<String, Object> m = new LinkedHashMap<>();
            m.put("projectId", pid);
            m.put("projectName", s(String.valueOf(p.get("project_name"))));
            m.put("score", score);
            m.put("level", level);
            m.put("factors", factors);
            scored.add(m);
        }
        scored.sort(Comparator.comparingInt(m -> (int) m.get("score")));
        return scored.subList(0, Math.min(w.get("topLimit").intValue(), scored.size()));
    }

    // ---- D4: 주요 리스크 ----------------------------------------------------

    private List<Map<String, Object>> risksSection(LocalDate today, List<Map<String, Object>> delaySignals,
                                                   Map<String, Number> w) {
        List<Map<String, Object>> out = new ArrayList<>();
        jdbc.query("""
                SELECT i.issue_id, i.project_id, p.project_name, i.title, i.priority, i.reported_date
                  FROM pms_issue i JOIN pms_project p ON p.project_id = i.project_id
                 WHERE i.type = '리스크' AND i.status <> '완료' AND p.status <> '완료'
                 ORDER BY FIELD(i.priority, '상', '중', '하'), i.reported_date, i.issue_id""",
                rs -> {
                    Integer age = null;
                    String reported = rs.getString(6);
                    if (reported != null) {
                        age = (int) java.time.temporal.ChronoUnit.DAYS.between(LocalDate.parse(reported), today);
                    }
                    out.add(row(mapOfNullable(
                            "kind", "OPEN_RISK", "issueId", rs.getLong(1),
                            "projectId", rs.getLong(2), "projectName", s(rs.getString(3)),
                            "title", s(rs.getString(4)), "priority", rs.getString(5), "ageDays", age)));
                });
        // 파생: 진척 갭 큰 프로젝트 → 일정 지연 리스크(등록 전 신호)
        for (Map<String, Object> sig : delaySignals) {
            Object d = sig.get("delayPct");
            if (!(d instanceof Number n) || n.intValue() < w.get("delayRiskPct").intValue()) continue;
            out.add(row(mapOfNullable(
                    "kind", "DELAY",
                    "projectId", ((Number) sig.get("projectId")).longValue(),
                    "projectName", s(String.valueOf(sig.get("projectName"))),
                    "title", "진척 지연: 기대 " + sig.get("expected") + "% 대비 실제 "
                            + sig.get("actual") + "% (" + n.intValue() + "%p)",
                    "delayPct", n.intValue())));
        }
        return out.subList(0, Math.min(w.get("topLimit").intValue(), out.size()));
    }

    // ---- D5: 지금 실행하면 좋은 조치 ------------------------------------------

    private List<Map<String, Object>> recommendationsSection(String todayStr, List<Map<String, Object>> delaySignals,
                                                             Map<String, Number> w) {
        List<Map<String, Object>> out = new ArrayList<>();

        for (Map<String, Object> sig : delaySignals) {
            Object d = sig.get("delayPct");
            if (!(d instanceof Number n) || n.intValue() < w.get("delayRiskPct").intValue()) continue;
            out.add(reco(((Number) sig.get("projectId")).longValue(),
                    s(String.valueOf(sig.get("projectName"))),
                    "진척 점검 회의 소집 — 기대 대비 " + n.intValue() + "%p 지연", "PROJECT", null));
        }

        jdbc.query("""
                SELECT d.project_id, p.project_name, COUNT(*)
                  FROM pms_deliverable d JOIN pms_project p ON p.project_id = d.project_id
                 WHERE p.status <> '완료' AND d.status <> 'APPROVED' AND d.submitted_at IS NULL
                   AND d.due_date IS NOT NULL AND d.due_date < ?
                 GROUP BY d.project_id, p.project_name ORDER BY COUNT(*) DESC""",
                rs -> { out.add(reco(rs.getLong(1), s(rs.getString(2)),
                        "지연 산출물 " + rs.getInt(3) + "건 제출 독려", "PROJECT", null)); },
                todayStr);

        jdbc.query("""
                SELECT a.project_id, p.project_name, COUNT(*)
                  FROM pms_action_item a JOIN pms_project p ON p.project_id = a.project_id
                 WHERE p.status <> '완료' AND a.status <> '완료'
                   AND a.due_date IS NOT NULL AND a.due_date < ?
                 GROUP BY a.project_id, p.project_name ORDER BY COUNT(*) DESC""",
                rs -> { out.add(reco(rs.getLong(1), s(rs.getString(2)),
                        "기한 경과 액션아이템 " + rs.getInt(3) + "건 확인", "PROJECT", null)); },
                todayStr);

        jdbc.query("""
                SELECT i.issue_id, i.project_id, p.project_name, i.title
                  FROM pms_issue i JOIN pms_project p ON p.project_id = i.project_id
                 WHERE i.type = '리스크' AND i.status <> '완료' AND p.status <> '완료'
                   AND NOT EXISTS (SELECT 1 FROM pms_action_item a WHERE a.related_issue_id = i.issue_id)
                 ORDER BY FIELD(i.priority, '상', '중', '하'), i.issue_id""",
                rs -> { out.add(reco(rs.getLong(2), s(rs.getString(3)),
                        "리스크 '" + s(rs.getString(4)) + "' 대응 액션 등록", "ISSUE", rs.getLong(1))); });

        return out.subList(0, Math.min(w.get("topLimit").intValue(), out.size()));
    }

    private Map<String, Object> reco(long projectId, String projectName, String text,
                                     String entityType, Long entityId) {
        return row(mapOfNullable(
                "projectId", projectId, "projectName", projectName, "text", text,
                "entityType", entityType, "entityId", entityId));
    }

    // ---- 헬퍼 ----------------------------------------------------------------

    private static String s(String v) { return v == null ? "" : v; }

    /** Map.of는 null 값 불가 — null 허용 순서보존 맵 생성(키,값 가변 인자). */
    private static Map<String, Object> mapOfNullable(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put(String.valueOf(kv[i]), kv[i + 1]);
        return m;
    }

    private static Map<String, Object> row(Map<String, Object> m) {
        return m instanceof LinkedHashMap<String, Object> lm ? lm : new LinkedHashMap<>(m);
    }
}
