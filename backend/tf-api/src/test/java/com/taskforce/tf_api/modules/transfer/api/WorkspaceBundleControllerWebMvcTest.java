package com.taskforce.tf_api.modules.transfer.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import com.taskforce.tf_api.core.dto.response.WorkspaceResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.WorkspaceService;
import com.taskforce.tf_api.modules.transfer.service.WorkspaceBundleService;
import com.taskforce.tf_api.shared.security.SecurityConfig;

/** Tranche web — {@link WorkspaceBundleController} : un espace entier en téléchargement et à l'import. */
@WebMvcTest(WorkspaceBundleController.class)
@Import(SecurityConfig.class)
@ActiveProfiles("test")
@DisplayName("WorkspaceBundleController (@WebMvcTest)")
class WorkspaceBundleControllerWebMvcTest {

    private static final String EMAIL = "dev@it.dev";
    private static final byte[] ZIP = "PK\u0003\u0004".getBytes(StandardCharsets.ISO_8859_1);

    @Autowired private MockMvc mockMvc;

    @MockitoBean private WorkspaceBundleService bundleService;
    @MockitoBean private WorkspaceService workspaceService;
    @MockitoBean private UserRepository userRepository;
    @MockitoBean private WorkspaceRepository workspaceRepository;
    @MockitoBean private WorkspaceMemberRepository workspaceMemberRepository;

    private RequestPostProcessor auth() {
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(User.builder().id(7L).email(EMAIL).build()));
        return jwt().jwt(b -> b.claim("email", EMAIL));
    }

    @Test
    @DisplayName("GET bundle → le zip de l'espace, en pièce jointe nommée")
    void exports_a_zip() throws Exception {
        var a = auth();
        when(bundleService.export("acme", 7L)).thenReturn(new WorkspaceBundleService.Export(
            "acme-2026-10-20.taskforce-workspace.zip", new byte[0], Map.of(), 1L, Set.of()));
        doAnswer(invocation -> {
            invocation.<OutputStream>getArgument(1).write(ZIP);
            return null;
        }).when(bundleService).write(any(), any());

        mockMvc.perform(get("/api/workspaces/acme/bundle").with(a))
            .andExpect(status().isOk())
            .andExpect(content().contentType("application/zip"))
            .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, containsString("acme-2026-10-20.taskforce-workspace.zip")))
            .andExpect(content().bytes(ZIP));
    }

    @Test
    @DisplayName("POST import → 201 avec le nouvel espace ; le fichier reçu est effacé")
    void imports_a_zip() throws Exception {
        var a = auth();
        Path[] received = new Path[1];
        when(bundleService.importBundle(eq(7L), any())).thenAnswer(invocation -> {
            received[0] = invocation.getArgument(1);
            assertThat(Files.readAllBytes(received[0])).isEqualTo(ZIP);
            return Workspace.builder().id(9L).slug("acme-copy").build();
        });
        when(workspaceService.getWorkspaceBySlug("acme-copy", 7L))
            .thenReturn(WorkspaceResponse.builder().id(9L).slug("acme-copy").name("Acme").build());

        mockMvc.perform(post("/api/workspaces/import").with(a).contentType("application/zip").content(ZIP))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.data.slug").value("acme-copy"));

        assertThat(received[0]).doesNotExist();
    }

    @Test
    @DisplayName("sans session → 401")
    void requires_a_session() throws Exception {
        mockMvc.perform(get("/api/workspaces/acme/bundle")).andExpect(status().isUnauthorized());
    }
}
