package com.aetherpms.insourcing;

import com.aetherpms.common.Actor;
import com.aetherpms.common.ApiException;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 자사화 전환 프로세스(0019).
 * 비자사 인력(project_contract/turnkey/freelancer) → 자사화(insourced).
 * 요청→(공문 발신)→승인→반영. 공문 발신·승인은 아마란스 결재 위임 영역이며,
 * 연동 전까지 로컬에서 상태 전이/승인 처리한다(승인 시 employment_type 반영).
 */
@Service
public class InsourcingService {

    /** 자사 인력(전환 불필요). regular=정규직, insourced=자사화. */
    private static final Set<String> INSOURCED_TYPES = Set.of("regular", "insourced");
    /** 전환 대상(비자사). */
    private static final Set<String> ELIGIBLE_TYPES =
            Set.of("project_contract", "turnkey", "freelancer");
    /** 진행중(열린) 상태 — 인력당 하나만 허용. */
    private static final Set<String> OPEN_STATUSES = Set.of("REQUESTED", "DOC_SENT");

    private final JdbcTemplate jdbc;

    public InsourcingService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final String SELECT =
            "SELECT t.transition_id, t.person_id, p.name AS person_name, c.company_name, " +
            "       t.from_type, t.to_type, t.status, t.reason, t.official_doc_ref, t.decision_note, " +
            "       t.requested_by, t.requested_at, t.doc_sent_at, t.decided_by, t.decided_at, t.updated_at " +
            "FROM pms_insourcing_transition t " +
            "JOIN pms_person p ON p.person_id = t.person_id " +
            "LEFT JOIN pms_company c ON c.company_id = p.company_id ";

    // 프론트 계약(web/src/types.ts InsourcingTransition)에 맞춰 camelCase로 매핑.
    // datetime은 문자열(yyyy-MM-ddTHH:mm:ss)로 — Jackson Timestamp 직렬화 편차 회피.
    private static Map<String, Object> map(Map<String, Object> r) {
        Map<String, Object> o = new LinkedHashMap<>();
        o.put("transitionId", r.get("transition_id"));
        o.put("personId", r.get("person_id"));
        o.put("personName", r.get("person_name"));
        o.put("companyName", r.get("company_name"));
        o.put("fromType", r.get("from_type"));
        o.put("toType", r.get("to_type"));
        o.put("status", r.get("status"));
        o.put("reason", r.get("reason"));
        o.put("officialDocRef", r.get("official_doc_ref"));
        o.put("decisionNote", r.get("decision_note"));
        o.put("requestedBy", r.get("requested_by"));
        o.put("requestedAt", ts(r.get("requested_at")));
        o.put("docSentAt", ts(r.get("doc_sent_at")));
        o.put("decidedBy", r.get("decided_by"));
        o.put("decidedAt", ts(r.get("decided_at")));
        o.put("updatedAt", ts(r.get("updated_at")));
        return o;
    }

    private static String ts(Object v) {
        return v == null ? null : v.toString().replace(' ', 'T');
    }

    // =====================================================================
    // 조회
    // =====================================================================

    @Transactional(readOnly = true)
    public List<Map<String, Object>> list(String status, Long personId) {
        StringBuilder sql = new StringBuilder(SELECT).append("WHERE 1=1 ");
        java.util.List<Object> args = new java.util.ArrayList<>();
        if (status != null && !status.isBlank()) {
            sql.append("AND t.status = ? ");
            args.add(status.trim());
        }
        if (personId != null) {
            sql.append("AND t.person_id = ? ");
            args.add(personId);
        }
        sql.append("ORDER BY t.requested_at DESC, t.transition_id DESC");
        return jdbc.queryForList(sql.toString(), args.toArray())
                .stream().map(InsourcingService::map).collect(Collectors.toList());
    }

    /** 인력의 진행중(REQUESTED/DOC_SENT) 전환 1건(없으면 null). 상세 패널 버튼 상태 판단용. */
    @Transactional(readOnly = true)
    public Map<String, Object> openForPerson(long personId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                SELECT + "WHERE t.person_id = ? AND t.status IN ('REQUESTED','DOC_SENT') " +
                        "ORDER BY t.requested_at DESC LIMIT 1",
                personId);
        return rows.isEmpty() ? null : map(rows.get(0));
    }

    private Map<String, Object> byId(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList(SELECT + "WHERE t.transition_id = ?", id);
        if (rows.isEmpty()) throw ApiException.notFound("전환 요청을 찾을 수 없습니다.");
        return map(rows.get(0));
    }

    // =====================================================================
    // 전환 요청 (인력관리 '자사화 전환' 버튼)
    // =====================================================================

    @Transactional
    public Map<String, Object> request(long personId, String reason, Actor actor) {
        if (personId <= 0) throw ApiException.badRequest("유효하지 않은 personId입니다.");
        List<Map<String, Object>> pr = jdbc.queryForList(
                "SELECT employment_type FROM pms_person WHERE person_id = ?", personId);
        if (pr.isEmpty()) throw ApiException.notFound("인력을 찾을 수 없습니다.");
        String empType = String.valueOf(pr.get(0).get("employment_type"));
        if (INSOURCED_TYPES.contains(empType)) {
            throw ApiException.unprocessable("이미 자사 인력(정규직/자사화)이라 전환 대상이 아닙니다.");
        }
        if (!ELIGIBLE_TYPES.contains(empType)) {
            throw ApiException.unprocessable("전환 가능한 인력구분이 아닙니다: " + empType);
        }
        if (openForPerson(personId) != null) {
            throw ApiException.conflict("이미 진행중인 자사화 전환 요청이 있습니다.");
        }

        KeyHolder kh = new GeneratedKeyHolder();
        final String r = reason == null || reason.isBlank() ? null : reason.trim();
        final String by = actor == null ? null : actor.userId();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    "INSERT INTO pms_insourcing_transition " +
                    "(person_id, from_type, to_type, status, reason, requested_by) " +
                    "VALUES (?, ?, 'insourced', 'REQUESTED', ?, ?)",
                    Statement.RETURN_GENERATED_KEYS);
            ps.setLong(1, personId);
            ps.setString(2, empType);
            ps.setString(3, r);
            ps.setString(4, by);
            return ps;
        }, kh);
        Number key = kh.getKey();
        if (key == null) throw ApiException.badRequest("전환 요청 생성에 실패했습니다.");
        return byId(key.longValue());
    }

    // =====================================================================
    // 상태 전이 (공문 발신 표시 / 승인 / 반려 / 취소)
    // =====================================================================

    @Transactional
    public Map<String, Object> act(long id, String action, String note, Actor actor) {
        if (id <= 0) throw ApiException.badRequest("유효하지 않은 transitionId입니다.");
        if (action == null || action.isBlank()) throw ApiException.badRequest("action이 필요합니다.");
        Map<String, Object> cur = byId(id);
        String status = String.valueOf(cur.get("status"));
        long personId = ((Number) cur.get("personId")).longValue();
        String by = actor == null ? null : actor.userId();
        String n = note == null || note.isBlank() ? null : note.trim();

        switch (action) {
            case "doc_sent" -> {
                if (!"REQUESTED".equals(status)) {
                    throw ApiException.unprocessable("공문 발신 표시는 요청 상태에서만 가능합니다.");
                }
                jdbc.update("UPDATE pms_insourcing_transition " +
                        "SET status='DOC_SENT', doc_sent_at=CURRENT_TIMESTAMP(6), " +
                        "    official_doc_ref=COALESCE(?, official_doc_ref) WHERE transition_id=?",
                        n, id);
            }
            case "approve" -> {
                if (!OPEN_STATUSES.contains(status)) {
                    throw ApiException.unprocessable("진행중(요청/공문발신) 전환만 승인할 수 있습니다.");
                }
                // 아마란스 결재 승인 콜백이 붙을 자리 — 현재는 로컬 수동 승인.
                // 승인 = 자사화 반영: employment_type을 insourced로 변경.
                jdbc.update("UPDATE pms_person SET employment_type='insourced' WHERE person_id=?",
                        personId);
                jdbc.update("UPDATE pms_insourcing_transition " +
                        "SET status='APPROVED', decided_by=?, decided_at=CURRENT_TIMESTAMP(6), " +
                        "    decision_note=? WHERE transition_id=?",
                        by, n, id);
            }
            case "reject" -> {
                if (!OPEN_STATUSES.contains(status)) {
                    throw ApiException.unprocessable("진행중 전환만 반려할 수 있습니다.");
                }
                jdbc.update("UPDATE pms_insourcing_transition " +
                        "SET status='REJECTED', decided_by=?, decided_at=CURRENT_TIMESTAMP(6), " +
                        "    decision_note=? WHERE transition_id=?",
                        by, n, id);
            }
            case "cancel" -> {
                if (!OPEN_STATUSES.contains(status)) {
                    throw ApiException.unprocessable("진행중 전환만 취소할 수 있습니다.");
                }
                jdbc.update("UPDATE pms_insourcing_transition " +
                        "SET status='CANCELED', decided_by=?, decided_at=CURRENT_TIMESTAMP(6), " +
                        "    decision_note=? WHERE transition_id=?",
                        by, n, id);
            }
            default -> throw ApiException.badRequest("알 수 없는 action입니다: " + action);
        }
        return byId(id);
    }
}
