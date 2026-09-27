package com.leonid.giwaapi.midnight;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.SecureRandom;
import java.util.HexFormat;

final class MidnightDemoKeyFile {
    private MidnightDemoKeyFile() {}

    static String loadOrCreate(Path file) {
        try {
            Files.createDirectories(file.getParent(), PosixFilePermissions.asFileAttribute(
                    PosixFilePermissions.fromString("rwx------")));
            if (!Files.exists(file, LinkOption.NOFOLLOW_LINKS)) {
                byte[] key = new byte[32];
                new SecureRandom().nextBytes(key);
                byte[] encoded = (HexFormat.of().formatHex(key) + "\n").getBytes(StandardCharsets.US_ASCII);
                try (var channel = Files.newByteChannel(file,
                        java.util.Set.of(StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE),
                        PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------")))) {
                    channel.write(java.nio.ByteBuffer.wrap(encoded));
                } catch (FileAlreadyExistsException ignored) {
                    // Another startup created the stable key; read it without replacing it.
                }
            }
            if (!Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS) || Files.size(file) > 128) throw unavailable();
            String key = Files.readString(file, StandardCharsets.US_ASCII).trim();
            if (!key.matches("^[0-9a-f]{64}$")) throw unavailable();
            return key;
        } catch (IOException | UnsupportedOperationException exception) {
            throw unavailable();
        }
    }

    private static IllegalStateException unavailable() {
        return new IllegalStateException("The stable Midnight demo capability key is unavailable. Existing keys must not be replaced.");
    }
}
