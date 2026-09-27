package com.leonid.giwaapi.wallet;

import com.leonid.giwaapi.auth.User;
import com.leonid.giwaapi.auth.UserMapper;
import org.junit.jupiter.api.Test;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

class RecordingDemoWalletPolicyTests {
    @Test
    void disabledFeatureDoesNotReadRoleAccountsOrRestrictWallets() {
        UserMapper users = mock(UserMapper.class);
        var policy = new RecordingDemoWalletPolicy(users, false);
        var seller = new User(1L, 1L, "seller@midnight-demo.test", "unused", "Seller", null);

        policy.check(seller, "0x1111111111111111111111111111111111111111", 1L);

        verifyNoInteractions(users);
    }
}
