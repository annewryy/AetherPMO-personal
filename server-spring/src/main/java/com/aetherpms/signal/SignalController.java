package com.aetherpms.signal;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import com.aetherpms.auth.AuthContext;
import com.aetherpms.auth.ProjectScopeService;
import com.aetherpms.common.CurrentActor;
import com.aetherpms.engine.SignalEngine;

import jakarta.servlet.http.HttpServletRequest;

/**
 * 0007 신호 API + 0008 자동 등록/전환 — Node routes/signals.ts 이식.
 *   GET  /api/dashboard/signals — 계산 결과만(읽기 중 쓰기 금지)
 *   POST /api/signals/evaluate  — 규칙 평가 + 자동 리스크 등록/해소 + 전환(트랜잭션, 멱등)
 * 0034 §0단계 — 참여 스코프 대상(PM/WORKER 등)은 두 GET 응답 모두 참여 프로젝트 항목만 노출.
 */
@RestController
public class SignalController {

    private final SignalEngine engine;
    private final DashboardWidgetService widgetService;
    private final com.aetherpms.notification.NotificationService notificationService;
    private final ProjectScopeService scope;

    public SignalController(SignalEngine engine, DashboardWidgetService widgetService,
            com.aetherpms.notification.NotificationService notificationService, ProjectScopeService scope) {
        this.engine = engine;
        this.widgetService = widgetService;
        this.notificationService = notificationService;
        this.scope = scope;
    }

    @GetMapping("/api/dashboard/signals")
    public Map<String, Object> dashboardSignals(HttpServletRequest req) {
        Map<String, Object> result = engine.dashboardSignals();
        AuthContext ctx = AuthContext.of(req);
        if (!scope.isScoped(ctx)) return result;
        Map<String, Object> out = new LinkedHashMap<>(result);
        out.put("signals", scope.visibleOnly(ctx, asRows(result.get("signals"))));
        out.put("today", scope.visibleOnly(ctx, asRows(result.get("today"))));
        return out;
    }

    // 0026 §A — 대시보드 위젯(오늘 해야할 일·최근 활동·규칙 기반 3위젯). 읽기 전용.
    @GetMapping("/api/dashboard/widgets")
    public Map<String, Object> dashboardWidgets(HttpServletRequest req) {
        Map<String, Object> result = widgetService.widgets();
        AuthContext ctx = AuthContext.of(req);
        if (!scope.isScoped(ctx)) return result;

        Map<String, Object> out = new LinkedHashMap<>(result);
        out.put("today", filterSection(ctx, result.get("today"), "tasks", "actions", "deliverables"));
        out.put("recent", filterSection(ctx, result.get("recent"), "officialDocs", "meetings", "deliverables"));
        out.put("attention", scope.visibleOnly(ctx, asRows(result.get("attention"))));
        out.put("risks", scope.visibleOnly(ctx, asRows(result.get("risks"))));
        out.put("recommendations", scope.visibleOnly(ctx, asRows(result.get("recommendations"))));
        return out;
    }

    @PostMapping("/api/signals/evaluate")
    public Map<String, Object> evaluate(HttpServletRequest req) {
        Map<String, Object> result = new java.util.LinkedHashMap<>(engine.evaluate(CurrentActor.resolve(req)));
        // 0033 ⑦ — 일 1회 실행에 편승: 마감 임박·경과 알림 + 읽음 90일 보존 정리
        result.put("notificationSweep", notificationService.dailySweep());
        return result;
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> asRows(Object v) {
        return v instanceof List<?> l ? (List<Map<String, Object>>) l : List.of();
    }

    /** section = {tasks/officialDocs 등: List<Map>} 형태 — 각 키의 리스트를 스코프 필터링. */
    @SuppressWarnings("unchecked")
    private Map<String, Object> filterSection(AuthContext ctx, Object section, String... keys) {
        if (!(section instanceof Map<?, ?> m)) return (Map<String, Object>) section;
        Map<String, Object> out = new LinkedHashMap<>((Map<String, Object>) m);
        for (String k : keys) out.put(k, scope.visibleOnly(ctx, asRows(out.get(k))));
        return out;
    }
}
