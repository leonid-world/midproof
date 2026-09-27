package com.leonid.giwaapi.midnight;

import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CancellationException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.regex.Pattern;

@Component
class LocalMidnightReadClient implements MidnightReadClient {
    private static final int MAX_RESPONSE_BYTES = 65536;
    private static final Pattern DECIMAL = Pattern.compile("^(0|[1-9][0-9]*)$");
    private static final Pattern JSON_CONTENT_TYPE = Pattern.compile(
            "^application/json(?:\\s*;\\s*charset=utf-8)?$", Pattern.CASE_INSENSITIVE
    );
    private static final BigInteger UINT16_MAX = new BigInteger("65535");
    private static final Set<String> ROOT_FIELDS = Set.of(
            "version", "networkId", "contractAddress", "context", "result"
    );
    private static final Set<String> CONTEXT_FIELDS = Set.of(
            "giwaChainId", "receivableFinanceAddress", "onchainReceivableId",
            "subjectRole", "partyWallet", "requestId", "intendedFunderWallet",
            "minAnnualRevenueKrw", "maxDebtRatioBps", "maxOverdueCount",
            "policyRequestHash"
    );
    private static final Set<String> RESULT_FIELDS = Set.of(
            "lookupKey", "eligible", "providerId", "evaluationVersion",
            "profileAsOf", "validUntil"
    );
    private static final Set<String> ERROR_ROOT_FIELDS = Set.of("error");
    private static final Set<String> ERROR_FIELDS = Set.of("code", "message");
    private static final Set<String> INVALID_CAPABILITY_CODES = Set.of(
            "UNAPPROVED_CONTRACT_ADDRESS", "INVALID_PROOF_CAPABILITY",
            "UNAPPROVED_GIWA_CONTEXT", "CAPABILITY_LOOKUP_MISMATCH",
            "CAPABILITY_RESULT_MISMATCH", "PROOF_RESULT_EXPIRED", "UNAPPROVED_ATTESTATION_PROVIDER"
    );
    private static final Set<String> RETRYABLE_NOT_FOUND_CODES = Set.of(
            "ELIGIBILITY_RESULT_NOT_FOUND", "CONTRACT_NOT_FOUND"
    );

    private final MidnightProofProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    LocalMidnightReadClient(MidnightProofProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(timeoutMs()))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
    }

    @Override
    public MidnightReadResult resolve(byte[] canonicalCapability, MidnightCapabilityV2 expected) {
        BoundedResponseBody subscriber = new BoundedResponseBody();
        CompletableFuture<HttpResponse<byte[]>> exchange = null;
        try {
            if (canonicalCapability == null || canonicalCapability.length == 0 || canonicalCapability.length > 16384) {
                throw new MidnightReadClientException(MidnightReadClientException.Kind.INVALID_CAPABILITY);
            }
            URI endpoint = endpoint();
            HttpRequest.Builder builder = HttpRequest.newBuilder(endpoint)
                    .timeout(Duration.ofMillis(timeoutMs()))
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofByteArray(canonicalCapability));
            if (properties.isDemoEnabled()) {
                builder.header("X-Midnight-Internal-Token", properties.getInternalToken());
            }
            HttpRequest request = builder.build();
            // Keep the deadline active until the bounded body is complete. An
            // InputStream body handler returns at headers and can block forever.
            exchange = httpClient.sendAsync(request, ignored -> subscriber);
            HttpResponse<byte[]> response = exchange.get(timeoutMs(), TimeUnit.MILLISECONDS);
            byte[] body = response.body();
            if (response.statusCode() >= 400 && response.statusCode() < 500) {
                throw classifyClientError(response.statusCode(), body, response.headers()
                        .firstValue("Content-Type").orElse(""));
            }
            if (response.statusCode() < 200 || response.statusCode() >= 300) throw unavailable();
            String contentType = response.headers().firstValue("Content-Type").orElse("");
            if (!JSON_CONTENT_TYPE.matcher(contentType).matches()) throw unavailable();
            String cacheControl = response.headers().firstValue("Cache-Control").orElse("");
            boolean noStore = java.util.Arrays.stream(cacheControl.split(","))
                    .map(String::trim)
                    .anyMatch(directive -> directive.equalsIgnoreCase("no-store"));
            if (!noStore) throw unavailable();
            return parse(body, expected);
        } catch (MidnightReadClientException exception) {
            throw exception;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new MidnightReadClientException(MidnightReadClientException.Kind.UNAVAILABLE, exception);
        } catch (ExecutionException | TimeoutException | CancellationException | IllegalArgumentException exception) {
            throw new MidnightReadClientException(MidnightReadClientException.Kind.UNAVAILABLE, exception);
        } finally {
            // Cancellation closes the transport, not just the caller's wait.
            subscriber.cancel();
            if (exchange != null) exchange.cancel(true);
        }
    }

    private static final class BoundedResponseBody implements HttpResponse.BodySubscriber<byte[]> {
        private final CompletableFuture<byte[]> body = new CompletableFuture<>();
        private final ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        private Flow.Subscription subscription;
        private boolean finished;

        @Override
        public CompletionStage<byte[]> getBody() { return body; }

        @Override
        public synchronized void onSubscribe(Flow.Subscription incoming) {
            if (subscription != null || finished) {
                incoming.cancel();
                return;
            }
            subscription = incoming;
            incoming.request(1);
        }

        @Override
        public synchronized void onNext(List<ByteBuffer> chunks) {
            if (finished) return;
            for (ByteBuffer chunk : chunks) {
                if (chunk.remaining() > MAX_RESPONSE_BYTES - bytes.size()) {
                    fail(new IOException("Midnight response exceeded its byte limit"));
                    return;
                }
                byte[] part = new byte[chunk.remaining()];
                chunk.get(part);
                bytes.writeBytes(part);
            }
            subscription.request(1);
        }

        @Override
        public synchronized void onError(Throwable error) { fail(error); }

        @Override
        public synchronized void onComplete() {
            if (finished) return;
            finished = true;
            body.complete(bytes.toByteArray());
        }

        synchronized void cancel() { fail(new IOException("Midnight response cancelled")); }

        private void fail(Throwable error) {
            if (finished) return;
            finished = true;
            if (subscription != null) subscription.cancel();
            body.completeExceptionally(error);
        }
    }

    private MidnightReadClientException classifyClientError(int status, byte[] body, String contentType) {
        if (!JSON_CONTENT_TYPE.matcher(contentType).matches()) return unavailable();
        try {
            JsonNode root = objectMapper.readTree(body);
            MidnightCapabilityV2.requireExactObject(root, ERROR_ROOT_FIELDS);
            JsonNode error = root.get("error");
            MidnightCapabilityV2.requireExactObject(error, ERROR_FIELDS);
            JsonNode codeNode = error.get("code");
            JsonNode messageNode = error.get("message");
            if (codeNode == null || !codeNode.isString()
                    || messageNode == null || !messageNode.isString()) return unavailable();
            String code = codeNode.asString();
            if (status == 404 && RETRYABLE_NOT_FOUND_CODES.contains(code)) return unavailable();
            if ((status == 400 || status == 404 || status == 410)
                    && INVALID_CAPABILITY_CODES.contains(code)) {
                return new MidnightReadClientException(MidnightReadClientException.Kind.INVALID_CAPABILITY);
            }
            return unavailable();
        } catch (RuntimeException exception) {
            return unavailable();
        }
    }

    private MidnightReadResult parse(byte[] body, MidnightCapabilityV2 expected) {
        try {
            JsonNode root = objectMapper.readTree(body);
            MidnightCapabilityV2.requireExactObject(root, ROOT_FIELDS);
            MidnightCapabilityV2.exactInt(root, "version", 2);
            JsonNode networkId = root.get("networkId");
            if (networkId == null || !networkId.isString()
                    || !networkId.asString().equals(properties.getNetworkId())) {
                throw unavailable();
            }
            requireEqual(root, "contractAddress", expected.midnightContractAddress());

            JsonNode context = root.get("context");
            MidnightCapabilityV2.requireExactObject(context, CONTEXT_FIELDS);
            requireEqual(context, "giwaChainId", expected.giwaChainId());
            requireEqual(context, "receivableFinanceAddress", expected.receivableFinanceAddress());
            requireEqual(context, "onchainReceivableId", expected.onchainReceivableId());
            requireEqual(context, "subjectRole", expected.subjectRole());
            requireEqual(context, "partyWallet", expected.partyWallet());
            requireEqual(context, "requestId", expected.requestId());
            requireEqual(context, "intendedFunderWallet", expected.intendedFunderWallet());
            requireEqual(context, "minAnnualRevenueKrw", expected.minAnnualRevenueKrw());
            requireEqual(context, "maxDebtRatioBps", expected.maxDebtRatioBps());
            requireEqual(context, "maxOverdueCount", expected.maxOverdueCount());
            requireEqual(context, "policyRequestHash", expected.policyRequestHash());

            JsonNode result = root.get("result");
            MidnightCapabilityV2.requireExactObject(result, RESULT_FIELDS);
            requireEqual(result, "lookupKey", expected.lookupKey());
            JsonNode eligible = result.get("eligible");
            if (eligible == null || !eligible.isBoolean()) throw unavailable();
            String providerId = string(result, "providerId", DECIMAL);
            BigInteger parsedProviderId = new BigInteger(providerId);
            if (parsedProviderId.signum() <= 0 || parsedProviderId.compareTo(UINT16_MAX) > 0) throw unavailable();
            // The hosted synthetic demo promises the Provider 2 role-consent
            // flow. Generic local deployments retain their registered-provider policy.
            if (properties.isDemoEnabled() && !providerId.equals("2")) {
                throw new MidnightReadClientException(MidnightReadClientException.Kind.INVALID_CAPABILITY);
            }
            int evaluationVersion = MidnightCapabilityV2.exactInt(result, "evaluationVersion", 2);
            requireEqual(result, "profileAsOf", expected.profileAsOf());
            requireEqual(result, "validUntil", expected.validUntil());
            return new MidnightReadResult(
                    eligible.asBoolean(), providerId, evaluationVersion,
                    expected.profileAsOf(), expected.validUntil()
            );
        } catch (MidnightReadClientException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw unavailable();
        }
    }

    private void requireEqual(JsonNode object, String field, String expected) {
        JsonNode node = object.get(field);
        if (node == null || !node.isString() || !node.asString().equals(expected)) {
            throw new MidnightReadClientException(MidnightReadClientException.Kind.INVALID_CAPABILITY);
        }
    }

    private String string(JsonNode object, String field, Pattern pattern) {
        JsonNode node = object.get(field);
        if (node == null || !node.isString() || !pattern.matcher(node.asString()).matches()) throw unavailable();
        return node.asString();
    }

    private URI endpoint() {
        URI root = URI.create(properties.getReadApiUrl());
        String host = root.getHost();
        boolean loopback = "127.0.0.1".equals(host) || "localhost".equalsIgnoreCase(host) || "::1".equals(host);
        String path = root.getPath();
        if (!"http".equalsIgnoreCase(root.getScheme()) || !loopback || root.getPort() < 1
                || root.getUserInfo() != null || root.getQuery() != null || root.getFragment() != null
                || (path != null && !path.isEmpty() && !path.equals("/"))) {
            throw unavailable();
        }
        return root.resolve("/v2/eligibility-results/resolve");
    }

    private long timeoutMs() {
        long configured = properties.getReadTimeoutMs();
        return configured > 0 && configured <= 30000 ? configured : 10000L;
    }

    private MidnightReadClientException unavailable() {
        return new MidnightReadClientException(MidnightReadClientException.Kind.UNAVAILABLE);
    }
}
