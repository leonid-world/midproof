package com.leonid.giwaapi.midnight;

import java.nio.file.Files;
import java.nio.file.Path;

final class MidnightDemoPaths {
    private MidnightDemoPaths() {}

    static Path projectRoot() {
        Path directory = Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize();
        while (directory != null) {
            if (Files.isDirectory(directory.resolve("giwa-api"))
                    && Files.isDirectory(directory.resolve("giwa-midnight"))) return directory;
            directory = directory.getParent();
        }
        throw new IllegalStateException("The Midnight demo workspace was not found. Configure its state directory and runner path.");
    }

    static Path stateDirectory(String configured) {
        return configured == null || configured.isBlank()
                ? projectRoot().resolve(".local/midnight-demo")
                : Path.of(configured).toAbsolutePath().normalize();
    }
}
