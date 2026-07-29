package com.aetherpms.person;

import java.util.List;

/**
 * GET /api/persons 필터 파라미터 (설계 0014 A).
 *   employmentTypes: 복수(콤마 분해). match: or(기본)|and.
 *   name/company: LIKE. projectId/location/customer: 멤버→프로젝트 조인 파생.
 *   deptCode: 조직도 트리 선택 부서 1건 — 하위 부서 전개는 서버가 한다(URL 길이 보호).
 *   departments: 부서명 직접 지정(레거시/외부 호출용).
 */
public record PersonQuery(
        List<String> employmentTypes,
        String match,
        String name,
        String company,
        Long projectId,
        String location,
        String customer,
        List<String> departments,
        String deptCode,
        boolean includeInactive) {
}
