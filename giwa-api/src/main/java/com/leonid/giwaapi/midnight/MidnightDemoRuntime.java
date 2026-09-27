package com.leonid.giwaapi.midnight;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.boot.web.server.context.WebServerApplicationContext;
import org.springframework.context.event.ContextClosedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/** The IDE owns this one child. The child owns the prover and all Node helpers. */
@Component
@ConditionalOnProperty(name = "app.midnight.runtime.enabled", havingValue = "true")
class MidnightDemoRuntime {
    private static final Logger log = LoggerFactory.getLogger(MidnightDemoRuntime.class);
    private final MidnightRuntimeProperties runtime;
    private final MidnightProofProperties midnight;
    private Process child;
    private boolean stopping;

    MidnightDemoRuntime(MidnightRuntimeProperties runtime, MidnightProofProperties midnight) {
        this.runtime = runtime;
        this.midnight = midnight;
    }

    @EventListener
    synchronized void start(ApplicationReadyEvent event) {
        if (!(event.getApplicationContext() instanceof WebServerApplicationContext webContext)) return;
        start(webContext.getWebServer().getPort());
    }

    synchronized void start(int springPort) {
        if (child != null) return;
        if (!midnight.isDemoEnabled()) throw new IllegalStateException("Midnight helpers require the explicit demo profile.");
        Path script = runtime.getRunnerPath().isBlank()
                ? MidnightDemoPaths.projectRoot().resolve("scripts/midnight-demo.mjs")
                : Path.of(runtime.getRunnerPath()).toAbsolutePath().normalize();
        if (!Files.isRegularFile(script)) throw new IllegalStateException("The Midnight demo runner is unavailable.");
        if (runtime.getPublicPort() < 1 || runtime.getPublicPort() > 65535
                || runtime.getPublicPort() == springPort) {
            throw new IllegalStateException("The Midnight gateway requires a separate valid port.");
        }
        ProcessBuilder builder = new ProcessBuilder(runtime.getNodeExecutable(), script.toString(), "--mode=helpers");
        builder.directory(script.getParent().getParent().toFile());
        Map<String, String> environment = builder.environment();
        environment.put("MIDNIGHT_DEMO_PORT", Integer.toString(runtime.getPublicPort()));
        environment.put("MIDNIGHT_DEMO_STATE_DIR", midnight.stateDirectory().toString());
        environment.put("MIDNIGHT_DEMO_INTERNAL_TOKEN", midnight.getInternalToken());
        environment.put("MIDNIGHT_DEMO_AUTHORITY_URL", "http://127.0.0.1:" + springPort);
        environment.put("MIDNIGHT_SPRING_PORT", Integer.toString(springPort));
        environment.put("MIDNIGHT_DEMO_MODE", "hosted-demo");
        environment.put("MIDNIGHT_NETWORK_ID", midnight.getNetworkId());
        builder.inheritIO();
        try {
            child = builder.start();
            child.onExit().thenAccept(process -> {
                synchronized (this) {
                    if (!stopping) log.error("Midnight demo helpers stopped (exit {}). Proof service is unavailable; restart the demo Run.", process.exitValue());
                }
            });
            log.info("Midnight demo helpers are starting. Their gateway opens after database and prover startup; wallet setup continues automatically.");
        } catch (IOException exception) {
            throw new IllegalStateException("The Midnight demo runner could not start. Check the configured Node executable.");
        }
    }

    @EventListener
    void stop(ContextClosedEvent event) {
        stop();
    }

    synchronized void stop() {
        if (child == null || !child.isAlive()) return;
        stopping = true;
        // Capture only this runner's descendants; never stop unrelated local programs.
        var descendants = child.descendants().toList();
        child.destroy();
        try {
            long timeout = Math.max(1, Math.min(30, runtime.getShutdownTimeoutSeconds()));
            if (!child.waitFor(timeout, TimeUnit.SECONDS)) {
                descendants.stream().filter(ProcessHandle::isAlive).forEach(ProcessHandle::destroy);
                child.destroyForcibly();
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            descendants.stream().filter(ProcessHandle::isAlive).forEach(ProcessHandle::destroy);
            child.destroyForcibly();
        }
    }
}
