package com.taskforce.tf_api.modules.ged.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

@DisplayName("LocalObjectStorage — fichiers de l'app desktop et liens signés")
class LocalObjectStorageTest {

    private static final Instant NOW = Instant.parse("2026-10-19T12:00:00Z");
    private static final String KEY = "tfd_" + "k".repeat(40);

    @TempDir Path dataDir;

    private LocalObjectStorage storage(Instant now) {
        return new LocalObjectStorage(dataDir.resolve("files"), KEY, "http://127.0.0.1:51000/", Clock.fixed(now, ZoneOffset.UTC));
    }

    private static InputStream text(String value) {
        return new ByteArrayInputStream(value.getBytes(StandardCharsets.UTF_8));
    }

    @Test
    @DisplayName("un fichier envoyé se relit, avec son type de contenu")
    void round_trip() throws Exception {
        LocalObjectStorage storage = storage(NOW);

        storage.upload("issues/1/note.txt", text("hello"), 5, "text/plain");

        try (InputStream in = storage.getObjectStream("issues/1/note.txt")) {
            assertThat(new String(in.readAllBytes(), StandardCharsets.UTF_8)).isEqualTo("hello");
        }
        assertThat(storage.contentType("issues/1/note.txt")).isEqualTo("text/plain");
        assertThat(Files.exists(dataDir.resolve("files/issues/1/note.txt"))).isTrue();
    }

    @Test
    @DisplayName("sans type connu : application/octet-stream")
    void default_content_type() {
        LocalObjectStorage storage = storage(NOW);
        storage.upload("avatars/1/a.bin", text("x"), 1, " ");

        assertThat(storage.contentType("avatars/1/a.bin")).isEqualTo("application/octet-stream");
        assertThat(storage.contentType("avatars/1/missing.bin")).isEqualTo("application/octet-stream");
    }

    @Test
    @DisplayName("la suppression retire le fichier et son type ; un fichier absent ne gêne pas")
    void delete() {
        LocalObjectStorage storage = storage(NOW);
        storage.upload("issues/1/note.txt", text("hello"), 5, "text/plain");

        storage.delete("issues/1/note.txt");

        assertThat(Files.exists(dataDir.resolve("files/issues/1/note.txt"))).isFalse();
        assertThat(Files.exists(dataDir.resolve("files/issues/1/note.txt.content-type"))).isFalse();
        assertThatCode(() -> storage.delete("issues/1/note.txt")).doesNotThrowAnyException();
        assertThatThrownBy(() -> storage.getObjectStream("issues/1/note.txt")).isInstanceOf(RuntimeException.class);
    }

    @Test
    @DisplayName("le lien de téléchargement vise la route locale, signé pour une heure")
    void signed_link() {
        LocalObjectStorage storage = storage(NOW);

        URI link = URI.create(storage.presignedGetUrl("issues/1/rapport final.pdf"));
        Map<String, String> query = query(link);

        assertThat(link.getScheme() + "://" + link.getAuthority() + link.getPath())
            .isEqualTo("http://127.0.0.1:51000" + LocalObjectStorage.OBJECT_ROUTE);
        assertThat(query.get("key")).isEqualTo("issues/1/rapport final.pdf");
        long expires = Long.parseLong(query.get("expires"));
        assertThat(expires).isEqualTo(NOW.plus(LocalObjectStorage.LINK_LIFETIME).getEpochSecond());
        assertThat(storage.isValidLink(query.get("key"), expires, query.get("signature"))).isTrue();

        assertThat(storage.isValidLink("issues/1/autre.pdf", expires, query.get("signature"))).isFalse();
        assertThat(storage.isValidLink(query.get("key"), expires + 1, query.get("signature"))).isFalse();
        assertThat(storage.isValidLink(query.get("key"), expires, "0".repeat(64))).isFalse();
        assertThat(storage.isValidLink(query.get("key"), expires, null)).isFalse();
        // Une heure plus tard, le même lien a expiré.
        assertThat(storage(NOW.plusSeconds(3601)).isValidLink(query.get("key"), expires, query.get("signature"))).isFalse();
    }

    @ParameterizedTest(name = "clé « {0} » refusée")
    @ValueSource(strings = {"../outside.txt", "issues/../../outside.txt", "C:/Windows/win.ini", "/etc/passwd", " ",
        "issues/1/note.txt.content-type"})
    @DisplayName("une clé ne sort jamais du dossier des fichiers")
    void keys_stay_inside(String key) {
        LocalObjectStorage storage = storage(NOW);
        assertThatThrownBy(() -> storage.resolve(key)).isInstanceOf(IllegalArgumentException.class);
    }

    private static Map<String, String> query(URI link) {
        Map<String, String> query = new HashMap<>();
        for (String pair : link.getRawQuery().split("&")) {
            String[] kv = pair.split("=", 2);
            query.put(kv[0], java.net.URLDecoder.decode(kv[1], StandardCharsets.UTF_8));
        }
        return query;
    }
}
