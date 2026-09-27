package com.leonid.giwaapi.midnight;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MidnightDemoRuntimeTests {
    @TempDir Path directory;

    @Test
    void oneRunStartsOneOwnedHelperWithMatchingAuthorityAndStopsItGracefully() throws Exception {
        Path scripts = Files.createDirectory(directory.resolve("scripts"));
        Path state = Files.createDirectory(directory.resolve("state"));
        Path runner = scripts.resolve("runner.mjs");
        Files.writeString(runner, """
                printf '%s' "$MIDNIGHT_DEMO_AUTHORITY_URL" > "$MIDNIGHT_DEMO_STATE_DIR/authority"
                printf '%s' "$MIDNIGHT_DEMO_PORT" > "$MIDNIGHT_DEMO_STATE_DIR/port"
                test ${#MIDNIGHT_DEMO_INTERNAL_TOKEN} -ge 32 || exit 2
                printf 'started\n' >> "$MIDNIGHT_DEMO_STATE_DIR/starts"
                trap 'touch "$MIDNIGHT_DEMO_STATE_DIR/stopped"; exit 0' TERM
                while :; do sleep 0.1; done
                """);
        MidnightRuntimeProperties runtimeProperties = new MidnightRuntimeProperties();
        runtimeProperties.setNodeExecutable("/bin/sh");
        runtimeProperties.setRunnerPath(runner.toString());
        runtimeProperties.setPublicPort(8080);
        MidnightProofProperties properties = new MidnightProofProperties();
        properties.setDemoEnabled(true);
        properties.setDemoStateDir(state.toString());
        MidnightDemoRuntime runtime = new MidnightDemoRuntime(runtimeProperties, properties);
        try {
            runtime.start(8081);
            awaitFile(state.resolve("starts"));
            runtime.start(8081);
            assertThat(Files.readAllLines(state.resolve("starts"))).containsExactly("started");
            assertThat(Files.readString(state.resolve("authority"))).isEqualTo("http://127.0.0.1:8081");
            assertThat(Files.readString(state.resolve("port"))).isEqualTo("8080");
        } finally {
            runtime.stop();
        }
        awaitFile(state.resolve("stopped"));
    }

    @Test
    void helpersCannotBeStartedOutsideAnExplicitDemoConfiguration() {
        MidnightDemoRuntime runtime = new MidnightDemoRuntime(new MidnightRuntimeProperties(), new MidnightProofProperties());
        assertThatThrownBy(() -> runtime.start(8081)).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("explicit demo");
    }

    private void awaitFile(Path file) throws Exception {
        long deadline = System.nanoTime() + Duration.ofSeconds(5).toNanos();
        while (!Files.exists(file) && System.nanoTime() < deadline) Thread.sleep(25);
        assertThat(file).exists();
    }
}
