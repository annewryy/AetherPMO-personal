package com.aetherpms.file;

import java.io.InputStream;

/**
 * 0018 — 파일 저장 포트. 코어는 이 포트만 의존, 저장 방식(로컬 디스크/NAS S3/NFS)은 어댑터가 흡수.
 * dev 1차 어댑터 = LocalFsFileAdapter(컨테이너 볼륨). NAS 확정 시 S3Adapter 추가·설정 교체(0018 §A).
 */
public interface FilePort {

    /** 저장(동일 키 덮어쓰기). key 규약: {entityType}/{entityId}/…/{uuid}__{원본파일명} */
    void put(String key, InputStream in);

    /** 조회 스트림 — 없으면 null. */
    InputStream get(String key);

    boolean exists(String key);

    void delete(String key);
}
