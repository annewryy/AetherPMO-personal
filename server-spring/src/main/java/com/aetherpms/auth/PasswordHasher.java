package com.aetherpms.auth;

import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

/**
 * 0031 §B — PBKDF2-HMAC-SHA256 비밀번호 해시(신규 의존성 0).
 * 포맷: pbkdf2-sha256${iter}${base64(salt)}${base64(hash)}
 */
public final class PasswordHasher {

    private static final int ITERATIONS = 100_000;
    private static final int SALT_LEN = 16;
    private static final int KEY_LEN = 256;
    private static final SecureRandom RNG = new SecureRandom();

    private PasswordHasher() {}

    public static String hash(String password) {
        byte[] salt = new byte[SALT_LEN];
        RNG.nextBytes(salt);
        byte[] dk = pbkdf2(password, salt, ITERATIONS);
        return "pbkdf2-sha256$" + ITERATIONS + "$"
                + Base64.getEncoder().encodeToString(salt) + "$"
                + Base64.getEncoder().encodeToString(dk);
    }

    /** 저장된 해시와 평문 비교(상수시간). */
    public static boolean verify(String password, String stored) {
        if (stored == null) return false;
        String[] p = stored.split("\\$");
        if (p.length != 4 || !"pbkdf2-sha256".equals(p[0])) return false;
        int iter = Integer.parseInt(p[1]);
        byte[] salt = Base64.getDecoder().decode(p[2]);
        byte[] expected = Base64.getDecoder().decode(p[3]);
        byte[] actual = pbkdf2(password, salt, iter);
        return constantTimeEquals(expected, actual);
    }

    private static byte[] pbkdf2(String password, byte[] salt, int iter) {
        try {
            PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), salt, iter, KEY_LEN);
            SecretKeyFactory f = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256");
            return f.generateSecret(spec).getEncoded();
        } catch (Exception e) {
            throw new IllegalStateException("비밀번호 해시 실패", e);
        }
    }

    private static boolean constantTimeEquals(byte[] a, byte[] b) {
        if (a.length != b.length) return false;
        int r = 0;
        for (int i = 0; i < a.length; i++) r |= a[i] ^ b[i];
        return r == 0;
    }
}
