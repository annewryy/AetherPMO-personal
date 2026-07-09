package com.aetherpms.g2b;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 기관 마스터 조회 (설계 0016 §A). batch2/batch3 패턴대로 JdbcTemplate + Map.
 * bid_target_agencies(V8) 위에서 동작. 응답은 camelCase 도메인 DTO(0003 계약).
 */
@Service
public class BidAgencyService {

    private final JdbcTemplate jdbc;

    public BidAgencyService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> list() {
        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT id, agency_name, sort_order, is_default " +
            "FROM bid_target_agencies " +
            "ORDER BY sort_order ASC, id ASC");
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (Map<String, Object> r : rows) {
            Map<String, Object> dto = new LinkedHashMap<>();
            dto.put("id", toLong(r.get("id")));
            dto.put("agencyName", r.get("agency_name"));
            dto.put("sortOrder", toInt(r.get("sort_order")));
            dto.put("isDefault", truthy(r.get("is_default")));
            out.add(dto);
        }
        return out;
    }

    /** agencyId(숫자)면 기관명 해석, 아니면 그대로 기관명으로 취급. 해석 실패 시 null. */
    @Transactional(readOnly = true)
    public String resolveAgencyName(String agencyParam) {
        if (agencyParam == null || agencyParam.trim().isEmpty()) return null;
        String v = agencyParam.trim();
        // 순수 숫자면 id로 해석 시도.
        if (v.matches("\\d+")) {
            List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT agency_name FROM bid_target_agencies WHERE id = ?", Long.parseLong(v));
            if (!rows.isEmpty()) return (String) rows.get(0).get("agency_name");
            // 숫자지만 매칭 id 없음 → 그대로 기관명 문자열로 사용(안전 폴백).
        }
        return v;
    }

    private static Long toLong(Object o) { return o == null ? null : ((Number) o).longValue(); }
    private static Integer toInt(Object o) { return o == null ? null : ((Number) o).intValue(); }
    private static boolean truthy(Object o) {
        if (o == null) return false;
        if (o instanceof Number n) return n.intValue() != 0;
        if (o instanceof Boolean b) return b;
        return "1".equals(o.toString()) || "true".equalsIgnoreCase(o.toString());
    }
}
