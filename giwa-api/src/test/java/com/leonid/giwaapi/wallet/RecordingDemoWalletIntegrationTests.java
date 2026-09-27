package com.leonid.giwaapi.wallet;

import com.leonid.giwaapi.auth.AuthService;
import com.leonid.giwaapi.auth.JwtService;
import com.leonid.giwaapi.auth.LoginRequest;
import com.leonid.giwaapi.auth.SignupRequest;
import com.leonid.giwaapi.auth.User;
import com.leonid.giwaapi.auth.UserMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Locale;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {"app.recording-demo.enabled=true", "app.midnight.demo-enabled=true"})
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class RecordingDemoWalletIntegrationTests {
    private static final String PASSWORD = "recordingIntegrationTestPassword";
    private static final List<String> ROLES = List.of("seller", "buyer", "funder");
    private static final List<String> WALLETS = List.of(
            "0x60602ed43987ea474a85c12a4e768dc8062b4361",
            "0xf0aa8d7ca5c7e3e586dcc40397147ac98e3717bb",
            "0x3dc823dc2c1caf3c14b5b882c7e9a80cc40df9b7"
    );
    @Autowired AuthService auth;
    @Autowired UserMapper users;
    @Autowired WalletService wallets;
    @Autowired WalletMapper walletMapper;
    @Autowired JwtService jwt;
    @Autowired MockMvc mvc;

    @BeforeEach
    void seed() {
        for (int i = 0; i < ROLES.size(); i++) {
            auth.signup(new SignupRequest(email(i), PASSWORD, "Recording " + ROLES.get(i),
                    "Recording Test " + ROLES.get(i), "880000000" + i));
        }
    }

    @Test
    void eachRoleCanConnectOnlyItsFixedAddressAndRepeatedConnectionIsIdempotent() throws Exception {
        for (int i = 0; i < ROLES.size(); i++) {
            String token = auth.login(new LoginRequest(email(i), PASSWORD)).accessToken();
            String address = WALLETS.get(i);
            connect(token, "0x" + address.substring(2).toUpperCase(Locale.ROOT), 91342L, 200);
            Wallet first = walletMapper.findByWalletAddress(address).orElseThrow();
            connect(token, address, 91342L, 200);
            Wallet after = walletMapper.findByWalletAddress(address).orElseThrow();
            assertThat(after.companyWalletId()).isEqualTo(first.companyWalletId());
            assertThat(after.chainId()).isEqualTo(91342L);
        }
    }

    @Test
    void wrongMetaMaskAccountCannotOverwriteTheRoleMapping() throws Exception {
        String email = email(0);
        wallets.connect(email, new WalletConnectRequest(WALLETS.get(0), 91342L));
        String token = auth.login(new LoginRequest(email, PASSWORD)).accessToken();

        connect(token, "0x1111111111111111111111111111111111111111", 91342L, 409);
        connect(token, WALLETS.get(1), 91342L, 409);

        assertThat(wallets.me(email).walletAddress()).isEqualTo(WALLETS.get(0));
        assertThat(walletMapper.findByWalletAddress("0x1111111111111111111111111111111111111111")).isEmpty();
    }

    @Test
    void wrongNetworkCannotChangeTheStoredChain() throws Exception {
        String email = email(1);
        wallets.connect(email, new WalletConnectRequest(WALLETS.get(1), 91342L));
        String token = auth.login(new LoginRequest(email, PASSWORD)).accessToken();

        connect(token, WALLETS.get(1), 1L, 409);

        assertThat(walletMapper.findByWalletAddress(WALLETS.get(1)).orElseThrow().chainId()).isEqualTo(91342L);
    }

    @Test
    void pinsBindTheCompanyEvenForAnotherUserInThatCompany() throws Exception {
        User designated = users.findByEmail(email(2)).orElseThrow();
        User colleague = new User(null, designated.companyId(), "filming-colleague@example.com",
                designated.passwordHash(), "Filming Colleague", null);
        users.insert(colleague);

        connect(jwt.createToken(colleague), "0x2222222222222222222222222222222222222222", 91342L, 409);

        assertThat(walletMapper.findByCompanyId(designated.companyId())).isEmpty();
    }

    @Test
    void ordinaryCompanyCannotClaimReservedWalletBeforeItHasBeenConnected() throws Exception {
        var other = auth.signup(new SignupRequest("recording-other@example.com", PASSWORD,
                "Other User", "Other Company", "8800000010"));

        connect(other.accessToken(), WALLETS.get(2), 91342L, 409);

        assertThat(walletMapper.findByWalletAddress(WALLETS.get(2))).isEmpty();
    }

    @Test
    void ordinaryCompaniesRetainWalletAndNetworkChanges() throws Exception {
        String email = "recording-ordinary@example.com";
        var other = auth.signup(new SignupRequest(email, PASSWORD,
                "Ordinary User", "Ordinary Company", "8800000011"));
        String first = "0x3333333333333333333333333333333333333333";
        String second = "0x4444444444444444444444444444444444444444";
        connect(other.accessToken(), first, 1337L, 200);
        connect(other.accessToken(), second, 91342L, 200);
        assertThat(wallets.me(email).walletAddress()).isEqualTo(second);
    }

    @Test
    void walletlessDemoTokenStillCannotConnectTheCorrectRoleWallet() throws Exception {
        User user = users.findByEmail(email(0)).orElseThrow();
        connect(jwt.createDemoToken(user), WALLETS.get(0), 91342L, 403);
        assertThat(walletMapper.findByCompanyId(user.companyId())).isEmpty();
    }

    private void connect(String token, String address, long chain, int expectedStatus) throws Exception {
        var result = mvc.perform(post("/wallet/connect").header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"walletAddress\":\"" + address + "\",\"chainId\":" + chain + "}"))
                .andExpect(status().is(expectedStatus));
        if (expectedStatus == 409) {
            result.andExpect(jsonPath("$.code").value("ROLE_DEMO_WALLET_MISMATCH"));
        }
    }

    private String email(int index) {
        return ROLES.get(index) + "@midnight-demo.test";
    }
}
