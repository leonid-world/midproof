package com.leonid.giwaapi.midnight;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "app.midnight.runtime")
public class MidnightRuntimeProperties {
    private boolean enabled;
    private String nodeExecutable = "node";
    private String runnerPath = "";
    private int publicPort = 8080;
    private long shutdownTimeoutSeconds = 30;

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public String getNodeExecutable() { return nodeExecutable; }
    public void setNodeExecutable(String nodeExecutable) { this.nodeExecutable = nodeExecutable; }
    public String getRunnerPath() { return runnerPath; }
    public void setRunnerPath(String runnerPath) { this.runnerPath = runnerPath; }
    public int getPublicPort() { return publicPort; }
    public void setPublicPort(int publicPort) { this.publicPort = publicPort; }
    public long getShutdownTimeoutSeconds() { return shutdownTimeoutSeconds; }
    public void setShutdownTimeoutSeconds(long shutdownTimeoutSeconds) { this.shutdownTimeoutSeconds = shutdownTimeoutSeconds; }
}
