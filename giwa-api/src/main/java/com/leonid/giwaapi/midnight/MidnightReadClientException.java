package com.leonid.giwaapi.midnight;

final class MidnightReadClientException extends RuntimeException {
    enum Kind { UNAVAILABLE, INVALID_CAPABILITY }

    private final Kind kind;

    MidnightReadClientException(Kind kind) {
        super("Midnight read failed");
        this.kind = kind;
    }

    MidnightReadClientException(Kind kind, Throwable cause) {
        super("Midnight read failed", cause);
        this.kind = kind;
    }

    Kind kind() { return kind; }
}
