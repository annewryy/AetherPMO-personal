package com.aetherpms.signal;

import com.aetherpms.common.RowMappers;

import com.aetherpms.common.WriteSupport;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.aetherpms.common.Actor;
import com.aetherpms.common.ApiException;
import com.aetherpms.common.AuditWriter;
import com.aetherpms.engine.SignalConstants;

/**
 * 0007 §2.5 신호 규칙 관리 — Node routes/signal-rules.ts 이식.
 * GET/POST/PATCH/DELETE /api/signal-rules. 규칙은 사용자 등록형(전역 project_id=null).
 */
@Service
public class SignalRuleService {

    private final JdbcTemplate jdbc;
    private final AuditWriter audit;

    public SignalRuleService(JdbcTemplate jdbc, AuditWriter audit) {
        this.jdbc = jdbc;
        this.audit = audit;
    }

    private static final Set<String> RULE_FIELDS = Set.of(
            "project_id", "name", "metric", "operator", "threshold", "params", "action", "enabled");
    private static final Map<String, String> RULE_ALIASES = Map.of("projectId", "project_id");

    public List<Map<String, Object>> list(String projectIdParam) {
        if (projectIdParam != null && !projectIdParam.isEmpty()) {
            Integer pid = WriteSupport.intOrNull(projectIdParam);
            if (pid == null || pid <= 0) throw ApiException.badRequest("project_id 필터는 양의 정수여야 합니다.");
            return jdbc.queryForList("SELECT * FROM pms_signal_rule WHERE project_id = ? ORDER BY rule_id", pid)
                    .stream().map(RowMappers::mapSignalRule).toList();
        }
        return jdbc.queryForList("SELECT * FROM pms_signal_rule ORDER BY rule_id")
                .stream().map(RowMappers::mapSignalRule).toList();
    }

    @Transactional
    public Map<String, Object> create(Map<String, Object> body, Actor actor) {
        Map<String, Object> normalized = validate(body, true);
        if (normalized.get("project_id") != null) assertProjectExists(toLong(normalized.get("project_id")));
        Map<String, Object> rule = WriteSupport.insertReturning(jdbc, "pms_signal_rule", "rule_id", toDb(normalized));
        audit.write("SIGNAL_RULE", toLong(rule.get("rule_id")), toLong(rule.get("project_id")), "INSERT",
                null, null, rule, actor, "신호 규칙 생성 (룰 빌더)");
        return RowMappers.mapSignalRule(rule);
    }

    @Transactional
    public Map<String, Object> update(long id, Map<String, Object> body, Actor actor) {
        WriteSupport.parseId(id);
        Map<String, Object> normalized = validate(body, false);
        if (normalized.isEmpty()) throw ApiException.badRequest("수정할 필드가 없습니다.");

        Map<String, Object> before = WriteSupport.findOne(jdbc, "pms_signal_rule", "rule_id", id);
        if (before == null) throw ApiException.notFound("신호 규칙을 찾을 수 없습니다.");
        if (normalized.get("project_id") != null) assertProjectExists(toLong(normalized.get("project_id")));

        List<String> cols = List.copyOf(normalized.keySet());
        Map<String, Object> after = WriteSupport.updateReturning(jdbc, "pms_signal_rule", "rule_id", id, toDb(normalized), false);
        audit.write("SIGNAL_RULE", id, toLong(after.get("project_id")), "UPDATE", cols,
                WriteSupport.pick(before, cols), WriteSupport.pick(after, cols), actor, "신호 규칙 수정 (룰 빌더)");
        return RowMappers.mapSignalRule(after);
    }

    @Transactional
    public Map<String, Object> delete(long id, Actor actor) {
        WriteSupport.parseId(id);
        Map<String, Object> deleted = WriteSupport.findOne(jdbc, "pms_signal_rule", "rule_id", id);
        if (deleted == null) throw ApiException.notFound("신호 규칙을 찾을 수 없습니다.");
        jdbc.update("DELETE FROM pms_signal_rule WHERE rule_id = ?", id);
        audit.write("SIGNAL_RULE", id, toLong(deleted.get("project_id")), "DELETE", null, deleted, null,
                actor, "신호 규칙 삭제 (룰 빌더)");
        return Map.of("deleted", true, "id", id);
    }

    private Map<String, Object> validate(Map<String, Object> raw, boolean requireAll) {
        Map<String, Object> body = WriteSupport.applyAliases(raw, RULE_ALIASES);
        if (body.isEmpty()) {
            throw ApiException.badRequest("수정할 필드가 없습니다. 허용 필드: " + String.join(", ", RULE_FIELDS));
        }
        List<String> rejected = body.keySet().stream().filter(k -> !RULE_FIELDS.contains(k)).toList();
        if (!rejected.isEmpty()) throw ApiException.badRequest("허용되지 않는 필드: " + String.join(", ", rejected));

        Map<String, Object> out = new LinkedHashMap<>();
        if (body.containsKey("name")) {
            if (!(body.get("name") instanceof String s) || s.trim().isEmpty()) {
                throw ApiException.badRequest("name은 비어있지 않은 문자열이어야 합니다.");
            }
            out.put("name", body.get("name").toString().trim());
        } else if (requireAll) {
            throw ApiException.badRequest("name은 필수입니다.");
        }
        if (body.containsKey("metric")) {
            if (!SignalConstants.KNOWN_METRICS.contains(str(body.get("metric")))) {
                throw ApiException.badRequest("유효하지 않은 metric: " + body.get("metric")
                        + " (허용: " + String.join(", ", SignalConstants.KNOWN_METRICS) + ")");
            }
            out.put("metric", body.get("metric"));
        } else if (requireAll) {
            throw ApiException.badRequest("metric은 필수입니다. (허용: " + String.join(", ", SignalConstants.KNOWN_METRICS) + ")");
        }
        if (body.containsKey("operator")) {
            if (!SignalConstants.KNOWN_OPERATORS.contains(str(body.get("operator")))) {
                throw ApiException.badRequest("유효하지 않은 operator: " + body.get("operator")
                        + " (허용: " + String.join(", ", SignalConstants.KNOWN_OPERATORS) + ")");
            }
            out.put("operator", body.get("operator"));
        }
        if (body.containsKey("action")) {
            if (!SignalConstants.KNOWN_ACTIONS.contains(str(body.get("action")))) {
                throw ApiException.badRequest("유효하지 않은 action: " + body.get("action")
                        + " (허용: " + String.join(", ", SignalConstants.KNOWN_ACTIONS) + ")");
            }
            out.put("action", body.get("action"));
        }
        if (body.containsKey("threshold")) {
            if (body.get("threshold") == null) {
                out.put("threshold", null);
            } else {
                Double t = toDouble(body.get("threshold"));
                if (t == null || t.isNaN() || t.isInfinite()) {
                    throw ApiException.badRequest("threshold는 숫자 또는 null이어야 합니다.");
                }
                out.put("threshold", t);
            }
        }
        if (body.containsKey("params")) {
            if (!(body.get("params") instanceof Map)) throw ApiException.badRequest("params는 JSON 객체여야 합니다.");
            out.put("params", body.get("params"));
        }
        if (body.containsKey("enabled")) {
            if (!(body.get("enabled") instanceof Boolean bv)) throw ApiException.badRequest("enabled는 boolean이어야 합니다.");
            out.put("enabled", bv);
        }
        if (body.containsKey("project_id")) {
            if (body.get("project_id") == null) {
                out.put("project_id", null);
            } else {
                Integer pid = WriteSupport.intOrNull(body.get("project_id"));
                if (pid == null || pid <= 0) {
                    throw ApiException.badRequest("project_id는 양의 정수 또는 null(전역)이어야 합니다.");
                }
                out.put("project_id", pid);
            }
        }
        return out;
    }

    /** params(Map) → JSON 문자열 직렬화. */
    private Map<String, Object> toDb(Map<String, Object> normalized) {
        Map<String, Object> out = new LinkedHashMap<>(normalized);
        if (out.containsKey("params")) {
            Object p = out.get("params");
            out.put("params", p == null ? null : com.aetherpms.common.Json.write(p));
        }
        return out;
    }

    private void assertProjectExists(long projectId) {
        Integer c = jdbc.queryForObject("SELECT COUNT(*) FROM pms_project WHERE project_id = ?",
                Integer.class, projectId);
        if (c == null || c == 0) throw ApiException.badRequest("존재하지 않는 project_id: " + projectId);
    }

    private static Long toLong(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return n.longValue();
        return Long.parseLong(o.toString());
    }

    private static Double toDouble(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return n.doubleValue();
        try { return Double.parseDouble(o.toString()); } catch (NumberFormatException e) { return null; }
    }

    private static String str(Object o) { return o == null ? null : o.toString(); }
}
