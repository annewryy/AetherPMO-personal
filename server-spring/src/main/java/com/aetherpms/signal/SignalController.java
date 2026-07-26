package com.aetherpms.signal;

import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import com.aetherpms.common.CurrentActor;
import com.aetherpms.engine.SignalEngine;

import jakarta.servlet.http.HttpServletRequest;

/**
 * 0007 신호 API + 0008 자동 등록/전환 — Node routes/signals.ts 이식.
 *   GET  /api/dashboard/signals — 계산 결과만(읽기 중 쓰기 금지)
 *   POST /api/signals/evaluate  — 규칙 평가 + 자동 리스크 등록/해소 + 전환(트랜잭션, 멱등)
 */
@RestController
public class SignalController {

    private final SignalEngine engine;
    private final DashboardWidgetService widgetService;
    private final com.aetherpms.notification.NotificationService notificationService;

    public SignalController(SignalEngine engine, DashboardWidgetService widgetService,
            com.aetherpms.notification.NotificationService notificationService) {
        this.engine = engine;
        this.widgetService = widgetService;
        this.notificationService = notificationService;
    }

    @GetMapping("/api/dashboard/signals")
    public Map<String, Object> dashboardSignals() {
        return engine.dashboardSignals();
    }

    // 0026 §A — 대시보드 위젯(오늘 해야할 일·최근 활동·규칙 기반 3위젯). 읽기 전용.
    @GetMapping("/api/dashboard/widgets")
    public Map<String, Object> dashboardWidgets() {
        return widgetService.widgets();
    }

    @PostMapping("/api/signals/evaluate")
    public Map<String, Object> evaluate(HttpServletRequest req) {
        Map<String, Object> result = new java.util.LinkedHashMap<>(engine.evaluate(CurrentActor.resolve(req)));
        // 0033 ⑦ — 일 1회 실행에 편승: 마감 임박·경과 알림 + 읽음 90일 보존 정리
        result.put("notificationSweep", notificationService.dailySweep());
        return result;
    }
}
