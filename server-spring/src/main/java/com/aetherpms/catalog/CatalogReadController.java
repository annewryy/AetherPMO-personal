package com.aetherpms.catalog;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.aetherpms.common.ReadMappers;

/** 카탈로그 트리 읽기(구 ReadController 분리). 중첩 JSON 트리. */
@RestController
public class CatalogReadController {

    private final CatalogNodeReadRepository repo;

    public CatalogReadController(CatalogNodeReadRepository repo) {
        this.repo = repo;
    }

    @GetMapping("/api/catalog/tree")
    public List<Map<String, Object>> catalogTree(
            @RequestParam(name = "includeInactive", required = false) String includeInactive) {
        boolean showAll = "true".equals(includeInactive);
        Map<Long, Map<String, Object>> byId = new LinkedHashMap<>();
        for (CatalogNodeEntity n : repo.findAllByOrderBySortOrderAscNodeIdAsc()) {
            boolean active = n.getIsActive() == null || n.getIsActive();
            if (!showAll && !active) continue;
            byId.put(n.getNodeId(), ReadMappers.mapCatalogNode(n));
        }
        List<Map<String, Object>> roots = new ArrayList<>();
        for (Map<String, Object> node : byId.values()) {
            Object parentId = node.get("parentId");
            if (parentId != null && byId.containsKey(((Number) parentId).longValue())) {
                @SuppressWarnings("unchecked")
                List<Object> children = (List<Object>) byId.get(((Number) parentId).longValue()).get("children");
                children.add(node);
            } else {
                roots.add(node);
            }
        }
        return roots;
    }
}
