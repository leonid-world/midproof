package com.leonid.giwaapi.wallet;

import com.leonid.giwaapi.auth.User;
import com.leonid.giwaapi.auth.UserMapper;
import com.leonid.giwaapi.common.error.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import java.util.List;

/** Public test-wallet pins for the owner's opt-in GIWA recording accounts. No signing. */
@Component
public class RecordingDemoWalletPolicy {
    private static final long CHAIN_ID = 91342L;
    private static final List<RoleAccount> ACCOUNTS = List.of(
            new RoleAccount("seller@midnight-demo.test", "0x60602ed43987ea474a85c12a4e768dc8062b4361"),
            new RoleAccount("buyer@midnight-demo.test", "0xf0aa8d7ca5c7e3e586dcc40397147ac98e3717bb"),
            new RoleAccount("funder@midnight-demo.test", "0x3dc823dc2c1caf3c14b5b882c7e9a80cc40df9b7")
    );

    private final UserMapper users;
    private final boolean enabled;

    public RecordingDemoWalletPolicy(UserMapper users,
                                     @Value("${app.recording-demo.enabled:false}") boolean enabled) {
        this.users = users;
        this.enabled = enabled;
    }

    public void check(User actor, String normalizedWalletAddress, Long chainId) {
        if (!enabled) return;

        for (RoleAccount account : ACCOUNTS) {
            boolean ownsRole = users.findByEmail(account.email())
                    .map(user -> user.companyId().equals(actor.companyId())).orElse(false);
            boolean requestsRoleWallet = account.walletAddress().equals(normalizedWalletAddress);
            if (ownsRole && (!requestsRoleWallet || !Long.valueOf(CHAIN_ID).equals(chainId))
                    || !ownsRole && requestsRoleWallet) {
                throw new ApiException(HttpStatus.CONFLICT, "ROLE_DEMO_WALLET_MISMATCH",
                        "촬영용 역할 계정은 지정된 MetaMask 지갑과 GIWA Sepolia 네트워크만 사용할 수 있습니다.");
            }
        }
    }

    private record RoleAccount(String email, String walletAddress) {}
}
