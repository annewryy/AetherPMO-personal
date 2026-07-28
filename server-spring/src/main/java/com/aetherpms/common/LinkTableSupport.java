package com.aetherpms.common;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 0040 — 엔티티 간 N:M 연결 공용 검증·동기화·배치조회 헬퍼.
 *
 * <p>저장소는 단일 다형성 테이블 {@code pms_entity_link} 하나다(쌍별 링크 테이블 9종을 통합).
 * 간선 1개 = 행 1개이며 {@code (src, dst)}는 {@link LinkEntity#rank()} 오름차순으로 정규화해
 * 저장한다. <b>정규화는 이 클래스의 {@code canonical} 한 곳에서만 수행하며, 서비스 코드가 직접
 * {@code INSERT INTO pms_entity_link}를 치는 것을 금지한다.</b>
 *
 * <p>동기화는 기존과 동일한 delete-then-insert이고, 삭제 스코프는 언제나
 * {@code link_type='RELATED'} + <b>상대 타입 한정</b>이다(다른 상대 타입의 연결을 건드리면 안 된다).
 */
public final class LinkTableSupport {

    private static final String RELATED = "RELATED";

    private LinkTableSupport() {}

    /** 정규 순서로 배치된 간선 한 개. */
    private record Edge(String srcType, long srcId, String dstType, long dstId) {}

    /**
     * 정규 순서 규칙: rank가 낮은 쪽이 src. 같은 타입이면 작은 id가 src.
     * (rank는 고정값이라 이 규칙 하나로 간선의 표현이 유일해진다.)
     */
    private static Edge canonical(LinkEntity a, long aId, LinkEntity b, long bId) {
        if (a.rank() < b.rank()) return new Edge(a.name(), aId, b.name(), bId);
        if (a.rank() > b.rank()) return new Edge(b.name(), bId, a.name(), aId);
        return aId <= bId ? new Edge(a.name(), aId, b.name(), bId)
                          : new Edge(b.name(), bId, a.name(), aId);
    }

    /**
     * raw(정수 배열) → 검증된 id 목록. target 실체 테이블에서 같은 projectId 소속만 허용한다.
     * 중복 입력은 첫 등장 순서를 유지하며 제거한다(UNIQUE 충돌 방지).
     */
    public static List<Long> validateIds(JdbcTemplate jdbc, Object raw, String label,
                                         LinkEntity target, long projectId) {
        if (raw == null) return List.of();
        if (!(raw instanceof List<?> list)) throw ApiException.badRequest(label + "는 정수 배열이어야 합니다.");
        LinkedHashSet<Long> ids = new LinkedHashSet<>();
        for (Object o : list) {
            long v;
            try {
                v = o instanceof Number n ? n.longValue() : Long.parseLong(o.toString());
            } catch (NumberFormatException e) {
                throw ApiException.badRequest(label + "에 유효하지 않은 값이 있습니다: " + o);
            }
            if (v <= 0) throw ApiException.badRequest(label + "에 유효하지 않은 값이 있습니다: " + o);
            ids.add(v);
        }
        if (ids.isEmpty()) return List.of();
        List<Long> out = new ArrayList<>(ids);
        String placeholders = String.join(",", Collections.nCopies(out.size(), "?"));
        Object[] args = new Object[out.size() + 1];
        args[0] = projectId;
        for (int i = 0; i < out.size(); i++) args[i + 1] = out.get(i);
        Integer matched = jdbc.queryForObject(
                "SELECT COUNT(*) FROM " + target.table() + " WHERE project_id = ? AND " + target.idCol()
                        + " IN (" + placeholders + ")",
                Integer.class, args);
        if (matched == null || matched != out.size()) {
            throw ApiException.badRequest(label + "에 이 프로젝트 소속이 아닌 값이 있습니다.");
        }
        return out;
    }

    /**
     * self ↔ other 타입 간 RELATED 링크를 otherIds로 치환(delete-then-insert).
     * otherIds가 비면 삭제만 한다("전부 해제"). 다른 상대 타입의 링크는 건드리지 않는다.
     *
     * @param actorUid 연결한 사용자 uid — 구할 수 없으면 null 허용.
     */
    public static void sync(JdbcTemplate jdbc, LinkEntity self, long selfId, LinkEntity other,
                            List<Long> otherIds, long projectId, String actorUid) {
        jdbc.update("""
                DELETE FROM pms_entity_link
                 WHERE link_type = ?
                   AND ( (src_type = ? AND src_id = ? AND dst_type = ?)
                      OR (dst_type = ? AND dst_id = ? AND src_type = ?) )""",
                RELATED,
                self.name(), selfId, other.name(),
                self.name(), selfId, other.name());
        if (otherIds == null || otherIds.isEmpty()) return;

        List<Object[]> batch = new ArrayList<>();
        for (Long otherId : new LinkedHashSet<>(otherIds)) {
            Edge e = canonical(self, selfId, other, otherId);
            batch.add(new Object[] { projectId, e.srcType(), e.srcId(), e.dstType(), e.dstId(),
                                     RELATED, actorUid });
        }
        jdbc.batchUpdate("INSERT INTO pms_entity_link "
                + "(project_id, src_type, src_id, dst_type, dst_id, link_type, created_by) "
                + "VALUES (?, ?, ?, ?, ?, ?, ?)", batch);
    }

    /** self 1건에 연결된 other 타입 id 목록(오름차순). */
    public static List<Long> linked(JdbcTemplate jdbc, LinkEntity self, long selfId, LinkEntity other) {
        Map<LinkEntity, Map<Long, List<Long>>> grouped =
                fetch(jdbc, self, List.of(selfId), List.of(other));
        return grouped.getOrDefault(other, Map.of()).getOrDefault(selfId, List.of());
    }

    /**
     * rows(다건)에 이웃 타입들의 id 배열을 {@link LinkEntity#outKey()} 이름으로 부착. 쿼리 1회.
     * 연결이 없는 행에도 빈 배열을 넣는다(null 아님).
     */
    public static void attachAll(JdbcTemplate jdbc, List<Map<String, Object>> rows, String idKey,
                                 LinkEntity self, List<LinkEntity> others) {
        if (rows.isEmpty() || others.isEmpty()) return;
        List<Long> ids = rows.stream().map(r -> ((Number) r.get(idKey)).longValue()).toList();
        Map<LinkEntity, Map<Long, List<Long>>> grouped = fetch(jdbc, self, ids, others);
        for (Map<String, Object> row : rows) {
            long selfId = ((Number) row.get(idKey)).longValue();
            for (LinkEntity other : others) {
                row.put(other.outKey(),
                        grouped.getOrDefault(other, Map.of()).getOrDefault(selfId, List.of()));
            }
        }
    }

    /** 엔티티 삭제 시 그 엔티티가 걸린 모든 링크 제거(다형성이라 DB CASCADE가 없다). */
    public static void deleteLinksFor(JdbcTemplate jdbc, LinkEntity self, long selfId) {
        jdbc.update("DELETE FROM pms_entity_link "
                  + "WHERE (src_type = ? AND src_id = ?) OR (dst_type = ? AND dst_id = ?)",
                self.name(), selfId, self.name(), selfId);
    }

    /**
     * 표준 조회(핫패스) — self 타입/ids 집합에 연결된 other 타입들의 id를 쿼리 1회로 가져온다.
     * 결과: other 타입 → (selfId → otherId 오름차순 목록).
     */
    private static Map<LinkEntity, Map<Long, List<Long>>> fetch(
            JdbcTemplate jdbc, LinkEntity self, List<Long> ids, List<LinkEntity> others) {
        Map<LinkEntity, Map<Long, List<Long>>> out = new LinkedHashMap<>();
        for (LinkEntity other : others) out.put(other, new LinkedHashMap<>());
        if (ids.isEmpty() || others.isEmpty()) return out;

        String idPh = String.join(",", Collections.nCopies(ids.size(), "?"));
        String typePh = String.join(",", Collections.nCopies(others.size(), "?"));
        List<Object> args = new ArrayList<>();
        args.add(RELATED);
        args.add(self.name());
        args.addAll(ids);
        for (LinkEntity o : others) args.add(o.name());
        args.add(self.name());
        args.addAll(ids);
        for (LinkEntity o : others) args.add(o.name());

        List<Map<String, Object>> links = jdbc.queryForList(
                "SELECT src_type, src_id, dst_type, dst_id FROM pms_entity_link"
                        + " WHERE link_type = ?"
                        + "   AND ( (src_type = ? AND src_id IN (" + idPh + ") AND dst_type IN (" + typePh + "))"
                        + "      OR (dst_type = ? AND dst_id IN (" + idPh + ") AND src_type IN (" + typePh + ")) )",
                args.toArray());

        for (Map<String, Object> l : links) {
            String srcType = String.valueOf(l.get("src_type"));
            long srcId = ((Number) l.get("src_id")).longValue();
            String dstType = String.valueOf(l.get("dst_type"));
            long dstId = ((Number) l.get("dst_id")).longValue();
            // 어느 쪽 끝이 self인지 판정 — src 쪽이 self 조건을 만족하면 dst가 상대, 아니면 그 반대.
            boolean srcIsSelf = srcType.equals(self.name()) && ids.contains(srcId)
                    && others.stream().anyMatch(o -> o.name().equals(dstType));
            long selfId = srcIsSelf ? srcId : dstId;
            String otherType = srcIsSelf ? dstType : srcType;
            long otherId = srcIsSelf ? dstId : srcId;
            LinkEntity other = LinkEntity.valueOf(otherType);
            out.get(other).computeIfAbsent(selfId, k -> new ArrayList<>()).add(otherId);
        }
        for (Map<Long, List<Long>> byId : out.values()) {
            for (List<Long> v : byId.values()) Collections.sort(v);
        }
        return out;
    }
}
