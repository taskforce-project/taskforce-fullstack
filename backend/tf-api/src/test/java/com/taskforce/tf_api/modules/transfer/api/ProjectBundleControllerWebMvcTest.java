package com.taskforce.tf_api.modules.transfer.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
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
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.modules.transfer.service.ProjectBundleService;
import com.taskforce.tf_api.shared.security.SecurityConfig;

/** Tranche web — {@link ProjectBundleController} : le fichier de projet en téléchargement et à l'import. */
@WebMvcTest(ProjectBundleController.class)
@Import(SecurityConfig.class)
@ActiveProfiles("test")
@DisplayName("ProjectBundleController (@WebMvcTest)")
class ProjectBundleControllerWebMvcTest {

    private static final String EMAIL = "dev@it.dev";
    private static final byte[] ZIP = "PK\u0003\u0004".getBytes(StandardCharsets.ISO_8859_1);

    @Autowired private MockMvc mockMvc;

    @MockitoBean private ProjectBundleService bundleService;
    @MockitoBean private ProjectService projectService;
    @MockitoBean private UserRepository userRepository;
    @MockitoBean private WorkspaceRepository workspaceRepository;
    @MockitoBean private WorkspaceMemberRepository workspaceMemberRepository;

    private RequestPostProcessor auth() {
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(User.builder().id(7L).email(EMAIL).build()));
        return jwt().jwt(b -> b.claim("email", EMAIL));
    }

    @Test
    @DisplayName("GET bundle → le zip du projet, en pièce jointe nommée")
    void exports_a_zip() throws Exception {
        var a = auth();
        when(bundleService.export("acme", 5L, 7L))
            .thenReturn(new ProjectBundleService.Export("APO-2026-10-20.taskforce.zip", new byte[0], List.of()));
        doAnswer(invocation -> {
            invocation.<OutputStream>getArgument(1).write(ZIP);
            return null;
        }).when(bundleService).write(any(), any());

        mockMvc.perform(get("/api/workspaces/acme/projects/5/bundle").with(a))
            .andExpect(status().isOk())
            .andExpect(content().contentType("application/zip"))
            .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, containsString("APO-2026-10-20.taskforce.zip")))
            .andExpect(content().bytes(ZIP));
    }

    @Test
    @DisplayName("POST import → 201 : le corps reçu est le fichier lu, puis effacé")
    void imports_a_zip() throws Exception {
        var a = auth();
        Path[] received = new Path[1];
        when(bundleService.importBundle(eq("acme"), eq(7L), any())).thenAnswer(invocation -> {
            received[0] = invocation.getArgument(2);
            assertThat(Files.readAllBytes(received[0])).isEqualTo(ZIP);
            return 42L;
        });

        mockMvc.perform(post("/api/workspaces/acme/projects/import").with(a).contentType("application/zip").content(ZIP))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.message").value("Project imported"));

        verify(projectService).getProject("acme", 42L, 7L);
        assertThat(received[0]).doesNotExist();
    }

    @Test
    @DisplayName("POST import d'autre chose qu'un zip → 415")
    void refuses_other_content_types() throws Exception {
        mockMvc.perform(post("/api/workspaces/acme/projects/import").with(auth())
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isUnsupportedMediaType());

        verify(bundleService, never()).importBundle(any(), any(), any());
    }

    @Test
    @DisplayName("sans session → 401")
    void requires_a_session() throws Exception {
        mockMvc.perform(get("/api/workspaces/acme/projects/5/bundle")).andExpect(status().isUnauthorized());
    }
}
