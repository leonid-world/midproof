package com.leonid.giwaapi.midnight;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketException;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class LocalMidnightReadClientTests {
    private final ObjectMapper objectMapper = new ObjectMapper();
    private HttpServer server;
    private MidnightProofProperties properties;
    private MidnightCapabilityV2 capability;
    private byte[] capabilityBytes;

    @BeforeEach
    void setUp() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        properties = new MidnightProofProperties();
        properties.setReadApiUrl("http://127.0.0.1:" + server.getAddress().getPort());
        properties.setReadTimeoutMs(2000);
        JsonNode node = objectMapper.readTree(objectMapper.writeValueAsBytes(capabilityMap()));
        capability = MidnightCapabilityV2.parse(node);
        capabilityBytes = capability.canonicalBytes(objectMapper);
    }

    @AfterEach
    void tearDown() {
        if (server != null) server.stop(0);
    }

    @Test
    void postsExactV2CapabilityAndAcceptsOnlyTheFrozenSanitizedResponse() {
        server.createContext("/v2/eligibility-results/resolve", exchange -> {
            assertThat(exchange.getRequestMethod()).isEqualTo("POST");
            assertThat(exchange.getRequestBody().readAllBytes()).isEqualTo(capabilityBytes);
            respond(exchange, 200, validResponse(true), true, true);
        });
        server.start();

        MidnightReadResult result = new LocalMidnightReadClient(properties, objectMapper)
                .resolve(capabilityBytes, capability);

        assertThat(result.eligible()).isTrue();
        assertThat(result.providerId()).isEqualTo("2");
        assertThat(result.profileAsOf()).isEqualTo(capability.profileAsOf());
    }

    @Test
    void previewDemoAuthenticatesInternalReadAndRejectsAResultFromAnotherNetwork() {
        properties.setDemoEnabled(true);
        properties.setNetworkId("preview");
        properties.setInternalToken("test-midnight-internal-token-with-32-characters");
        Map<String, Object> result = validResponse(true);
        result.put("networkId", "preview");
        server.createContext("/v2/eligibility-results/resolve", exchange -> {
            assertThat(exchange.getRequestHeaders().getFirst("X-Midnight-Internal-Token"))
                    .isEqualTo(properties.getInternalToken());
            respond(exchange, 200, result, true, true);
        });
        server.start();
        LocalMidnightReadClient client = new LocalMidnightReadClient(properties, objectMapper);
        assertThat(client.resolve(capabilityBytes, capability).eligible()).isTrue();
        result.put("networkId", "undeployed");
        assertThatThrownBy(() -> client.resolve(capabilityBytes, capability))
                .isInstanceOfSatisfying(MidnightReadClientException.class,
                        error -> assertThat(error.kind()).isEqualTo(MidnightReadClientException.Kind.UNAVAILABLE));
    }

    @Test
    void hostedDemoRequiresProviderTwoButLegacyLocalStillAcceptsRegisteredProviders() {
        Map<String, Object> response = validResponse(false);
        @SuppressWarnings("unchecked")
        Map<String, Object> result = (Map<String, Object>) response.get("result");
        result.put("providerId", "1");
        server.createContext("/v2/eligibility-results/resolve", exchange ->
                respond(exchange, 200, response, true, true));
        server.start();
        LocalMidnightReadClient client = new LocalMidnightReadClient(properties, objectMapper);

        assertThat(client.resolve(capabilityBytes, capability).providerId()).isEqualTo("1");
        properties.setDemoEnabled(true);
        properties.setInternalToken("test-midnight-internal-token-with-32-characters");
        assertThatThrownBy(() -> client.resolve(capabilityBytes, capability))
                .isInstanceOfSatisfying(MidnightReadClientException.class,
                        error -> assertThat(error.kind()).isEqualTo(MidnightReadClientException.Kind.INVALID_CAPABILITY));
        result.put("providerId", "2");
        MidnightReadResult validFalse = client.resolve(capabilityBytes, capability);
        assertThat(validFalse.providerId()).isEqualTo("2");
        assertThat(validFalse.eligible()).isFalse();
    }

    @Test
    void totalDeadlineCancelsAStalledResponseBodyAndClosesItsConnection() throws Exception {
        properties.setReadTimeoutMs(200);
        CountDownLatch headersSent = new CountDownLatch(1);
        AtomicReference<Socket> accepted = new AtomicReference<>();
        var workers = Executors.newFixedThreadPool(2);
        try (ServerSocket listener = new ServerSocket()) {
            listener.bind(new InetSocketAddress("127.0.0.1", 0));
            properties.setReadApiUrl("http://127.0.0.1:" + listener.getLocalPort());
            var disconnected = workers.submit(() -> {
                try (Socket peer = listener.accept()) {
                    accepted.set(peer);
                    peer.setSoTimeout(3000);
                    var input = peer.getInputStream();
                    ByteArrayOutputStream header = new ByteArrayOutputStream();
                    while (!header.toString(StandardCharsets.US_ASCII).endsWith("\r\n\r\n")) {
                        int next = input.read();
                        if (next < 0 || header.size() > 8192) throw new IOException("Fixture request incomplete");
                        header.write(next);
                    }
                    var length = java.util.regex.Pattern.compile("(?im)^Content-Length: (\\d+)")
                            .matcher(header.toString(StandardCharsets.US_ASCII));
                    if (!length.find()) throw new IOException("Fixture body length missing");
                    input.readNBytes(Integer.parseInt(length.group(1)));
                    peer.getOutputStream().write(("HTTP/1.1 200 OK\r\nContent-Length: 100\r\n"
                            + "Content-Type: application/json\r\nCache-Control: no-store\r\n\r\n{")
                            .getBytes(StandardCharsets.US_ASCII));
                    peer.getOutputStream().flush();
                    headersSent.countDown();
                    try { return input.read() == -1; }
                    catch (SocketException closed) { return true; }
                }
            });
            LocalMidnightReadClient client = new LocalMidnightReadClient(properties, objectMapper);
            var result = workers.submit(() -> client.resolve(capabilityBytes, capability));
            try {
                assertThat(headersSent.await(2, TimeUnit.SECONDS)).isTrue();
                assertThatThrownBy(() -> result.get(1, TimeUnit.SECONDS))
                        .isInstanceOfSatisfying(ExecutionException.class, failure ->
                                assertThat(failure.getCause()).isInstanceOfSatisfying(MidnightReadClientException.class,
                                        error -> assertThat(error.kind()).isEqualTo(MidnightReadClientException.Kind.UNAVAILABLE)));
                assertThat(disconnected.get(1, TimeUnit.SECONDS)).isTrue();
            } finally {
                if (accepted.get() != null) accepted.get().close();
                result.cancel(true);
            }
        } finally {
            workers.shutdownNow();
            assertThat(workers.awaitTermination(3, TimeUnit.SECONDS)).isTrue();
        }
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void deadlineAlsoBoundsDelayedHeadersAndASlowBodyTrickle(boolean sendHeaders) throws Exception {
        properties.setReadTimeoutMs(200);
        CountDownLatch requestReceived = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        CountDownLatch finished = new CountDownLatch(1);
        server.createContext("/v2/eligibility-results/resolve", exchange -> {
            try {
                exchange.getRequestBody().readAllBytes();
                if (sendHeaders) {
                    exchange.getResponseHeaders().set("Content-Type", "application/json");
                    exchange.getResponseHeaders().set("Cache-Control", "no-store");
                    exchange.sendResponseHeaders(200, 100);
                }
                requestReceived.countDown();
                for (int attempt = 0; attempt < 50 && release.getCount() != 0; attempt++) {
                    if (sendHeaders) {
                        exchange.getResponseBody().write(' ');
                        exchange.getResponseBody().flush();
                    }
                    if (release.await(50, TimeUnit.MILLISECONDS)) break;
                }
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            } catch (IOException closedByClient) {
                // The deadline must cancel the transport, even during a trickle.
            } finally {
                exchange.close();
                finished.countDown();
            }
        });
        server.start();
        var worker = Executors.newSingleThreadExecutor();
        try {
            var result = worker.submit(() -> new LocalMidnightReadClient(properties, objectMapper)
                    .resolve(capabilityBytes, capability));
            assertThat(requestReceived.await(2, TimeUnit.SECONDS)).isTrue();
            assertThatThrownBy(() -> result.get(1, TimeUnit.SECONDS))
                    .isInstanceOfSatisfying(ExecutionException.class, failure ->
                            assertThat(failure.getCause()).isInstanceOfSatisfying(MidnightReadClientException.class,
                                    error -> assertThat(error.kind()).isEqualTo(MidnightReadClientException.Kind.UNAVAILABLE)));
        } finally {
            release.countDown();
            worker.shutdownNow();
            assertThat(worker.awaitTermination(3, TimeUnit.SECONDS)).isTrue();
            assertThat(finished.await(3, TimeUnit.SECONDS)).isTrue();
        }
    }

    @Test
    void neverFallsBackToV1OrFollowsRedirects() {
        server.createContext("/v2/eligibility-results/resolve", exchange -> {
            exchange.getResponseHeaders().set("Location", "/v1/eligibility-results/resolve");
            exchange.sendResponseHeaders(307, -1);
            exchange.close();
        });
        server.createContext("/v1/eligibility-results/resolve", exchange ->
                respond(exchange, 200, validResponse(true), true, true));
        server.start();

        assertThatThrownBy(() -> new LocalMidnightReadClient(properties, objectMapper)
                .resolve(capabilityBytes, capability))
                .isInstanceOfSatisfying(MidnightReadClientException.class,
                        error -> assertThat(error.kind()).isEqualTo(MidnightReadClientException.Kind.UNAVAILABLE));
    }

    @Test
    void rejectsContextMismatchAsInvalidCapabilityWithoutReflectingRemoteData() {
        server.createContext("/v2/eligibility-results/resolve", exchange -> {
            Map<String, Object> response = validResponse(true);
            @SuppressWarnings("unchecked")
            Map<String, Object> context = (Map<String, Object>) response.get("context");
            context.put("requestId", "0x" + "9".repeat(64));
            respond(exchange, 200, response, true, true);
        });
        server.start();

        assertThatThrownBy(() -> new LocalMidnightReadClient(properties, objectMapper)
                .resolve(capabilityBytes, capability))
                .isInstanceOfSatisfying(MidnightReadClientException.class, error -> {
                    assertThat(error.kind()).isEqualTo(MidnightReadClientException.Kind.INVALID_CAPABILITY);
                    assertThat(error).hasMessageNotContaining("999999");
                });
    }

    @Test
    void rejectsMissingNoStoreOrWrongContentTypeAndOversizedBodies() {
        server.createContext("/v2/eligibility-results/resolve", exchange ->
                respond(exchange, 200, validResponse(true), true, false));
        server.start();

        assertThatThrownBy(() -> new LocalMidnightReadClient(properties, objectMapper)
                .resolve(capabilityBytes, capability))
                .isInstanceOf(MidnightReadClientException.class);
    }

    @Test
    void rejectsOversizedSuccessfulResponseBeforeJsonParsing() {
        server.createContext("/v2/eligibility-results/resolve", exchange -> {
            byte[] body = ("{" + " ".repeat(65536) + "}").getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.getResponseHeaders().set("Cache-Control", "no-store");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();

        assertThatThrownBy(() -> new LocalMidnightReadClient(properties, objectMapper)
                .resolve(capabilityBytes, capability))
                .isInstanceOfSatisfying(MidnightReadClientException.class,
                        error -> assertThat(error.kind()).isEqualTo(MidnightReadClientException.Kind.UNAVAILABLE));
    }

    @ParameterizedTest
    @ValueSource(strings = {"INVALID_PROOF_CAPABILITY", "UNAPPROVED_ATTESTATION_PROVIDER"})
    void mapsExactBoundedCapabilityErrorToFixedInvalidCapabilityError(String code) {
        server.createContext("/v2/eligibility-results/resolve", exchange -> {
            byte[] body = ("{\"error\":{\"code\":\"" + code + "\",\"message\":\"never reflect this remote detail\"}}")
                    .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(400, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();

        assertThatThrownBy(() -> new LocalMidnightReadClient(properties, objectMapper)
                .resolve(capabilityBytes, capability))
                .isInstanceOfSatisfying(MidnightReadClientException.class, error -> {
                    assertThat(error.kind()).isEqualTo(MidnightReadClientException.Kind.INVALID_CAPABILITY);
                    assertThat(error).hasMessageNotContaining("remote detail");
                });
    }

    @Test
    void treatsIndexerLagResultNotFoundAsRetryableUnavailable() {
        server.createContext("/v2/eligibility-results/resolve", exchange -> {
            byte[] body = "{\"error\":{\"code\":\"ELIGIBILITY_RESULT_NOT_FOUND\",\"message\":\"not indexed yet\"}}"
                    .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
            exchange.sendResponseHeaders(404, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();

        assertThatThrownBy(() -> new LocalMidnightReadClient(properties, objectMapper)
                .resolve(capabilityBytes, capability))
                .isInstanceOfSatisfying(MidnightReadClientException.class, error -> {
                    assertThat(error.kind()).isEqualTo(MidnightReadClientException.Kind.UNAVAILABLE);
                    assertThat(error).hasMessageNotContaining("not indexed yet");
                });
    }

    @Test
    void treatsContractNotFoundAsRetryableUnavailable() {
        server.createContext("/v2/eligibility-results/resolve", exchange -> {
            byte[] body = "{\"error\":{\"code\":\"CONTRACT_NOT_FOUND\",\"message\":\"deployment is still synchronizing\"}}"
                    .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(404, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();

        assertThatThrownBy(() -> new LocalMidnightReadClient(properties, objectMapper)
                .resolve(capabilityBytes, capability))
                .isInstanceOfSatisfying(MidnightReadClientException.class, error -> {
                    assertThat(error.kind()).isEqualTo(MidnightReadClientException.Kind.UNAVAILABLE);
                    assertThat(error).hasMessageNotContaining("still synchronizing");
                });
    }

    @Test
    void treatsMalformedOrUnknownRemoteErrorsAsUnavailableWithoutReflectingThem() {
        server.createContext("/v2/eligibility-results/resolve", exchange -> {
            byte[] body = "{\"error\":{\"code\":\"UNKNOWN\",\"message\":\"private marker\"},\"extra\":true}"
                    .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(400, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();

        assertThatThrownBy(() -> new LocalMidnightReadClient(properties, objectMapper)
                .resolve(capabilityBytes, capability))
                .isInstanceOfSatisfying(MidnightReadClientException.class, error -> {
                    assertThat(error.kind()).isEqualTo(MidnightReadClientException.Kind.UNAVAILABLE);
                    assertThat(error).hasMessageNotContaining("private marker");
                });
    }

    private Map<String, Object> capabilityMap() {
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("version", 2);
        value.put("evaluationVersion", 2);
        value.put("midnightContractAddress", "1".repeat(64));
        value.put("companyCommitment", "0x" + "2".repeat(64));
        value.put("lookupKey", "0x" + "3".repeat(64));
        value.put("policyRequestHash", "0x" + "4".repeat(64));
        value.put("giwaChainId", "91342");
        value.put("receivableFinanceAddress", "0x" + "5".repeat(40));
        value.put("onchainReceivableId", "2");
        value.put("subjectRole", "SELLER");
        value.put("partyWallet", "0x" + "6".repeat(40));
        value.put("requestId", "0x" + "7".repeat(64));
        value.put("intendedFunderWallet", "0x" + "8".repeat(40));
        value.put("minAnnualRevenueKrw", "500000000");
        value.put("maxDebtRatioBps", "20000");
        value.put("maxOverdueCount", "1");
        value.put("profileAsOf", "1800000000");
        value.put("validUntil", "1800000300");
        return value;
    }

    private Map<String, Object> validResponse(boolean eligible) {
        Map<String, Object> context = new LinkedHashMap<>();
        context.put("giwaChainId", capability.giwaChainId());
        context.put("receivableFinanceAddress", capability.receivableFinanceAddress());
        context.put("onchainReceivableId", capability.onchainReceivableId());
        context.put("subjectRole", capability.subjectRole());
        context.put("partyWallet", capability.partyWallet());
        context.put("requestId", capability.requestId());
        context.put("intendedFunderWallet", capability.intendedFunderWallet());
        context.put("minAnnualRevenueKrw", capability.minAnnualRevenueKrw());
        context.put("maxDebtRatioBps", capability.maxDebtRatioBps());
        context.put("maxOverdueCount", capability.maxOverdueCount());
        context.put("policyRequestHash", capability.policyRequestHash());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("lookupKey", capability.lookupKey());
        result.put("eligible", eligible);
        result.put("providerId", "2");
        result.put("evaluationVersion", 2);
        result.put("profileAsOf", capability.profileAsOf());
        result.put("validUntil", capability.validUntil());

        Map<String, Object> root = new LinkedHashMap<>();
        root.put("version", 2);
        root.put("networkId", "undeployed");
        root.put("contractAddress", capability.midnightContractAddress());
        root.put("context", context);
        root.put("result", result);
        return root;
    }

    private void respond(
            HttpExchange exchange,
            int status,
            Object value,
            boolean jsonContentType,
            boolean noStore
    ) throws IOException {
        byte[] body = objectMapper.writeValueAsBytes(value);
        if (jsonContentType) exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        if (noStore) exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.sendResponseHeaders(status, body.length);
        exchange.getResponseBody().write(body);
        exchange.close();
    }
}
