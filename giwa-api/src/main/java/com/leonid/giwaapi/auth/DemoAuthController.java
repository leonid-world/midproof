package com.leonid.giwaapi.auth;

import com.leonid.giwaapi.common.error.ApiException;
import com.leonid.giwaapi.midnight.MidnightProofProperties;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.Set;

/** Limited synthetic visitor sessions; never grants access to GIWA asset APIs. */
@RestController
@ConditionalOnProperty(name = "app.midnight.demo-enabled", havingValue = "true")
public class DemoAuthController {
    private static final Set<String> ROLES = Set.of("SELLER", "BUYER", "FUNDER");
    private static final Set<String> OPERATIONS = Set.of("start", "status", "recover");
    private static final Set<String> LOOPBACK = Set.of("127.0.0.1", "::1", "0:0:0:0:0:0:0:1", "::ffff:127.0.0.1");
    private final UserMapper users;
    private final JwtService jwt;
    private final MidnightProofProperties properties;

    public DemoAuthController(UserMapper users, JwtService jwt, MidnightProofProperties properties) {
        this.users = users;
        this.jwt = jwt;
        this.properties = properties;
    }

    @PostMapping(value = "/auth/demo-login", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<AuthResponse> login(@RequestBody JsonNode body, HttpServletRequest request) {
        if (request.getQueryString() != null || body == null || !body.isObject()
                || !body.propertyNames().equals(Set.of("role")) || !body.path("role").isString()
                || !ROLES.contains(body.get("role").asString())) {
            throw invalidBody();
        }
        String email = body.get("role").asString().toLowerCase(Locale.ROOT) + "@midnight-demo.test";
        User user = users.findByEmail(email).orElseThrow(() -> new ApiException(
                HttpStatus.SERVICE_UNAVAILABLE, "DEMO_NOT_READY", "데모 계정을 준비하고 있습니다. 잠시 후 다시 시도해 주세요."));
        return noStore(new AuthResponse(jwt.createDemoToken(user), UserResponse.from(user)));
    }

    @PostMapping(value = "/internal/midnight/demo-authority", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<DemoAuthority> authorize(@RequestBody JsonNode body, HttpServletRequest request) {
        String supplied = request.getHeader("X-Midnight-Internal-Token");
        String expected = properties.getInternalToken();
        if (!LOOPBACK.contains(request.getRemoteAddr()) || request.getQueryString() != null
                || supplied == null || supplied.length() > 256 || expected.isBlank()
                || !MessageDigest.isEqual(supplied.getBytes(StandardCharsets.UTF_8), expected.getBytes(StandardCharsets.UTF_8))) {
            throw denied();
        }
        if (body == null || !body.isObject() || !body.propertyNames().equals(Set.of("operation"))
                || !body.path("operation").isString() || !OPERATIONS.contains(body.get("operation").asString())) {
            throw invalidBody();
        }
        String authorization = request.getHeader("Authorization");
        if (authorization == null || !authorization.startsWith("Bearer ")) throw denied();
        JwtService.TokenSession session = jwt.extractSession(authorization.substring(7));
        if (!session.demo()) throw denied();
        User user = users.findByEmail(session.email()).orElseThrow(DemoAuthController::denied);
        if (!ROLES.stream().anyMatch(role -> session.email().equals(role.toLowerCase(Locale.ROOT) + "@midnight-demo.test"))) {
            throw denied();
        }
        String userId = user.userId().toString();
        return noStore(new DemoAuthority(userId, userId, session.sessionId(), session.expiresAt(), true));
    }

    private static <T> ResponseEntity<T> noStore(T body) {
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON)
                .cacheControl(CacheControl.noStore()).header("Pragma", "no-cache").body(body);
    }
    private static ApiException invalidBody() {
        return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST_BODY", "요청 본문 형식을 확인해 주세요.");
    }
    private static ApiException denied() {
        return new ApiException(HttpStatus.FORBIDDEN, "ACCESS_DENIED", "접근 권한이 없습니다.");
    }
    public record DemoAuthority(String actorId, String userId, String sessionId, long expiresAt, boolean demo) {}
}
