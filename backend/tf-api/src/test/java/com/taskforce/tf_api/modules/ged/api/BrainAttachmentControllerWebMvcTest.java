package com.taskforce.tf_api.modules.ged.api;

import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;
import com.taskforce.tf_api.modules.ged.service.MinioService;
import com.taskforce.tf_api.shared.security.SecurityConfig;

import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Tests de tranche web du {@link BrainAttachmentController} (upload Brain OS → MinIO) via
 * {@code @WebMvcTest}. Couvre l'upload multipart (contrat HTTP + enveloppe ApiResponse) et le
 * rejet non authentifié. MinioService, BrainAccessGuard et repositories mockés.
 */
@WebMvcTest(BrainAttachmentController.class)
@Import(SecurityConfig.class)
@ActiveProfiles("test")
@DisplayName("BrainAttachmentController (@WebMvcTest)")
class BrainAttachmentControllerWebMvcTest {

    @Autowired private MockMvc mockMvc;

    @MockitoBean private MinioService minioService;
    @MockitoBean private BrainAccessGuard access;
    @MockitoBean private UserRepository userRepository;
    @MockitoBean private WorkspaceRepository workspaceRepository;
    @MockitoBean private WorkspaceMemberRepository workspaceMemberRepository;

    private static final String EMAIL = "dev@it.dev";
    private static final String URL = "/api/workspaces/acme/brain/files";

    private void stubUser() {
        lenient().when(userRepository.findByEmail(EMAIL))
            .thenReturn(Optional.of(User.builder().id(7L).email(EMAIL).build()));
    }

    private org.springframework.test.web.servlet.request.RequestPostProcessor auth() {
        return jwt().jwt(b -> b.claim("email", EMAIL));
    }

    @Test
    @DisplayName("POST brain/files (auth, multipart) → 201 + success")
    void upload_201() throws Exception {
        stubUser();
        when(access.resolveAndAuthorize(anyString(), anyLong()))
            .thenReturn(Workspace.builder().id(42L).build());

        var file = new org.springframework.mock.web.MockMultipartFile(
            "file", "diagram.png", "image/png", "bytes".getBytes());

        mockMvc.perform(multipart(URL).file(file).with(auth()))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.filename").value("diagram.png"))
            .andExpect(jsonPath("$.data.image").value(true))
            .andExpect(jsonPath("$.data.url",
                org.hamcrest.Matchers.startsWith("/api/files/brain/42/")))
            .andExpect(jsonPath("$.data.contentType").value("image/png"));
    }

    @Test
    @DisplayName("POST brain/files sans JWT → 401")
    void upload_unauthenticated_401() throws Exception {
        var file = new org.springframework.mock.web.MockMultipartFile(
            "file", "diagram.png", "image/png", "bytes".getBytes());

        mockMvc.perform(multipart(URL).file(file))
            .andExpect(status().isUnauthorized());
    }
}
