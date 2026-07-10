package com.aetherpms.wbs;

import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import com.aetherpms.common.ApiException;

/**
 * GET /api/projects/{id}/wbs — WBS/일정 트리(배치19).
 * 프로젝트 상세 "WBS/일정" 탭(날짜축 간트 + 진척 숫자)용 단일 응답.
 * 없으면 404 {message}. 진척 endpoint 관례 따름.
 */
@RestController
public class WbsController {

    private final WbsService service;

    public WbsController(WbsService service) {
        this.service = service;
    }

    @GetMapping("/api/projects/{id}/wbs")
    public Map<String, Object> wbs(@PathVariable("id") long id) {
        if (id <= 0) {
            throw ApiException.badRequest("유효하지 않은 id 입니다.");
        }
        return service.getProjectWbs(id);
    }
}
