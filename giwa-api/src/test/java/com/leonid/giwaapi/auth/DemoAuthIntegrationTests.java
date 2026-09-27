package com.leonid.giwaapi.auth;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {"app.midnight.demo-enabled=true", "app.midnight.internal-token=demo-internal-test-token-at-least-32-characters"})
@AutoConfigureMockMvc
@ActiveProfiles("test")
class DemoAuthIntegrationTests {
    private static final String INTERNAL = "demo-internal-test-token-at-least-32-characters";
    @Autowired MockMvc mvc;
    @Autowired AuthService auth;
    @Autowired UserMapper users;
    @Autowired JwtService jwt;
    @Autowired ObjectMapper json;

    @BeforeEach
    void seed() {
        if (users.findByEmail("seller@midnight-demo.test").isEmpty()) {
            auth.signup(new SignupRequest("seller@midnight-demo.test", "testPassword123!", "Demo Seller", "Synthetic Seller", "1234567890"));
        }
    }

    String demoToken() throws Exception {
        String body = mvc.perform(post("/auth/demo-login").contentType(MediaType.APPLICATION_JSON).content("{\"role\":\"SELLER\"}"))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andReturn().getResponse().getContentAsString();
        return json.readTree(body).get("accessToken").asString();
    }

    @Test
    void eachVisitHasDistinctSignedSessionAndBoundedExpiry() throws Exception {
        var first = jwt.extractSession(demoToken());
        var second = jwt.extractSession(demoToken());
        assertThat(first.email()).isEqualTo("seller@midnight-demo.test");
        assertThat(first.demo()).isTrue();
        assertThat(first.sessionId()).isNotEqualTo(second.sessionId());
        assertThat(first.expiresAt()).isBetween(Instant.now().getEpochSecond(), Instant.now().getEpochSecond() + 7200);
    }

    @Test
    void demoMayReadIdentityButCannotUseAnyAssetOrOrdinaryProofApi() throws Exception {
        String token = demoToken();
        mvc.perform(get("/auth/me").header("Authorization", "Bearer " + token)).andExpect(status().isOk());
        for (String path : new String[]{"/wallet/me", "/receivables", "/receivables/funding-opportunities", "/midnight-proof-requests"}) {
            mvc.perform(get(path).header("Authorization", "Bearer " + token)).andExpect(status().isForbidden());
        }
        for (String path : new String[]{"/wallet/connect", "/receivables", "/receivables/1/funded", "/receivables/1/repaid", "/blockchain-transactions", "/internal/midnight/authorize"}) {
            mvc.perform(post(path).header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content("{}"))
                    .andExpect(status().isForbidden());
        }
    }

    @Test
    void authorityRequiresSignedDemoScopeAndInternalCredential() throws Exception {
        String token = demoToken();
        mvc.perform(post("/internal/midnight/demo-authority").header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"operation\":\"start\"}"))
                .andExpect(status().isForbidden());
        String normal = auth.login(new LoginRequest("seller@midnight-demo.test", "testPassword123!")).accessToken();
        mvc.perform(post("/internal/midnight/demo-authority").header("Authorization", "Bearer " + normal)
                .header("X-Midnight-Internal-Token", INTERNAL).contentType(MediaType.APPLICATION_JSON).content("{\"operation\":\"start\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/internal/midnight/demo-authority").header("Authorization", "Bearer " + token)
                .header("X-Midnight-Internal-Token", INTERNAL).contentType(MediaType.APPLICATION_JSON).content("{\"operation\":\"start\"}"))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.sessionId").value(jwt.extractSession(token).sessionId()))
                .andExpect(jsonPath("$.demo").value(true));
    }

    @Test
    void authorityRejectsRemoteCallsAndUnexpectedFields() throws Exception {
        String token = demoToken();
        mvc.perform(post("/internal/midnight/demo-authority").with(request -> { request.setRemoteAddr("10.0.0.5"); return request; })
                .header("Authorization", "Bearer " + token).header("X-Midnight-Internal-Token", INTERNAL)
                .contentType(MediaType.APPLICATION_JSON).content("{\"operation\":\"status\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/internal/midnight/demo-authority").header("Authorization", "Bearer " + token)
                .header("X-Midnight-Internal-Token", INTERNAL).contentType(MediaType.APPLICATION_JSON)
                .content("{\"operation\":\"start\",\"userId\":\"999\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void loginDoesNotAcceptArbitraryIdentityOrPrivateValues() throws Exception {
        for (String body : new String[]{"{\"role\":\"ADMIN\"}", "{\"role\":\"SELLER\",\"email\":\"other@test\"}", "{\"role\":\"SELLER\",\"annualRevenueKrw\":\"1\"}"}) {
            mvc.perform(post("/auth/demo-login").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isBadRequest());
        }
    }

    @Test
    void normalLoginRetainsAppAccessAndHasNoDemoSession() throws Exception {
        String token = auth.login(new LoginRequest("seller@midnight-demo.test", "testPassword123!")).accessToken();
        assertThat(jwt.extractSession(token).demo()).isFalse();
        mvc.perform(get("/receivables").header("Authorization", "Bearer " + token)).andExpect(status().isOk());
    }
}
