package com.aetherpms.person;

import java.util.List;

/**
 * GET /api/persons 필터 파라미터 (설계 0014 A).
 *   employmentTypes: 복수(콤마 분해). match: or(기본)|and.
 *   name/company: LIKE. projectId/location/customer: 멤버→프로젝트 조인 파생.
 *   deptCode: 조직도 트리 선택 부서 1건 — 하위 부서 전개는 서버(OrgTreeService)가 한다(URL 길이 보호).
 *
 * 0042 — departments(부서명 직접 지정)는 제거했다. 414 사고(2338697) 때 deptCode로 갈아탄 뒤
 *   프론트에서 아무도 안 쓰는 죽은 표면이었고, 남겨두면 이름 기반 필터가 두 경로로 갈라진다.
 */
public record PersonQuery(
        List<String> employmentTypes,
        String match,
        String name,
        String company,
        Long projectId,
        String location,
        String customer,
        String deptCode,
        boolean includeInactive) {
}
