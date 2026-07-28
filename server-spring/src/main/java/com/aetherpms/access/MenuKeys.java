package com.aetherpms.access;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 0034 §2 — 메뉴 키 카탈로그. 사이드바(App.vue) 그룹과 1:1 대응.
 * 키 추가/변경 시 App.vue 사이드바 v-if 조건도 함께 갱신할 것.
 */
public final class MenuKeys {

    private MenuKeys() {}

    public static final String DASHBOARD = "dashboard";
    public static final String BIDDING = "bidding";           // 입찰단계 + 나라장터 공고조회
    public static final String EXECUTION = "execution";       // 수행단계
    public static final String ISSUES = "issues";
    public static final String ACTION_ITEMS = "action-items";
    public static final String OFFICIAL_DOCS = "official-docs";
    public static final String MEETING_MINUTES = "meeting-minutes";
    public static final String TAILORING = "tailoring";        // 테일러링 + 산출물 관리
    public static final String PERSONS = "persons";            // 인력관리 + 참여인력 관리
    public static final String ADMIN = "admin";

    public static final List<String> ALL = List.of(
            DASHBOARD, BIDDING, EXECUTION, ISSUES, ACTION_ITEMS, OFFICIAL_DOCS,
            MEETING_MINUTES, TAILORING, PERSONS, ADMIN);

    /** 관리자 화면 표시용 라벨. */
    public static Map<String, String> labels() {
        Map<String, String> m = new LinkedHashMap<>();
        m.put(DASHBOARD, "대시보드");
        m.put(BIDDING, "입찰 관리(입찰단계·나라장터)");
        m.put(EXECUTION, "수행단계");
        m.put(ISSUES, "이슈/리스크");
        m.put(ACTION_ITEMS, "액션아이템");
        m.put(OFFICIAL_DOCS, "공문");
        m.put(MEETING_MINUTES, "회의록");
        m.put(TAILORING, "테일러링·산출물 관리");
        m.put(PERSONS, "인력관리·참여인력 관리");
        m.put(ADMIN, "관리자 콘솔");
        return m;
    }
}
