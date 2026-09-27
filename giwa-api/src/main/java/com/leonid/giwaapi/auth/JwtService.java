package com.leonid.giwaapi.auth;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.UUID;

@Service
public class JwtService {

    private final SecretKey secretKey;
    private final long expirationMs;

    public JwtService(@Value("${jwt.secret}") String secret, @Value("${jwt.expiration-ms}") long expirationMs) {
        this.secretKey = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expirationMs = expirationMs;
    }

    public String createToken(User user) {
        Date now = new Date();
        return Jwts.builder()
                .subject(user.email())
                .issuedAt(now)
                .expiration(new Date(now.getTime() + expirationMs))
                .signWith(secretKey)
                .compact();
    }

    public String createDemoToken(User user) {
        Date now = new Date();
        return Jwts.builder()
                .subject(user.email())
                .id(UUID.randomUUID().toString())
                .claim("scope", "midnight:demo")
                .issuedAt(now)
                .expiration(new Date(now.getTime() + Math.min(expirationMs, 7_200_000L)))
                .signWith(secretKey)
                .compact();
    }

    public String extractEmail(String token) {
        return extractSession(token).email();
    }

    public TokenSession extractSession(String token) {
        Claims claims = Jwts.parser()
                .verifyWith(secretKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
        String scope = claims.get("scope", String.class);
        boolean demo = "midnight:demo".equals(scope);
        if (scope != null && !demo) throw new IllegalArgumentException("Unknown token scope");
        if (demo && (claims.getId() == null
                || !UUID.fromString(claims.getId()).toString().equals(claims.getId()))) {
            throw new IllegalArgumentException("Missing demo session");
        }
        return new TokenSession(claims.getSubject(), demo, claims.getId(),
                claims.getExpiration().toInstant().getEpochSecond());
    }
    public record TokenSession(String email, boolean demo, String sessionId, long expiresAt) {}
}
