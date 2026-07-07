package com.taskforce.tf_api.modules.ged.api;

import java.time.LocalDateTime;
import java.util.List;
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
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.modules.ged.dto.response.AttachmentResponse;
import com.taskforce.tf_api.modules.ged.service.AttachmentService;
import com.taskforce.tf_api.shared.security.SecurityConfig;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Tests de tranche web du {@link AttachmentController} (module GED) via {@code @WebMvcTest}.
 * Couvre l'upload multipart, le listing, la suppression (contrats HTTP + enveloppe ApiResponse)
 * et le rejet non authentifié. Service et repositories mockés.
 */
@WebMvcTest(AttachmentController.class)
@Import(SecurityConfig.class)
@ActiveProfiles("test")
@DisplayName("AttachmentController (@WebMvcTest)")
class AttachmentControllerWebMvcTest {

    @Autowired private MockMvc mockMvc;

    @MockitoBean private AttachmentService attachmentService;
    @MockitoBean private UserRepository userRepository;
    @MockitoBean private WorkspaceRepository workspaceRepository;
    @MockitoBean private WorkspaceMemberRepository workspaceMemberRepository;

    private static final String EMAIL = "dev@it.dev";
    private static final String BASE =
        "/api/workspaces/acme/projects/1/issues/2/attachments";

    private void stubUser() {
        lenient().when(userRepository.findByEmail(EMAIL))
            .thenReturn(Optional.of(User.builder().id(7L).email(EMAIL).build()));
    }

    private org.springframework.test.web.servlet.request.RequestPostProcessor auth() {
        return jwt().jwt(b -> b.claim("email", EMAIL));
    }

    private AttachmentResponse sampleResponse() {
        return AttachmentResponse.builder()
            .id(10L)
            .issueId(2L)
            .originalName("x.png")
            .contentType("image/png")
            .fileSize(5L)
            .createdAt(LocalDateTime.now())
            .uploadedByName("Dev")
            .downloadUrl("https://minio.test/x.png")
            .build();
    }

    @Test
    @DisplayName("POST attachments (auth, multipart) → 201 + success")
    void upload_201() throws Exception {
        stubUser();
        when(attachmentService.upload(anyString(), anyLong(), anyLong(), any(), anyLong()))
            .thenReturn(sampleResponse());

        var file = new org.springframework.mock.web.MockMultipartFile(
            "file", "x.png", "image/png", "bytes".getBytes());

        mockMvc.perform(multipart(BASE).file(file).with(auth()))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.originalName").value("x.png"));
    }

    @Test
    @DisplayName("GET attachments (auth) → 200 + liste")
    void list_200() throws Exception {
        stubUser();
        when(attachmentService.listByIssue(anyString(), anyLong(), anyLong()))
            .thenReturn(List.of(sampleResponse()));

        mockMvc.perform(get(BASE).with(auth()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data[0].id").value(10));
    }

    @Test
    @DisplayName("DELETE attachments/{id} (auth) → 200 + success")
    void delete_200() throws Exception {
        stubUser();

        mockMvc.perform(delete(BASE + "/10").with(auth()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true));
    }

    @Test
    @DisplayName("GET attachments sans JWT → 401")
    void list_unauthenticated_401() throws Exception {
        mockMvc.perform(get(BASE))
            .andExpect(status().isUnauthorized());
    }
}
