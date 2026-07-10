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

    private final JdbcTemplate jdbc; // 우리 DB(메인 datasource)

    @Value("${amaranth.view.url:}")
    private String viewUrl;
    @Value("${amaranth.view.username:}")
    private String viewUser;
    @Value("${amaranth.view.password:}")
    private String viewPassword;

    public OrgSyncService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
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

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("departments", depts.size());
        out.put("members", members.size());
        out.put("memberDepts", memberDepts.size());
        out.put("syncedAt", java.time.LocalDateTime.now().toString());
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
