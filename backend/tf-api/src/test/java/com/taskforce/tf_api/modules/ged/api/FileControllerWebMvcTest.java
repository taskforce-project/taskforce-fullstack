package com.taskforce.tf_api.modules.ged.api;

import java.io.ByteArrayInputStream;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.modules.ged.service.MinioService;
import com.taskforce.tf_api.shared.security.SecurityConfig;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Tests de tranche web du {@link FileController} (proxy MinIO) via {@code @WebMvcTest}.
 *
 * <p>Rappel sécurité (cf. SecurityConfig PUBLIC_MATCHERS) :
 * {@code /api/files/brain/**} est PUBLIC, tandis que {@code /api/files/avatars/**} n'est PAS
 * listé et tombe donc dans la chaîne authentifiée (401 sans JWT). Les endpoints renvoient un
 * {@code InputStreamResource} (pas d'enveloppe ApiResponse). MinioService et repositories mockés.
 */
@WebMvcTest(FileController.class)
@Import(SecurityConfig.class)
@ActiveProfiles("test")
@DisplayName("FileController (@WebMvcTest)")
class FileControllerWebMvcTest {

    @Autowired private MockMvc mockMvc;

    @MockitoBean private MinioService minioService;
    @MockitoBean private UserRepository userRepository;
    @MockitoBean private WorkspaceRepository workspaceRepository;
    @MockitoBean private WorkspaceMemberRepository workspaceMemberRepository;

    private static final String EMAIL = "dev@it.dev";

    private org.springframework.test.web.servlet.request.RequestPostProcessor auth() {
        return jwt().jwt(b -> b.claim("email", EMAIL));
    }

    private void stubUserFound() {
        lenient().when(userRepository.findById(7L))
            .thenReturn(Optional.of(User.builder().id(7L).email(EMAIL).avatarUrl("seed").build()));
    }

    // ---- Avatars (endpoint sécurisé) ---------------------------------------

    @Test
    @DisplayName("GET avatars/{id} (auth) → 200 + image/jpeg quand MinIO renvoie le flux")
    void getAvatar_200() throws Exception {
        stubUserFound();
        when(minioService.getObjectStream(anyString()))
            .thenReturn(new ByteArrayInputStream("img".getBytes()));

        mockMvc.perform(get("/api/files/avatars/7").with(auth()))
            .andExpect(status().isOk())
            .andExpect(header().string("Content-Type", MediaType.IMAGE_JPEG_VALUE));
    }

    @Test
    @DisplayName("GET avatars/{id} (auth) → 302 dicebear quand MinIO échoue (fallback)")
    void getAvatar_fallback_302() throws Exception {
        stubUserFound();
        when(minioService.getObjectStream(anyString()))
            .thenThrow(new RuntimeException("Minio object not found"));

        mockMvc.perform(get("/api/files/avatars/7").with(auth()))
            .andExpect(status().isFound())
            .andExpect(header().string("Location",
                org.hamcrest.Matchers.containsString("dicebear")));
    }

    @Test
    @DisplayName("GET avatars/{id} sans JWT → 401 (endpoint non public)")
    void getAvatar_unauthenticated_401() throws Exception {
        mockMvc.perform(get("/api/files/avatars/7"))
            .andExpect(status().isUnauthorized());
    }

    // ---- Brain files (endpoint PUBLIC) -------------------------------------

    @Test
    @DisplayName("GET brain/{wsId}/{name} (public, sans JWT) → 200 + Content-Type MinIO")
    void getBrainFile_200_public() throws Exception {
        when(minioService.contentType(anyString())).thenReturn("image/png");
        when(minioService.getObjectStream(anyString()))
            .thenReturn(new ByteArrayInputStream("img".getBytes()));

        mockMvc.perform(get("/api/files/brain/42/abc-diagram.png"))
            .andExpect(status().isOk())
            .andExpect(header().string("Content-Type", MediaType.IMAGE_PNG_VALUE));
    }

    @Test
    @DisplayName("GET brain/{wsId}/{name} → 404 quand l'objet MinIO est introuvable")
    void getBrainFile_notFound_404() throws Exception {
        when(minioService.contentType(anyString())).thenReturn("image/png");
        when(minioService.getObjectStream(anyString()))
            .thenThrow(new RuntimeException("Minio object not found"));

        mockMvc.perform(get("/api/files/brain/42/missing.png"))
            .andExpect(status().isNotFound());
    }
}
