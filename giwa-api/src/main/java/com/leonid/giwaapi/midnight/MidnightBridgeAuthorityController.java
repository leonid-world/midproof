package com.leonid.giwaapi.midnight;

import com.leonid.giwaapi.common.error.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Set;

@RestController
@ConditionalOnProperty(name = "app.midnight.demo-enabled", havingValue = "true")
class MidnightBridgeAuthorityController {
    private static final Set<String> FIELDS = Set.of("requestId", "operation");
    private static final Set<String> OPERATIONS = Set.of("challenge", "prove", "status", "recover", "ack", "cancel");
    private static final Set<String> LOOPBACK = Set.of("127.0.0.1", "::1", "0:0:0:0:0:0:0:1", "::ffff:127.0.0.1");

    private final MidnightProofProperties properties;
    private final MidnightProofRequestService service;

    MidnightBridgeAuthorityController(MidnightProofProperties properties, MidnightProofRequestService service) {
        this.properties = properties;
        this.service = service;
    }

    @PostMapping(value = "/internal/midnight/authorize", consumes = MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<MidnightBridgeAuthorizationResponse> authorize(
            @AuthenticationPrincipal String email,
            @RequestBody JsonNode body,
            HttpServletRequest request
    ) {
        String supplied = request.getHeader("X-Midnight-Internal-Token");
        if (!LOOPBACK.contains(request.getRemoteAddr()) || request.getQueryString() != null
                || supplied == null || supplied.length() > 256
                || !MessageDigest.isEqual(supplied.getBytes(StandardCharsets.UTF_8),
                        properties.getInternalToken().getBytes(StandardCharsets.UTF_8))) {
            throw new ApiException(HttpStatus.FORBIDDEN, "ACCESS_DENIED", "접근 권한이 없습니다.");
        }
        if (body == null || !body.isObject() || !body.propertyNames().equals(FIELDS)
                || !body.path("requestId").isString() || !body.path("operation").isString()
                || !OPERATIONS.contains(body.get("operation").asString())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST_BODY", "요청 본문 형식을 확인해 주세요.");
        }
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .cacheControl(CacheControl.noStore())
                .header("Pragma", "no-cache")
                .body(service.authorizeBridge(email, body.get("requestId").asString(), body.get("operation").asString()));
    }
}
