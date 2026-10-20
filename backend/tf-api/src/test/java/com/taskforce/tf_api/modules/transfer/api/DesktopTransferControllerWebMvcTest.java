package com.taskforce.tf_api.modules.transfer.api;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
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

import com.taskforce.tf_api.core.dto.response.ProjectResponse;
import com.taskforce.tf_api.core.dto.response.WorkspaceResponse;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.DesktopSessionService;
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.core.service.WorkspaceService;
import com.taskforce.tf_api.modules.transfer.service.ProjectBundleService;
import com.taskforce.tf_api.modules.transfer.service.WorkspaceBundleService;
import com.taskforce.tf_api.shared.security.SecurityConfig;

/** Tranche web — {@link DesktopTransferController} : l'app déplace des projets avec sa seule session. */
@WebMvcTest(DesktopTransferController.class)
@Import(SecurityConfig.class)
@ActiveProfiles("test")
@DisplayName("DesktopTransferController (@WebMvcTest)")
class DesktopTransferControllerWebMvcTest {

    private static final String TOKEN = "tfa_" + "a".repeat(43);
    private static final byte[] ZIP = "PK\u0003\u0004".getBytes(StandardCharsets.ISO_8859_1);

    @Autowired private MockMvc mockMvc;

    @MockitoBean private DesktopSessionService sessions;
    @MockitoBean private ProjectBundleService bundleService;
    @MockitoBean private ProjectService projectService;
    @MockitoBean private WorkspaceRepository workspaceRepository;
    @MockitoBean private UserRepository userRepository;
    @MockitoBean private WorkspaceMemberRepository workspaceMemberRepository;
    @MockitoBean private WorkspaceBundleService workspaceBundleService;
    @MockitoBean private WorkspaceService workspaceService;

    @Test
    @DisplayName("projects → les espaces de la personne et les projets qu'elle y voit, sans jeton Keycloak")
    void lists_the_web_projects() throws Exception {
        when(sessions.userOf(TOKEN)).thenReturn(Optional.of(7L));
        when(workspaceRepository.findAllByMemberId(7L))
            .thenReturn(List.of(Workspace.builder().id(1L).slug("acme").name("Acme").build()));
        when(projectService.listProjects("acme", 7L)).thenReturn(List.of(
            ProjectResponse.builder().id(5L).name("Apollo").identifier("APO").totalIssues(12).build()));

        mockMvc.perform(post("/api/auth/desktop/transfer/projects").contentType(MediaType.APPLICATION_JSON)
                .content("{\"token\":\"" + TOKEN + "\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.workspaces[0].slug").value("acme"))
            .andExpect(jsonPath("$.data.workspaces[0].projects[0].identifier").value("APO"))
            .andExpect(jsonPath("$.data.workspaces[0].projects[0].issueCount").value(12));
    }

    @Test
    @DisplayName("bundle → le zip du projet demandé, avec les droits de la personne")
    void downloads_a_bundle() throws Exception {
        when(sessions.userOf(TOKEN)).thenReturn(Optional.of(7L));
        when(bundleService.export("acme", 5L, 7L))
            .thenReturn(new ProjectBundleService.Export("APO-2026-10-20.taskforce.zip", new byte[0], List.of()));
        doAnswer(invocation -> {
            invocation.<OutputStream>getArgument(1).write(ZIP);
            return null;
        }).when(bundleService).write(any(), any());

        mockMvc.perform(post("/api/auth/desktop/transfer/bundle").contentType(MediaType.APPLICATION_JSON)
                .content("{\"token\":\"" + TOKEN + "\",\"workspace\":\"acme\",\"projectId\":5}"))
            .andExpect(status().isOk())
            .andExpect(content().contentType("application/zip"))
            .andExpect(content().bytes(ZIP));
    }

    @Test
    @DisplayName("import → le projet envoyé par l'app est créé dans l'espace choisi")
    void imports_a_bundle() throws Exception {
        when(sessions.userOf(TOKEN)).thenReturn(Optional.of(7L));
        when(bundleService.importBundle(eq("acme"), eq(7L), any())).thenReturn(42L);
        when(projectService.getProject("acme", 42L, 7L))
            .thenReturn(ProjectResponse.builder().id(42L).name("Apollo").build());

        mockMvc.perform(post("/api/auth/desktop/transfer/import").param("workspace", "acme")
                .header(DesktopTransferController.SESSION_HEADER, TOKEN).contentType("application/zip").content(ZIP))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.data.id").value(42));
    }

    @Test
    @DisplayName("workspace → le fichier d'un espace entier, avec les droits de la personne")
    void downloads_a_whole_workspace() throws Exception {
        when(sessions.userOf(TOKEN)).thenReturn(Optional.of(7L));
        when(workspaceBundleService.export("acme", 7L)).thenReturn(new WorkspaceBundleService.Export(
            "acme-2026-10-20.taskforce-workspace.zip", new byte[0], java.util.Map.of(), 1L, java.util.Set.of()));
        doAnswer(invocation -> {
            invocation.<OutputStream>getArgument(1).write(ZIP);
            return null;
        }).when(workspaceBundleService).write(any(), any());

        mockMvc.perform(post("/api/auth/desktop/transfer/workspace").contentType(MediaType.APPLICATION_JSON)
                .content("{\"token\":\"" + TOKEN + "\",\"workspace\":\"acme\"}"))
            .andExpect(status().isOk())
            .andExpect(content().contentType("application/zip"))
            .andExpect(content().bytes(ZIP));
    }

    @Test
    @DisplayName("workspace-import → l'espace envoyé par l'app est créé, la personne en est propriétaire")
    void imports_a_whole_workspace() throws Exception {
        when(sessions.userOf(TOKEN)).thenReturn(Optional.of(7L));
        when(workspaceBundleService.importBundle(eq(7L), any()))
            .thenReturn(com.taskforce.tf_api.core.model.Workspace.builder().id(9L).slug("acme-copy").build());
        when(workspaceService.getWorkspaceBySlug("acme-copy", 7L))
            .thenReturn(WorkspaceResponse.builder().id(9L).slug("acme-copy").name("Acme").build());

        mockMvc.perform(post("/api/auth/desktop/transfer/workspace-import")
                .header(DesktopTransferController.SESSION_HEADER, TOKEN).contentType("application/zip").content(ZIP))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.data.slug").value("acme-copy"));
    }

    @Test
    @DisplayName("session fermée ou expirée → 401, rien n'est lu ni créé")
    void refuses_an_ended_session() throws Exception {
        when(sessions.userOf(TOKEN)).thenReturn(Optional.empty());

        mockMvc.perform(post("/api/auth/desktop/transfer/projects").contentType(MediaType.APPLICATION_JSON)
                .content("{\"token\":\"" + TOKEN + "\"}"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.message").value("The session ended: sign in again"));
        mockMvc.perform(post("/api/auth/desktop/transfer/import").param("workspace", "acme")
                .header(DesktopTransferController.SESSION_HEADER, TOKEN).contentType("application/zip").content(ZIP))
            .andExpect(status().isUnauthorized());

        verify(bundleService, never()).importBundle(any(), any(), any());
    }

    @Test
    @DisplayName("import sans session → 400 qui nomme l'en-tête manquant")
    void import_needs_the_session_header() throws Exception {
        mockMvc.perform(post("/api/auth/desktop/transfer/import").param("workspace", "acme")
                .contentType("application/zip").content(ZIP))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("The request header 'X-TaskForce-Session' is required."));
    }
}
