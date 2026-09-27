package com.leonid.giwaapi.receivable;

import com.leonid.giwaapi.auth.AuthResponse;
import com.leonid.giwaapi.auth.AuthService;
import com.leonid.giwaapi.auth.SignupRequest;
import com.leonid.giwaapi.wallet.WalletConnectRequest;
import com.leonid.giwaapi.wallet.WalletService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = "app.midnight.demo-enabled=true")
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class ReceivableDemoAmountIntegrationTests {

    @Autowired
    private AuthService authService;

    @Autowired
    private WalletService walletService;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private String sellerToken;

    @BeforeEach
    void prepareCompanies() {
        AuthResponse seller = authService.signup(new SignupRequest(
                "amount-seller@example.com", "password123", "Seller", "Amount Seller", "8111111111"
        ));
        authService.signup(new SignupRequest(
                "amount-buyer@example.com", "password123", "Buyer", "Amount Buyer", "8222222222"
        ));
        walletService.connect("amount-seller@example.com", new WalletConnectRequest(
                "0x8111111111111111111111111111111111111111", 91342L
        ));
        walletService.connect("amount-buyer@example.com", new WalletConnectRequest(
                "0x8222222222222222222222222222222222222222", 91342L
        ));
        sellerToken = seller.accessToken();
    }

    @Test
    void exposesExactIntegerPolicyOnlyToAuthenticatedUsers() throws Exception {
        mockMvc.perform(get("/receivables/amount-policy"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/receivables/amount-policy")
                        .header("Authorization", "Bearer " + sellerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.demoEnabled").value(true))
                .andExpect(jsonPath("$.tokenSymbol").value("mKRW"))
                .andExpect(jsonPath("$.tokenDecimals").value(0))
                .andExpect(jsonPath("$.minAmount").value("1"))
                .andExpect(jsonPath("$.maxFaceValue").value("10000"))
                .andExpect(jsonPath("$.maxFundingAmount").value("10000"))
                .andExpect(jsonPath("$.suggestedFaceValue").value("1000"))
                .andExpect(jsonPath("$.suggestedFundingAmount").value("900"));
    }

    @Test
    void acceptsOneMkrwAndExactTenThousandMkrwBoundary() throws Exception {
        for (String amount : new String[]{"1", "10000"}) {
            mockMvc.perform(post("/receivables")
                            .header("Authorization", "Bearer " + sellerToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(requestBody(amount, amount)))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.faceValue").value(amount))
                    .andExpect(jsonPath("$.fundingAmount").value(amount))
                    .andExpect(jsonPath("$.status").value("CREATED"));
        }
        assertThat(rowCount("receivables")).isEqualTo(2);
        assertThat(rowCount("receivable_status_history")).isEqualTo(2);
    }

    @Test
    void rejectsCapPlusOneAndLargeIntegerWithoutInsertingAnyDebt() throws Exception {
        for (String amount : new String[]{"10001", "999999999999999999999999999999999999"}) {
            mockMvc.perform(post("/receivables")
                            .header("Authorization", "Bearer " + sellerToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(requestBody(amount, "1")))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("DEMO_RECEIVABLE_AMOUNT_LIMIT_EXCEEDED"));
        }
        assertThat(rowCount("receivables")).isZero();
        assertThat(rowCount("receivable_status_history")).isZero();
    }

    @Test
    void rejectsZeroNegativeAndFractionalValuesInEitherAmount() throws Exception {
        for (String amount : new String[]{"0", "-1", "1.5"}) {
            for (String body : new String[]{requestBody(amount, "1"), requestBody("100", amount)}) {
                mockMvc.perform(post("/receivables")
                                .header("Authorization", "Bearer " + sellerToken)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(body))
                        .andExpect(status().isBadRequest())
                        .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
            }
        }
        assertThat(rowCount("receivables")).isZero();
        assertThat(rowCount("receivable_status_history")).isZero();
    }

    @Test
    void rejectsFundingAboveFaceValueEvenWhenBothAreWithinTheCap() throws Exception {
        mockMvc.perform(post("/receivables")
                        .header("Authorization", "Bearer " + sellerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody("1000", "1001")))
                .andExpect(status().isBadRequest());
        assertThat(rowCount("receivables")).isZero();
        assertThat(rowCount("receivable_status_history")).isZero();
    }

    private int rowCount(String table) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM " + table, Integer.class);
    }

    private String requestBody(String faceValue, String fundingAmount) {
        return """
                {
                  "buyerBusinessNumber": "8222222222",
                  "faceValue": "%s",
                  "fundingAmount": "%s",
                  "issueDate": "2026-09-17",
                  "maturityDate": "2026-10-17"
                }
                """.formatted(faceValue, fundingAmount);
    }
}
