package com.aetherpms.project;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * pms_project row → 도메인 모델(camelCase) 변환.
 * Node server/src/mappers.ts 의 mapProject/mapConsortium 를 1:1 이식.
 * 프론트 web/src/types.ts Project/ConsortiumMember 와 필드가 일치해야 한다.
 */
public final class ProjectMapper {

    private ProjectMapper() {}

    // DB는 한글 status로 저장, UI 내부 로직은 영문 status 기대 (mappers.ts STATUS_KO2EN).
    private static final Map<String, String> STATUS_KO2EN = Map.of(
            "입찰", "Bidding",
            "진행중", "In Progress",
            "지연", "Delay",
            "보류", "On Hold",
            "완료", "Completed");

    /** num(v): null/빈값 → 0. Node: Number(v || 0). */
    private static double num(BigDecimal v) {
        return v == null ? 0 : v.doubleValue();
    }

    private static double num(Integer v) {
        return v == null ? 0 : v.doubleValue();
    }

    /** dateStr(v): null/빈 → null, 아니면 yyyy-MM-dd. */
    private static String dateStr(LocalDate v) {
        return v == null ? null : v.toString();
    }

    public static Map<String, Object> mapProject(ProjectEntity p) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", p.getProjectId());
        out.put("projectCode", p.getProjectCode());
        out.put("name", p.getProjectName());
        out.put("desc", p.getDescription());
        out.put("dept", p.getDept());
        out.put("manager", p.getPmName());
        out.put("managerId", p.getPmId());
        out.put("startDate", dateStr(p.getPlannedStartDate()));
        out.put("endDate", dateStr(p.getPlannedEndDate()));
        out.put("customer", p.getCustomerName());
        out.put("budget", num(p.getBudget()));
        out.put("milestones", p.getMilestones());
        out.put("inspectionDate", dateStr(p.getInspectionDate()));
        out.put("team", p.getTeam());
        out.put("proposalDeadline", dateStr(p.getProposalDeadline()));
        out.put("remarks", p.getRemarks());
        String status = p.getStatus();
        out.put("status", STATUS_KO2EN.getOrDefault(status, status));
        out.put("bidStatus", p.getBidStatus());
        out.put("progress", num(p.getProgressRate()));
        out.put("resources", num(p.getResources()));
        out.put("bidNumber", p.getBidNumber());
        out.put("announcementNo", p.getAnnouncementNo());
        out.put("customerName", p.getCustomerName());
        out.put("location", p.getLocation());
        out.put("projectBudget", num(p.getContractAmount()));
        out.put("businessType", p.getBusinessType());
        out.put("stage", p.getProjectStage());
        out.put("sourceProjectId", p.getSourceProjectId());
        // 0025: 입찰 목록 카드 필드(프로젝트 자체 컬럼 — pms_project_company 컨소시엄 목록과 별개)
        out.put("consortiumRole", p.getConsortiumRole());
        out.put("consortiumShare", p.getConsortiumShare() == null ? null : p.getConsortiumShare().doubleValue());
        out.put("vrbStatus", p.getVrbStatus());
        // 0027: 담당조직 정보(입찰 개요 카드)
        out.put("salesOwner", p.getSalesOwner());
        out.put("proposalOwner", p.getProposalOwner());
        out.put("proposalPm", p.getProposalPm());
        out.put("businessManager", p.getBusinessManager());
        out.put("contractOwner", p.getContractOwner());
        out.put("legalOwner", p.getLegalOwner());
        out.put("consortiumMembers", new java.util.ArrayList<>());
        out.put("vrbInfo", null);
        return out;
    }

    public static Map<String, Object> mapConsortium(ProjectCompanyEntity c) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("companyName", c.getCompanyName());
        out.put("role", c.getRole());
        out.put("shareRate", num(c.getShareRate()));
        out.put("description", c.getDescription());
        return out;
    }
}
