package com.aetherpms.common;

/**
 * 0040 — {@code pms_entity_link} 단일 다형성 링크 테이블이 다루는 엔티티 어휘.
 *
 * <p>rank는 간선의 정규 순서(canonical ordering) 결정에만 쓰인다. 간선 1개 = 행 1개이고,
 * 낮은 rank 쪽이 항상 src에 들어간다(같은 타입이면 작은 id가 src). <b>rank는 한번 정하면
 * 절대 바꾸지 않는다</b> — 바꾸면 이미 저장된 행의 정규성이 깨진다. 새 엔티티는 6, 7, … 로 뒤에 붙인다.
 *
 * <p><b>이 5종 엔티티에 삭제 기능을 추가하는 사람은 같은 트랜잭션에서
 * {@code LinkTableSupport.deleteLinksFor}를 반드시 호출해야 한다. 다형성 링크라 DB CASCADE가 없다.</b>
 *
 * <p>{@code WorkSurfaceService.Entity}(감사로그용 TASK/ISSUE/ACTION_ITEM)와는 별개 enum이다.
 * 이쪽은 링크 가능한 5종, 저쪽은 PATCH 가능한 3종으로 목적이 다르다 — 통합하지 말 것.
 */
public enum LinkEntity {

    TASK(1, "pms_task", "task_id", "taskIds"),
    DELIVERABLE(2, "pms_deliverable", "deliverable_id", "deliverableIds"),
    ISSUE(3, "pms_issue", "issue_id", "issueIds"),
    MEETING(4, "pms_meeting_minutes", "meeting_id", "meetingIds"),
    ACTION_ITEM(5, "pms_action_item", "action_id", "actionItemIds");

    private final int rank;
    private final String table;
    private final String idCol;
    private final String outKey;

    LinkEntity(int rank, String table, String idCol, String outKey) {
        this.rank = rank;
        this.table = table;
        this.idCol = idCol;
        this.outKey = outKey;
    }

    /** 정규 순서용 랭크(고정값). */
    public int rank() { return rank; }

    /** 실체 테이블명 — 같은 프로젝트 소속 검증에 사용. */
    public String table() { return table; }

    /** 실체 테이블의 PK 컬럼명. */
    public String idCol() { return idCol; }

    /** API 응답에 실리는 키(camelCase). */
    public String outKey() { return outKey; }
}
