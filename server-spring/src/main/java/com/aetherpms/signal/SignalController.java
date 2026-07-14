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

    public SignalController(SignalEngine engine) {
        this.engine = engine;
    }

    @GetMapping("/api/dashboard/signals")
    public Map<String, Object> dashboardSignals() {
        return engine.dashboardSignals();
    }

    @PostMapping("/api/signals/evaluate")
    public Map<String, Object> evaluate(HttpServletRequest req) {
        return engine.evaluate(CurrentActor.resolve(req));
    }
}
