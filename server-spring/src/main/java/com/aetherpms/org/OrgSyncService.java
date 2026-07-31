package com.aetherpms.org;

import com.aetherpms.common.ApiException;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 아마란스 조직/회원 동기화(0020).
 * 아마란스 CXM 플랫폼이 제공한 read-only view DB(JDBC)에서 부서/회원/겸직을 읽어
 * 우리 미러 테이블(pms_org_*)에 스냅샷으로 치환(replace-all)한다.
 * API가 준비되면 이 서비스의 소스만 교체(테이블/조회 계약 유지).
 *
 * 배치: 주기 스케줄은 아직 미설정 — 관리자 수동 트리거(POST /api/admin/org-sync)로 실행.
 *       스케줄이 필요해지면 @Scheduled 메서드에서 sync() 호출만 추가하면 된다.
 */
@Service
public class OrgSyncService {

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(OrgSyncService.class);

    private final JdbcTemplate jdbc; // 우리 DB(메인 datasource)
    private final OrgTreeService orgTree; // 0042 — 동기화 후 부서 트리 스냅샷 무효화

    @Value("${amaranth.view.url:}")
    private String viewUrl;
    @Value("${amaranth.view.username:}")
    private String viewUser;
    @Value("${amaranth.view.password:}")
    private String viewPassword;

    public OrgSyncService(JdbcTemplate jdbc, OrgTreeService orgTree) {
        this.jdbc = jdbc;
        this.orgTree = orgTree;
    }

    /** 동기화 실행. 소스 view DB에서 읽어 미러 테이블 치환. 카운트 반환. */
    @Transactional
    public Map<String, Object> sync() {
        if (viewUrl == null || viewUrl.isBlank()) {
            throw ApiException.unprocessable(
                    "아마란스 view DB가 설정되지 않았습니다(AMARANTH_VIEW_URL). 동기화 소스를 먼저 설정하세요.");
        }

        List<Object[]> depts = new ArrayList<>();
        List<Object[]> members = new ArrayList<>();
        List<Object[]> memberDepts = new ArrayList<>();

        try (Connection con = DriverManager.getConnection(viewUrl, viewUser, viewPassword);
             Statement st = con.createStatement()) {

            // 부서: UPPER_DEPT_CODE 빈문자열 → NULL(루트).
            try (ResultSet rs = st.executeQuery(
                    "SELECT DEPT_CODE, UPPER_DEPT_CODE, DEPT_NM FROM v_sdb_dept_info")) {
                while (rs.next()) {
                    depts.add(new Object[]{
                            rs.getString("DEPT_CODE"),
                            blankToNull(rs.getString("UPPER_DEPT_CODE")),
                            rs.getString("DEPT_NM")});
                }
            }
            // 회원: MBER_STTUS P=재직/D=퇴직(원천 코드 보존).
            try (ResultSet rs = st.executeQuery(
                    "SELECT MBER_ID, MBER_NM, MBER_EMAIL_ADRES, MBER_STTUS FROM v_sdb_mber_info")) {
                while (rs.next()) {
                    members.add(new Object[]{
                            rs.getString("MBER_ID"),
                            rs.getString("MBER_NM"),
                            rs.getString("MBER_EMAIL_ADRES"),
                            rs.getString("MBER_STTUS")});
                }
            }
            // 회원-부서(겸직): DUTY_CODE 'EMPTY'/'' → NULL(직책 없음)로 정규화, 그 외 코드 보존.
            try (ResultSet rs = st.executeQuery(
                    "SELECT MBER_ID, DEPT_CODE, DEPT_NM, DUTY_CODE FROM v_sdb_mber_dept")) {
                while (rs.next()) {
                    memberDepts.add(new Object[]{
                            rs.getString("MBER_ID"),
                            rs.getString("DEPT_CODE"),
                            rs.getString("DEPT_NM"),
                            normalizeDuty(rs.getString("DUTY_CODE"))});
                }
            }
        } catch (java.sql.SQLException e) {
            throw ApiException.unprocessable("아마란스 view DB 조회 실패: " + e.getMessage());
        }

        // 미러 치환(전량 스냅샷). 표준 참조 대상이 아니므로 DELETE 안전.
        jdbc.update("DELETE FROM pms_org_member_dept");
        jdbc.update("DELETE FROM pms_org_member");
        jdbc.update("DELETE FROM pms_org_dept");

        jdbc.batchUpdate(
                "INSERT INTO pms_org_dept (dept_code, upper_dept_code, dept_nm) VALUES (?, ?, ?)", depts);
        jdbc.batchUpdate(
                "INSERT INTO pms_org_member (mber_id, mber_nm, email, status) VALUES (?, ?, ?, ?)", members);
        jdbc.batchUpdate(
                "INSERT INTO pms_org_member_dept (mber_id, dept_code, dept_nm, duty_code) VALUES (?, ?, ?, ?)",
                memberDepts);

        // 0042 — 부서 스냅샷 캐시를 버린다. 이 호출이 빠지면 OrgTreeService가 동기화 전 트리를 계속 쓴다.
        orgTree.invalidate();

        // 0042 5단계 — 아마란스 재직자를 인력 마스터로 승격(사용자 결정 (a)).
        Map<String, Object> promoted = promoteMembersToPersons();

        Map<String, Object> out = new LinkedHashMap<>();
        out.putAll(promoted);
        out.put("departments", depts.size());
        out.put("members", members.size());
        out.put("memberDepts", memberDepts.size());
        out.put("syncedAt", java.time.LocalDateTime.now().toString());
        return out;
    }

    /**
     * 0042 5단계 — 아마란스 회원 → 인력 마스터(pms_person) 벌크 승격.
     *
     * 왜: 예전엔 pms_person이 **참여인력으로 저장될 때만** find-or-insert로 생겼다. 그래서
     *   인력관리 목록은 "프로젝트에 투입된 적 있는 사람"뿐이었는데, 좌측 트리 인원수는
     *   아마란스 전원 기준이었다 — 12명이라고 뜬 부서를 눌러도 목록이 0건인 게 정상 동작이었다.
     *   (2026-07-29 dev 실측: org_member 897명 vs person 2명.)
     *
     * 겸직(한 회원이 여러 부서) 처리: pms_person은 부서를 하나만 갖는다. **직책이 있는 부서를
     *   우선**하고, 동률이면 dept_code 오름차순으로 대표 부서 1건을 고른다(결정적 — 동기화를
     *   여러 번 돌려도 같은 결과). 겸직 전체는 pms_org_member_dept에 그대로 남아 있고
     *   조직도 선택창은 거기서 읽으므로 정보가 사라지지는 않는다.
     *
     * 갱신 시 employment_type·company_id는 **건드리지 않는다**. 자사화 전환(0019)으로
     *   'insourced'가 된 인력이 동기화 한 번에 'regular'로 되돌아가면 안 된다.
     */
    private Map<String, Object> promoteMembersToPersons() {
        // 재직(P) 회원 → upsert. 사번(amaranth_emp_no)이 유니크 키.
        int upserted = jdbc.update("""
                INSERT INTO pms_person
                       (source, amaranth_emp_no, name, employment_type, department, dept_code, position, email, status)
                SELECT 'INTERNAL', m.mber_id, m.mber_nm, 'regular',
                       d.dept_nm, pd.dept_code, NULLIF(dc.duty_nm, ''), m.email, '재직'
                  FROM pms_org_member m
                  -- LEFT JOIN인 이유: 부서 행이 하나도 없는 재직자도 있다(dev 실측 9명).
                  --   결정 (a)는 "아마란스 재직 전원이 인력 마스터에 있다"이므로 이들도 만든다.
                  --   부서만 미상(dept_code NULL)으로 남아 부서 필터엔 안 걸린다.
                  LEFT JOIN (SELECT mber_id, dept_code, duty_code,
                               ROW_NUMBER() OVER (PARTITION BY mber_id
                                                  ORDER BY (duty_code IS NULL), dept_code) AS rn
                          FROM pms_org_member_dept) pd
                    ON pd.mber_id = m.mber_id AND pd.rn = 1
                  LEFT JOIN pms_org_dept d ON d.dept_code = pd.dept_code
                  LEFT JOIN pms_org_duty_code dc ON dc.duty_code = pd.duty_code
                 WHERE m.status = 'P'
                    ON DUPLICATE KEY UPDATE
                       name       = VALUES(name),
                       department = VALUES(department),
                       dept_code  = VALUES(dept_code),
                       position   = VALUES(position),
                       email      = VALUES(email),
                       status     = '재직'
                """);

        // 퇴직(D) 회원은 새로 만들지 않고, 이미 있는 인력만 '종료'로 내린다.
        //   아마란스가 내부 인력 재직상태의 원천이다(0020 경계).
        int retired = jdbc.update("""
                UPDATE pms_person p
                  JOIN pms_org_member m ON m.mber_id = p.amaranth_emp_no
                   SET p.status = '종료'
                 WHERE m.status = 'D' AND p.status <> '종료'
                """);

        // 부서 코드를 못 채운 내부 인력(동명 부서라 백필이 포기했거나 사번 미보유) — 운영 확인용.
        Integer unresolved = jdbc.queryForObject(
                "SELECT COUNT(*) FROM pms_person WHERE source = 'INTERNAL' AND dept_code IS NULL",
                Integer.class);
        if (unresolved != null && unresolved > 0) {
            log.warn("조직 동기화: 부서 코드를 확정하지 못한 내부 인력 {}명 (동명 부서 또는 사번 미보유). "
                    + "부서 필터에서 제외된다 — 수동 확인 필요.", unresolved);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("personsUpserted", upserted);
        out.put("personsRetired", retired);
        out.put("personsWithoutDeptCode", unresolved == null ? 0 : unresolved);
        return out;
    }

    private static String blankToNull(String v) {
        return (v == null || v.isBlank()) ? null : v;
    }

    private static String normalizeDuty(String v) {
        if (v == null) return null;
        String t = v.trim();
        if (t.isEmpty() || "EMPTY".equalsIgnoreCase(t)) return null;
        return t;
    }
}
