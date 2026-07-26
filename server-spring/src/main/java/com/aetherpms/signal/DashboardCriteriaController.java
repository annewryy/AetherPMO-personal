package com.aetherpms.signal;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.aetherpms.common.ApiException;
import com.aetherpms.common.Json;

/**
 * 0036 — 대시보드 위젯 기준 관리(SYS_ADMIN, RbacInterceptor /api/admin/*):
 * 주의 필요 프로젝트(건강도 감점·등급 임계), 주요 리스크·실행 조치(파생 진척 갭 하한),
 * 위젯 표시 건수를 관리자 콘솔에서 편집한다.
 * 저장소 = 0007 §2 문서화 위치인 pms_signal_rule 전역 metric='HEALTH_SCORE' 행의 params(JSON)
 * 단일 행 upsert. 행이 없으면 DashboardWidgetService.DEFAULT_WEIGHTS(fail-open).
 */
@RestController
public class DashboardCriteriaController {

    /** 편집 허용 키와 값 범위 [min, max] — 감점류는 음수만. */
    private static final Map<String, int[]> KEY_RANGES = new LinkedHashMap<>() {{
        put("delay", new int[]{-100, 0});
        put("issueHigh", new int[]{-100, 0});
        put("issueMid", new int[]{-100, 0});
        put("issueLow", new int[]{-100, 0});
        put("overdueDeliverablePer", new int[]{-100, 0});
        put("progressGapMax", new int[]{-100, 0});
        put("warnBelow", new int[]{1, 100});
        put("dangerBelow", new int[]{0, 100});
        put("delayRiskPct", new int[]{1, 100});
        put("topLimit", new int[]{1, 20});
    }};

    private final JdbcTemplate jdbc;

    public DashboardCriteriaController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/api/admin/dashboard-criteria")
    public Map<String, Object> get() {
        Map<String, Number> effective = new LinkedHashMap<>(DashboardWidgetService.DEFAULT_WEIGHTS);
        boolean custom = false;
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT params FROM pms_signal_rule WHERE metric = 'HEALTH_SCORE' AND enabled = 1 "
              + "AND project_id IS NULL ORDER BY rule_id LIMIT 1");
        if (!rows.isEmpty()) {
            Object parsed = Json.readObject(String.valueOf(rows.get(0).get("params")));
            if (parsed instanceof Map<?, ?> m) {
                custom = true;
                for (Map.Entry<?, ?> e : m.entrySet()) {
                    if (e.getValue() instanceof Number n) effective.put(String.valueOf(e.getKey()), n);
                }
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("criteria", effective);
        out.put("custom", custom);
        out.put("defaults", DashboardWidgetService.DEFAULT_WEIGHTS);
        return out;
    }

    @PutMapping("/api/admin/dashboard-criteria")
    public Map<String, Object> put(@RequestBody(required = false) Map<String, Object> body) {
        if (body == null || body.isEmpty()) throw ApiException.badRequest("변경할 기준이 없습니다.");
        Map<String, Object> params = new LinkedHashMap<>();
        for (Map.Entry<String, int[]> e : KEY_RANGES.entrySet()) {
            Object v = body.get(e.getKey());
            if (v == null) continue;
            int n;
            try {
                n = (int) Double.parseDouble(String.valueOf(v));
            } catch (NumberFormatException ex) {
                throw ApiException.badRequest(e.getKey() + " 값이 숫자가 아닙니다: " + v);
            }
            if (n < e.getValue()[0] || n > e.getValue()[1]) {
                throw ApiException.badRequest(e.getKey() + "은(는) " + e.getValue()[0] + "~" + e.getValue()[1]
                        + " 범위여야 합니다: " + n);
            }
            params.put(e.getKey(), n);
        }
        List<String> unknown = body.keySet().stream().filter(k -> !KEY_RANGES.containsKey(k)).toList();
        if (!unknown.isEmpty()) {
            throw ApiException.badRequest("허용되지 않는 키: " + String.join(", ", unknown)
                    + " (허용: " + String.join(", ", KEY_RANGES.keySet()) + ")");
        }
        if (params.isEmpty()) throw ApiException.badRequest("변경할 기준이 없습니다.");
        Number warn = (Number) params.getOrDefault("warnBelow", DashboardWidgetService.DEFAULT_WEIGHTS.get("warnBelow"));
        Number danger = (Number) params.getOrDefault("dangerBelow", DashboardWidgetService.DEFAULT_WEIGHTS.get("dangerBelow"));
        if (danger.intValue() > warn.intValue()) {
            throw ApiException.badRequest("위험 임계(dangerBelow)는 주의 임계(warnBelow) 이하여야 합니다.");
        }

        String json = Json.write(params);
        int updated = jdbc.update(
                "UPDATE pms_signal_rule SET params = ?, enabled = 1, updated_at = NOW() "
              + "WHERE metric = 'HEALTH_SCORE' AND project_id IS NULL", json);
        if (updated == 0) {
            jdbc.update("""
                    INSERT INTO pms_signal_rule (project_id, name, metric, operator, threshold, params, action, enabled)
                    VALUES (NULL, '대시보드 위젯 기준(건강도·파생 신호)', 'HEALTH_SCORE', 'GT', NULL, ?, 'SHOW', 1)""",
                    json);
        }
        return get();
    }
}
