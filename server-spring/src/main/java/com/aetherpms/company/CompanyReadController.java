package com.aetherpms.company;

import java.util.List;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import com.aetherpms.common.ReadMappers;

/** 회사(기준정보) 목록 읽기(구 ReadController 분리). */
@RestController
public class CompanyReadController {

    private final CompanyReadRepository repo;

    public CompanyReadController(CompanyReadRepository repo) {
        this.repo = repo;
    }

    @GetMapping("/api/companies")
    public List<Map<String, Object>> companies() {
        return repo.findAllByOrderByCompanyIdAsc().stream().map(ReadMappers::mapCompany).toList();
    }
}
