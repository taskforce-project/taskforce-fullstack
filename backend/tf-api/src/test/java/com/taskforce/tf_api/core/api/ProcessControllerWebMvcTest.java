package com.taskforce.tf_api.core.api;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
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

import java.time.LocalDateTime;
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
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import com.taskforce.tf_api.core.dto.response.ProcessResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.process.ProcessModel;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.process.ProcessService;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;
import com.taskforce.tf_api.shared.security.JwtIdentityResolver;
import com.taskforce.tf_api.shared.security.SecurityConfig;

/**
 * Tranche web de {@link ProcessController} : le routage, l'identité, les codes (201 publié, 422 refusé par le
 * vérificateur, 403, 401, 400 sur une clé qui n'en est pas une) et l'export en téléchargement. Service mocké.
 */
@WebMvcTest(ProcessController.class)
@Import(SecurityConfig.class)
@ActiveProfiles("test")
@DisplayName("ProcessController (@WebMvcTest)")
class ProcessControllerWebMvcTest {

    @Autowired private MockMvc mockMvc;

    @MockitoBean private ProcessService processes;
    @MockitoBean private UserRepository userRepository;
    @MockitoBean private JwtIdentityResolver identityResolver;
    @MockitoBean private WorkspaceRepository workspaceRepository;
    @MockitoBean private WorkspaceMemberRepository workspaceMemberRepository;

    private static final String EMAIL = "lea@it.dev";
    private static final String BASE = "/api/workspaces/acme/projects/12/processes";
    private static final String BODY = "{\"model\":{\"format\":\"taskforce-process/1\",\"key\":\"integrate-a-module\","
        + "\"name\":\"Integrate a module\"}}";
    private static final ProcessModel MODEL = new ProcessModel(ProcessModel.FORMAT, "integrate-a-module",
        "Integrate a module", null, null, null, null);
    private static final ProcessResponse.Version VERSION = new ProcessResponse.Version("integrate-a-module", 1,
        "Integrate a module", "sha256:abc", "Lea", LocalDateTime.of(2026, 11, 14, 10, 0), null, MODEL);

    private RequestPostProcessor auth() {
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(User.builder().id(5L).email(EMAIL).build()));
        when(identityResolver.resolveEmail(any())).thenReturn(EMAIL);
        return jwt().jwt(b -> b.claim("email", EMAIL));
    }

    @Test
    @DisplayName("GET : les processus du projet, et qui peut publier")
    void list_200() throws Exception {
        when(processes.overview("acme", 12L, 5L)).thenReturn(new ProcessResponse.Overview(List.of(
            new ProcessResponse.Summary("integrate-a-module", "Integrate a module", 1, "sha256:abc", "Lea",
                LocalDateTime.of(2026, 11, 14, 10, 0), 1)), true));

        mockMvc.perform(get(BASE).with(auth()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.processes[0].key").value("integrate-a-module"))
            .andExpect(jsonPath("$.data.canPublish").value(true));
    }

    @Test
    @DisplayName("POST : une version publiée (201), ou ses refus en phrases (422)")
    void publish_201_and_422() throws Exception {
        when(processes.publish(eq("acme"), eq(12L), any(ProcessModel.class), eq(5L)))
            .thenReturn(new ProcessResponse.Publication(VERSION, null))
            .thenReturn(new ProcessResponse.Publication(null, new ProcessResponse.Check(false, "sha256:abc", List.of(
                new ProcessResponse.Problem("noOwner", "write-scope", "Write the scope",
                    "“Write the scope” has no one who answers for it: name a person or a role.")))));

        mockMvc.perform(post(BASE).with(auth()).contentType(MediaType.APPLICATION_JSON).content(BODY))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.data.version.version").value(1))
            .andExpect(jsonPath("$.data.version.model.key").value("integrate-a-module"));
        mockMvc.perform(post(BASE).with(auth()).contentType(MediaType.APPLICATION_JSON).content(BODY))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.data.refused.problems[0].code").value("noOwner"))
            .andExpect(jsonPath("$.data.refused.problems[0].message")
                .value("“Write the scope” has no one who answers for it: name a person or a role."));
    }

    @Test
    @DisplayName("POST sans modèle : 400, rien n'est publié")
    void publish_without_a_model_400() throws Exception {
        mockMvc.perform(post(BASE).with(auth()).contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isBadRequest());
        verify(processes, never()).publish(anyString(), anyLong(), any(), anyLong());
    }

    @Test
    @DisplayName("POST check et import : le vérificateur, sans rien écrire")
    void check_and_import_200() throws Exception {
        when(processes.check(eq("acme"), eq(12L), any(ProcessModel.class), eq(5L)))
            .thenReturn(new ProcessResponse.Check(true, "sha256:abc", List.of()));
        when(processes.importBpmn("acme", 12L, "<bpmn:definitions/>", 5L)).thenReturn(new ProcessResponse.Import(false,
            null, null, List.of(new ProcessResponse.Problem("unreadable", null, null, "This file holds no process.")),
            List.of()));

        mockMvc.perform(post(BASE + "/check").with(auth()).contentType(MediaType.APPLICATION_JSON).content(BODY))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.passed").value(true));
        mockMvc.perform(post(BASE + "/import").with(auth()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"xml\":\"<bpmn:definitions/>\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.problems[0].message").value("This file holds no process."));
    }

    @Test
    @DisplayName("GET une version, et son export en BPMN : un fichier à télécharger")
    void version_and_export() throws Exception {
        when(processes.version("acme", 12L, "integrate-a-module", 1, 5L)).thenReturn(VERSION);
        when(processes.export("acme", 12L, "integrate-a-module", 1, 5L))
            .thenReturn(new ProcessService.BpmnFile("integrate-a-module-v1.bpmn", "<bpmn:definitions/>"));

        mockMvc.perform(get(BASE + "/integrate-a-module/versions/1").with(auth()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.digest").value("sha256:abc"));
        mockMvc.perform(get(BASE + "/integrate-a-module/versions/1/bpmn").with(auth()))
            .andExpect(status().isOk())
            .andExpect(header().string("Content-Disposition", "attachment; filename=\"integrate-a-module-v1.bpmn\""))
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_XML))
            .andExpect(content().string("<bpmn:definitions/>"));
    }

    @Test
    @DisplayName("les workflows par défaut, et l'export de l'un d'eux")
    void defaults() throws Exception {
        when(processes.defaults("acme", 5L)).thenReturn(List.of(new ProcessResponse.Default("integrate-a-module",
            "Integrate a module", null, "sha256:abc", MODEL)));
        when(processes.exportDefault("acme", "integrate-a-module", 5L))
            .thenReturn(new ProcessService.BpmnFile("integrate-a-module.bpmn", "<bpmn:definitions/>"));

        mockMvc.perform(get("/api/workspaces/acme/processes/defaults").with(auth()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data[0].key").value("integrate-a-module"));
        mockMvc.perform(get("/api/workspaces/acme/processes/defaults/integrate-a-module/bpmn").with(auth()))
            .andExpect(status().isOk())
            .andExpect(header().string("Content-Disposition", "attachment; filename=\"integrate-a-module.bpmn\""));
    }

    @Test
    @DisplayName("un processus inconnu : 404 ; un rôle qui ne publie pas : 403 ; un numéro qui n'en est pas un : 400 ; sans jeton : 401")
    void refusals() throws Exception {
        when(processes.detail("acme", 12L, "unknown", 5L)).thenThrow(new ResourceNotFoundException("Process not found"));
        when(processes.publish(eq("acme"), eq(12L), any(ProcessModel.class), eq(5L)))
            .thenThrow(new ForbiddenException("Only the project's lead, or an owner or admin of the workspace, can "
                + "publish its processes."));

        mockMvc.perform(get(BASE + "/unknown").with(auth())).andExpect(status().isNotFound());
        mockMvc.perform(post(BASE).with(auth()).contentType(MediaType.APPLICATION_JSON).content(BODY))
            .andExpect(status().isForbidden());
        mockMvc.perform(get(BASE + "/integrate-a-module/versions/first").with(auth())).andExpect(status().isBadRequest());
        mockMvc.perform(get(BASE)).andExpect(status().isUnauthorized());
        verify(processes, never()).version(anyString(), anyLong(), anyString(), anyInt(), anyLong());
    }
}
