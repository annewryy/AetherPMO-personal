package com.aetherpms.deliverable;

import com.aetherpms.auth.ProjectScopeService;
import com.aetherpms.auth.AuthContext;
import com.aetherpms.common.ApiException;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 산출물 필드 수정(0022) — PATCH /api/deliverables/{id}.
 * 산출물 상태는 워크플로 엔진 전이로만 바꾸므로, 여기선 담당자(author_name)·마감일만 허용.
 * 담당자는 조직도에서 선택한 '이름'을 author_name에 저장(계정 uuid 없음).
 */
@RestController
public class DeliverableWriteController {

    private final JdbcTemplate jdbc;
    private final ProjectScopeService scope;

    private final com.aetherpms.notification.NotificationService notify;

    public DeliverableWriteController(JdbcTemplate jdbc, ProjectScopeService scope,
            com.aetherpms.notification.NotificationService notify) {
        this.jdbc = jdbc;
        this.scope = scope;
        this.notify = notify;
    }

    @PatchMapping("/api/deliverables/{id}")
    @Transactional
    public Map<String, Object> patch(@PathVariable("id") long id,
            @RequestBody(required = false) Map<String, Object> body,
            jakarta.servlet.http.HttpServletRequest req) {
        if (id <= 0) throw ApiException.badRequest("유효하지 않은 id입니다.");
        scope.assertItemWrite(AuthContext.of(req), "deliverables", id);  // 0032 §5②
        Map<String, Object> b = body == null ? Map.of() : body;
        List<String> allowed = List.of("authorName", "dueDate");
        List<String> unknown = b.keySet().stream().filter(k -> !allowed.contains(k)).toList();
        if (!unknown.isEmpty()) {
            throw ApiException.badRequest("허용되지 않는 필드: " + String.join(", ", unknown)
                    + " (허용: " + String.join(", ", allowed) + ")");
        }

        Map<String, Object> set = new LinkedHashMap<>();
        if (b.containsKey("authorName")) {
            Object v = b.get("authorName");
            set.put("author_name", v == null ? null : String.valueOf(v));
        }
        if (b.containsKey("dueDate")) {
            Object v = b.get("dueDate");
            String s = v == null ? null : String.valueOf(v);
            set.put("due_date", s == null || s.isEmpty() ? null : LocalDate.parse(s));
        }
        if (set.isEmpty()) throw ApiException.badRequest("수정할 필드가 없습니다. 허용: authorName, dueDate");

        List<String> cols = List.copyOf(set.keySet());
        String assign = String.join(", ", cols.stream().map(c -> c + " = ?").toList());
        Object[] vals = new Object[cols.size() + 1];
        for (int i = 0; i < cols.size(); i++) vals[i] = set.get(cols.get(i));
        vals[cols.size()] = id;
        List<Map<String, Object>> beforeRows = jdbc.queryForList(
                "SELECT project_id, author_name, deliverable_name FROM pms_deliverable WHERE deliverable_id = ?", id);
        int n = jdbc.update("UPDATE pms_deliverable SET " + assign + " WHERE deliverable_id = ?", vals);
        if (n == 0) throw ApiException.notFound("산출물을 찾을 수 없습니다.");
        // 0033 ① — 담당자(author) 변경 알림
        if (set.containsKey("author_name") && set.get("author_name") != null && !beforeRows.isEmpty()
                && !String.valueOf(set.get("author_name")).equals(String.valueOf(beforeRows.get(0).get("author_name")))) {
            notify.notifyByName(((Number) beforeRows.get(0).get("project_id")).longValue(),
                    String.valueOf(set.get("author_name")), "ASSIGNED", "DELIVERABLE", id,
                    "담당자로 지정되었습니다: " + beforeRows.get(0).get("deliverable_name"));
        }

        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT deliverable_id, deliverable_name, author_name, due_date, status " +
                "FROM pms_deliverable WHERE deliverable_id = ?", id);
        Map<String, Object> r = rows.get(0);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", r.get("deliverable_id"));
        out.put("name", r.get("deliverable_name"));
        out.put("author", r.get("author_name"));
        out.put("assignee", r.get("author_name"));
        out.put("status", r.get("status"));
        return out;
    }
}
