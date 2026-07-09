package com.aetherpms.g2b;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Service;

/**
 * 공고 단건 상세조회 오케스트레이션 (배치14 / 설계 0017 §A).
 *
 * - serviceKey 미설정: G2bException(컨트롤러가 502로 매핑, 리스트 조회와 동일 정책).
 * - 결과 0건: BidNoticeNotFoundException(404).
 * - 캐시: bidNtceNo 단위 단기 인메모리 캐시(TTL = g2b.cache-ttl-seconds). 상세 페이지 새로고침·
 *   생성 마법사 프리필 재조회에서 외부 재호출을 아낀다. 리스트 캐시(G2bNoticeCache)와는 별도 저장소.
 */
@Service
public class BidNoticeDetailService {

    private record Entry(long expiresAt, BidNoticeDetail value) {}

    private final BidNoticeDetailSource source;
    private final G2bProperties props;
    private final Map<String, Entry> cache = new ConcurrentHashMap<>();

    public BidNoticeDetailService(BidNoticeDetailSource source, G2bProperties props) {
        this.source = source;
        this.props = props;
    }

    /** bidNtceNo 상세 조회. 키없음→G2bException, 0건→BidNoticeNotFoundException. */
    public BidNoticeDetail getDetail(String bidNtceNo) {
        if (bidNtceNo == null || bidNtceNo.isBlank()) {
            throw new BidNoticeNotFoundException("입찰공고번호(bidNtceNo)가 필요합니다.");
        }
        if (!props.hasServiceKey()) {
            throw new G2bException(
                "나라장터 인증키(G2B_SERVICE_KEY)가 설정되지 않아 공고 상세를 조회할 수 없습니다.");
        }
        String key = bidNtceNo.trim();

        BidNoticeDetail cached = getCached(key);
        if (cached != null) return cached;

        BidNoticeDetail detail = source.fetch(key);
        if (detail == null) {
            throw new BidNoticeNotFoundException(
                "입찰공고번호 '" + key + "'에 해당하는 공고를 찾을 수 없습니다.");
        }
        putCached(key, detail);
        return detail;
    }

    private BidNoticeDetail getCached(String key) {
        Entry e = cache.get(key);
        if (e == null) return null;
        if (System.currentTimeMillis() > e.expiresAt()) {
            cache.remove(key);
            return null;
        }
        return e.value();
    }

    private void putCached(String key, BidNoticeDetail value) {
        long ttl = Math.max(0, props.getCacheTtlSeconds()) * 1000L;
        cache.put(key, new Entry(System.currentTimeMillis() + ttl, value));
    }

    /** 테스트/관리용. */
    public void clearCache() {
        cache.clear();
    }
}
