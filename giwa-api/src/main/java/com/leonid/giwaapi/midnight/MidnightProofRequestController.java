package com.leonid.giwaapi.midnight;

import com.leonid.giwaapi.common.error.ApiException;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

import java.util.List;
import java.util.Set;

@RestController
public class MidnightProofRequestController {
    private static final Set<String> CREATE_FIELDS = Set.of(
            "subjectRole", "minAnnualRevenueKrw", "maxDebtRatioBps",
            "maxOverdueCount", "validForSeconds"
    );
    private static final Set<String> COMPLETE_FIELDS = Set.of("proofCapability");
    private final MidnightProofRequestService service;

    public MidnightProofRequestController(MidnightProofRequestService service) {
        this.service = service;
    }

    @PostMapping("/receivables/{receivableId}/midnight-proof-requests")
    public ResponseEntity<MidnightProofRequestResponse> create(
            @AuthenticationPrincipal String email,
            @PathVariable Long receivableId,
            @RequestBody JsonNode body
    ) {
        return response(HttpStatus.CREATED, service.create(email, receivableId, parseCreate(body)));
    }

    @GetMapping("/midnight-proof-requests")
    public ResponseEntity<List<MidnightProofRequestResponse>> getAll(
            @AuthenticationPrincipal String email,
            @RequestParam String scope
    ) {
        return response(HttpStatus.OK, service.getAll(email, scope));
    }

    @GetMapping("/midnight-proof-requests/{requestId}")
    public ResponseEntity<MidnightProofRequestResponse> getById(
            @AuthenticationPrincipal String email,
            @PathVariable String requestId
    ) {
        return response(HttpStatus.OK, service.getById(email, requestId));
    }

    @PostMapping("/midnight-proof-requests/{requestId}/deny")
    public ResponseEntity<MidnightProofRequestResponse> deny(
            @AuthenticationPrincipal String email,
            @PathVariable String requestId,
            @RequestBody(required = false) JsonNode body
    ) {
        requireNoBody(body);
        return response(HttpStatus.OK, service.deny(email, requestId));
    }

    @PostMapping("/midnight-proof-requests/{requestId}/complete")
    public ResponseEntity<MidnightProofRequestResponse> complete(
            @AuthenticationPrincipal String email,
            @PathVariable String requestId,
            @RequestBody JsonNode body
    ) {
        return response(HttpStatus.OK, service.complete(email, requestId, parseComplete(body)));
    }

    @PostMapping("/midnight-proof-requests/{requestId}/resolve")
    public ResponseEntity<MidnightProofResolveResponse> resolve(
            @AuthenticationPrincipal String email,
            @PathVariable String requestId,
            @RequestBody(required = false) JsonNode body
    ) {
        requireNoBody(body);
        return response(HttpStatus.OK, service.resolve(email, requestId));
    }

    private void requireNoBody(JsonNode body) {
        if (body != null) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "INVALID_REQUEST_BODY",
                    "이 요청에는 본문을 보내지 마세요."
            );
        }
    }

    private MidnightProofRequestCreateRequest parseCreate(JsonNode body) {
        if (body == null || !body.isObject() || !body.propertyNames().equals(CREATE_FIELDS)) {
            throw invalidBody();
        }
        JsonNode subjectRole = body.get("subjectRole");
        JsonNode minRevenue = body.get("minAnnualRevenueKrw");
        JsonNode maxDebt = body.get("maxDebtRatioBps");
        JsonNode maxOverdue = body.get("maxOverdueCount");
        JsonNode validFor = body.get("validForSeconds");
        if (subjectRole == null || !subjectRole.isString()
                || minRevenue == null || !minRevenue.isString()
                || maxDebt == null || !maxDebt.isString()
                || maxOverdue == null || !maxOverdue.isString()
                || validFor == null || !validFor.isIntegralNumber() || !validFor.canConvertToLong()) {
            throw invalidBody();
        }
        return new MidnightProofRequestCreateRequest(
                subjectRole.asString(), minRevenue.asString(), maxDebt.asString(),
                maxOverdue.asString(), validFor.asLong()
        );
    }

    private MidnightProofCompleteRequest parseComplete(JsonNode body) {
        if (body == null || !body.isObject() || !body.propertyNames().equals(COMPLETE_FIELDS)
                || body.get("proofCapability") == null || body.get("proofCapability").isNull()) {
            throw invalidBody();
        }
        return new MidnightProofCompleteRequest(body.get("proofCapability"));
    }

    private ApiException invalidBody() {
        return new ApiException(
                HttpStatus.BAD_REQUEST,
                "INVALID_REQUEST_BODY",
                "요청 본문 형식을 확인해 주세요."
        );
    }

    private <T> ResponseEntity<T> response(HttpStatus status, T body) {
        return ResponseEntity.status(status)
                .contentType(MediaType.APPLICATION_JSON)
                .cacheControl(CacheControl.noStore())
                .header("Pragma", "no-cache")
                .body(body);
    }
}
