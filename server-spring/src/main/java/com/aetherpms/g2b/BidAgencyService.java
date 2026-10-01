package com.aetherpms.g2b;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.HashSet;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 기관 마스터 조회 (설계 0016 §A).
 * bid_target_agencies 및 표준 5개 관심기관을 보장하여 응답한다.
 */
@Service
public class BidAgencyService {

    private final JdbcTemplate jdbc;

    public BidAgencyService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> list() {
        List<Map<String, Object>> out = new ArrayList<>();
        Set<String> seen = new HashSet<>();

        try {
            List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT id, agency_name, sort_order, is_default " +
                "FROM bid_target_agencies " +
                "ORDER BY sort_order ASC, id ASC");
            for (Map<String, Object> r : rows) {
                String name = (String) r.get("agency_name");
                if (name == null || name.isBlank()) continue;
                String normalized = name.trim();
                seen.add(normalized);
                Map<String, Object> dto = new LinkedHashMap<>();
                dto.put("id", toLong(r.get("id")));
                dto.put("agencyName", normalized);
                dto.put("sortOrder", toInt(r.get("sort_order")));
                // 기본 5대 기관은 isDefault true
                boolean isDef = truthy(r.get("is_default")) || BidTargetAgency.DEFAULT_AGENCIES.contains(normalized);
                dto.put("isDefault", isDef);
                out.add(dto);
            }
        } catch (Exception e) {
            // DB 미생성/조회 실패 시 기본 목록 폴백
        }

        // 표준 5개 관심기관 중 누락된 항목 보충
        long nextId = 1000L;
        int nextOrder = out.size() + 1;
        for (String def : BidTargetAgency.DEFAULT_AGENCIES) {
            boolean alreadyPresent = false;
            for (String s : seen) {
                if (s.contains(def) || def.contains(s)) {
                    alreadyPresent = true;
                    break;
                }
            }
            if (!alreadyPresent) {
                Map<String, Object> dto = new LinkedHashMap<>();
                dto.put("id", nextId++);
                dto.put("agencyName", def);
                dto.put("sortOrder", nextOrder++);
                dto.put("isDefault", true);
                out.add(dto);
            }
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
            try {
                List<Map<String, Object>> rows = jdbc.queryForList(
                    "SELECT agency_name FROM bid_target_agencies WHERE id = ?", Long.parseLong(v));
                if (!rows.isEmpty()) return (String) rows.get(0).get("agency_name");
            } catch (Exception e) {
                // DB 조회 실패 시 그대로 문자열 사용
            }
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
