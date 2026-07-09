package com.aetherpms.g2b;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;

/**
 * 조회 결과 단기 인메모리 캐시 (설계 0016 §C).
 *
 * 외부 API 재호출 없이 검색·필터를 캐시 기반으로 처리하기 위한 소스별 원시 수집 캐시.
 * 키 = (noticeType|agency|기간). TTL 경과 시 무효. Caffeine/Redis 도입은 후속(플래그) —
 * 여기서는 의존성 추가 없이 간단 TTL 맵으로 시작(설계: 요청/단기 인메모리 기본).
 *
 * 주의: 인스턴스 스코프 프로세스 캐시. 멀티노드/영속은 후속(Redis/테이블).
 */
@Component
public class G2bNoticeCache {

    private record Entry(long expiresAt, List<BidNotice> value) {}

    private final Map<String, Entry> store = new ConcurrentHashMap<>();
    private final G2bProperties props;

    public G2bNoticeCache(G2bProperties props) {
        this.props = props;
    }

    /** 소스 수집 결과 캐시 키 — 기관/기간/유형 단위(검색어는 로컬필터라 키에서 제외). */
    static String key(String noticeType, String agencyName, String bgngDt, String endDt) {
        return noticeType + "|" + (agencyName == null ? "" : agencyName) + "|" + bgngDt + "|" + endDt;
    }

    /** 캐시된 값(유효) 반환, 없거나 만료면 null. */
    public List<BidNotice> get(String key) {
        Entry e = store.get(key);
        if (e == null) return null;
        if (System.currentTimeMillis() > e.expiresAt()) {
            store.remove(key);
            return null;
        }
        return e.value();
    }

    public void put(String key, List<BidNotice> value) {
        long ttl = Math.max(0, props.getCacheTtlSeconds()) * 1000L;
        store.put(key, new Entry(System.currentTimeMillis() + ttl, value));
    }

    /** 테스트/관리용. */
    public void clear() {
        store.clear();
    }
}
