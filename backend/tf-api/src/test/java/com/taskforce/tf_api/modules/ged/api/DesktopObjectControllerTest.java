package com.taskforce.tf_api.modules.ged.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;

import com.taskforce.tf_api.modules.ged.service.LocalObjectStorage;

@ExtendWith(MockitoExtension.class)
@DisplayName("DesktopObjectController — fichiers servis aux liens signés de l'app desktop")
class DesktopObjectControllerTest {

    @Mock private LocalObjectStorage storage;

    private DesktopObjectController controller() {
        return new DesktopObjectController(storage);
    }

    @Test
    @DisplayName("lien invalide ou expiré → 403, sans lire le fichier")
    void invalid_link_is_refused() {
        when(storage.isValidLink("issues/1/a.pdf", 10L, "bad")).thenReturn(false);

        ResponseEntity<InputStreamResource> response = controller().get("issues/1/a.pdf", 10L, "bad");

        assertThat(response.getStatusCode().value()).isEqualTo(403);
    }

    @Test
    @DisplayName("fichier absent → 404")
    void missing_file() {
        when(storage.isValidLink("issues/1/a.pdf", 10L, "sig")).thenReturn(true);
        when(storage.getObjectStream("issues/1/a.pdf")).thenThrow(new RuntimeException("Object not found"));

        assertThat(controller().get("issues/1/a.pdf", 10L, "sig").getStatusCode().value()).isEqualTo(404);
    }

    @ParameterizedTest(name = "{0} → {1}, {2}")
    @CsvSource({
        "image/png, inline, image/png",
        "application/pdf, inline, application/pdf",
        "image/svg+xml, attachment, application/octet-stream",
        "text/html, attachment, application/octet-stream",
        "text/plain, attachment, application/octet-stream",
    })
    @DisplayName("seuls les images matricielles et les PDF s'affichent en ligne, sans aucun script")
    void inline_only_for_safe_types(String storedType, String disposition, String servedType) {
        when(storage.isValidLink("issues/1/file", 10L, "sig")).thenReturn(true);
        when(storage.getObjectStream("issues/1/file")).thenReturn(new ByteArrayInputStream(new byte[] {1}));
        when(storage.contentType("issues/1/file")).thenReturn(storedType);

        ResponseEntity<InputStreamResource> response = controller().get("issues/1/file", 10L, "sig");

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getHeaders().getFirst(HttpHeaders.CONTENT_DISPOSITION)).startsWith(disposition);
        assertThat(response.getHeaders().getContentType().toString()).isEqualTo(servedType);
        assertThat(response.getHeaders().getFirst("Content-Security-Policy")).contains("default-src 'none'", "sandbox");
    }
}
