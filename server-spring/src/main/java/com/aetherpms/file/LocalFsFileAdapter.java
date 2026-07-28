package com.aetherpms.file;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.aetherpms.common.ApiException;

/**
 * 0018 dev 어댑터 — 로컬 디스크(도커 볼륨 /data/files). NAS 도입 시 S3Adapter로 교체(설정만).
 * 키 정규화로 디렉터리 탈출(../) 차단.
 */
@Service
public class LocalFsFileAdapter implements FilePort {

    private final Path base;

    public LocalFsFileAdapter(@Value("${file.storage.dir:/data/files}") String dir) {
        this.base = Path.of(dir);
    }

    private Path resolve(String key) {
        if (key == null || key.isBlank()) throw ApiException.badRequest("파일 키가 비어 있습니다.");
        Path p = base.resolve(key).normalize();
        if (!p.startsWith(base)) throw ApiException.badRequest("잘못된 파일 키입니다.");
        return p;
    }

    @Override
    public void put(String key, InputStream in) {
        Path p = resolve(key);
        try {
            Files.createDirectories(p.getParent());
            Files.copy(in, p, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            throw new IllegalStateException("파일 저장 실패: " + key, e);
        }
    }

    @Override
    public InputStream get(String key) {
        Path p = resolve(key);
        try {
            return Files.exists(p) ? Files.newInputStream(p) : null;
        } catch (IOException e) {
            throw new IllegalStateException("파일 읽기 실패: " + key, e);
        }
    }

    @Override
    public boolean exists(String key) {
        return Files.exists(resolve(key));
    }

    @Override
    public void delete(String key) {
        try {
            Files.deleteIfExists(resolve(key));
        } catch (IOException e) {
            throw new IllegalStateException("파일 삭제 실패: " + key, e);
        }
    }
}
