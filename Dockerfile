# syntax=docker/dockerfile:1

FROM midnightntwrk/proof-server:8.1.0 AS prover

# Java bytecode is portable; avoid an emulated JDK when building another CPU target.
FROM --platform=$BUILDPLATFORM eclipse-temurin:17-jdk-jammy AS java-build
WORKDIR /workspace
COPY giwa-api/gradlew giwa-api/build.gradle giwa-api/settings.gradle ./
COPY giwa-api/gradle ./gradle
RUN chmod +x gradlew
COPY giwa-api/src ./src
RUN ./gradlew --no-daemon bootJar

FROM node:22.21.1-bookworm-slim AS midnight-build
WORKDIR /workspace/giwa-midnight
COPY giwa-midnight/package.json giwa-midnight/package-lock.json ./
COPY giwa-midnight/contract/package.json ./contract/package.json
COPY giwa-midnight/api/package.json ./api/package.json
COPY giwa-midnight/attestation-api/package.json ./attestation-api/package.json
COPY giwa-midnight/cli/package.json ./cli/package.json
RUN npm ci --no-audit --no-fund
COPY giwa-midnight/ ./
RUN npm run build --workspace zkloan-credit-scorer-contract \
    && npm run build --workspace giwa-midnight-api \
    && npm run build --workspace zkloan-credit-scorer-attestation-api \
    && npm run build --workspace zkloan-credit-scorer-cli

# Preserve the official Nix closure, including its real executable paths.
# No nested Docker daemon and no assumption that the prover lives in /bin.
FROM node:22.21.1-bookworm-slim AS runtime-base
RUN apt-get update \
    && apt-get install --no-install-recommends -y openjdk-17-jre-headless gosu ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 app \
    && useradd --uid 10001 --gid app --home-dir /data --no-create-home app
COPY --from=prover /nix/store /nix/store
RUN /bin/bash -c 'for binary in /nix/store/*-ledger-8.1.0/bin/midnight-proof-server; do "$binary" --help; done'

FROM runtime-base AS runtime
WORKDIR /app
COPY --from=java-build /workspace/build/libs/app.jar /app/giwa-api/build/libs/app.jar
COPY --from=midnight-build /workspace/giwa-midnight /app/giwa-midnight
COPY scripts /app/scripts
COPY THIRD_PARTY_NOTICES.md /app/THIRD_PARTY_NOTICES.md
COPY licenses /app/licenses
RUN chmod +x /app/scripts/midnight-container-entrypoint.sh
ENV NODE_ENV=production \
    SPRING_PROFILES_ACTIVE=midnight-demo \
    MIDNIGHT_DEMO_MODE=hosted-demo \
    MIDNIGHT_NETWORK_ID=preview \
    MIDNIGHT_DEMO_STATE_DIR=/data/midnight-demo \
    XDG_CACHE_HOME=/data/cache \
    MIDNIGHT_DEMO_BOOTSTRAP=false \
    MIDNIGHT_DEMO_MANAGE_DATABASE=false \
    MIDNIGHT_PROOF_SERVER_NUM_WORKERS=1
EXPOSE 8080
ENTRYPOINT ["/app/scripts/midnight-container-entrypoint.sh"]

# Optional isolated local profile. The default hosted image remains the final
# stage below; this target is selected only by compose.yaml.
FROM runtime AS local-demo
ENTRYPOINT ["node", "/app/scripts/local-demo-entrypoint.mjs"]

FROM runtime AS hosted-default
