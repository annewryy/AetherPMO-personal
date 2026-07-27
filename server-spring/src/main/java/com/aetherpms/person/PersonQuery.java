package com.aetherpms.person;

import java.util.List;

/**
 * GET /api/persons 필터 파라미터 (설계 0014 A).
 *   employmentTypes: 복수(콤마 분해). match: or(기본)|and.
 *   name/company: LIKE. projectId/location/customer: 멤버→프로젝트 조인 파생.
 */
public record PersonQuery(
        List<String> employmentTypes,
        String match,
        String name,
        String company,
        Long projectId,
        String location,
        String customer,
        List<String> departments) {
}
