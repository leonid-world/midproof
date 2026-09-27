package com.leonid.giwaapi.midnight;

interface MidnightReadClient {
    MidnightReadResult resolve(byte[] canonicalCapability, MidnightCapabilityV2 expected);
}
