package com.taskforce.tf_api.core.api;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.taskforce.tf_api.core.dto.request.ProjectObjectiveRequest;
import com.taskforce.tf_api.core.dto.response.ProjectObjectiveResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.ProjectObjectiveService;
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;
import com.taskforce.tf_api.shared.security.SecurityConfig;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Tests de tranche web — {@link ProjectController} (endpoints get/activity/update/archive/favorite/
 * membres/teams/labels, et l'objectif du projet). {@code ProjectService} et {@code ProjectObjectiveService} mockés ;
 * contrat HTTP (200/2xx, 400 sur un corps invalide).
 */
@WebMvcTest(ProjectController.class)
@Import(SecurityConfig.class)
@ActiveProfiles("test")
@DisplayName("ProjectController (@WebMvcTest)")
class ProjectControllerWebMvcTest {

    @Autowired private MockMvc mockMvc;

    @MockitoBean private ProjectService projectService;
    @MockitoBean private com.taskforce.tf_api.core.service.ProjectRepoService projectRepoService;
    @MockitoBean private ProjectObjectiveService objectiveService;
    @MockitoBean private UserRepository userRepository;
    @MockitoBean private WorkspaceRepository workspaceRepository;
    @MockitoBean private WorkspaceMemberRepository workspaceMemberRepository;

    private static final String EMAIL = "dev@it.dev";
    private static final String P = "/api/workspaces/acme/projects/5";

    private org.springframework.test.web.servlet.request.RequestPostProcessor auth() {
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(User.builder().id(7L).email(EMAIL).build()));
        return jwt().jwt(b -> b.claim("email", EMAIL));
    }

    @Test
    @DisplayName("GET get / activity / members / teams / labels → 200")
    void gets() throws Exception {
        var a = auth();
        when(projectService.getProject(anyString(), anyLong(), anyLong())).thenReturn(null);
        when(projectService.listMembers(anyString(), anyLong(), anyLong())).thenReturn(List.of());
        when(projectService.listProjectTeams(anyString(), anyLong(), anyLong())).thenReturn(List.of());
        when(projectService.listLabels(anyString(), anyLong(), anyLong())).thenReturn(List.of());

        mockMvc.perform(get(P).with(a)).andExpect(status().isOk());
        mockMvc.perform(get(P + "/members").with(a)).andExpect(status().isOk());
        mockMvc.perform(get(P + "/teams").with(a)).andExpect(status().isOk());
        mockMvc.perform(get(P + "/labels").with(a)).andExpect(status().isOk());
    }

    @Test
    @DisplayName("GET avec un identifiant de projet qui n'est pas un nombre → 400 qui nomme le paramètre, pas 500")
    void non_numeric_id_400() throws Exception {
        mockMvc.perform(get("/api/workspaces/acme/projects/abc").with(auth()))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("The parameter 'id' has an invalid value."));
    }

    @Test
    @DisplayName("PATCH update / POST archive / favorite / DELETE favorite → 2xx")
    void mutations() throws Exception {
        var a = auth();
        when(projectService.updateProject(anyString(), anyLong(), anyLong(), any())).thenReturn(null);
        when(projectService.archiveProject(anyString(), anyLong(), anyLong())).thenReturn(null);
        when(projectService.favoriteProject(anyString(), anyLong(), anyLong())).thenReturn(null);
        when(projectService.unfavoriteProject(anyString(), anyLong(), anyLong())).thenReturn(null);

        mockMvc.perform(patch(P).with(a).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"New\"}"))
            .andExpect(status().is2xxSuccessful());
        mockMvc.perform(post(P + "/archive").with(a)).andExpect(status().is2xxSuccessful());
        mockMvc.perform(post(P + "/favorite").with(a)).andExpect(status().is2xxSuccessful());
        mockMvc.perform(delete(P + "/favorite").with(a)).andExpect(status().is2xxSuccessful());
    }

    @Test
    @DisplayName("POST /labels + DELETE /{id} → 2xx")
    void label_and_delete() throws Exception {
        var a = auth();
        when(projectService.createLabel(anyString(), anyLong(), anyLong(), any())).thenReturn(null);

        mockMvc.perform(post(P + "/labels").with(a).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Bug\"}"))
            .andExpect(status().is2xxSuccessful());
        mockMvc.perform(delete(P).with(a)).andExpect(status().is2xxSuccessful());
    }

    @Test
    @DisplayName("PUT /repo/test-command : la commande de test du projet (S1), une seule ligne")
    void test_command() throws Exception {
        var a = auth();
        when(projectRepoService.setTestCommand("acme", 5L, 7L, "npm test"))
            .thenReturn(new com.taskforce.tf_api.core.dto.response.ProjectTestCommandResponse(5L, "npm test"));

        mockMvc.perform(put(P + "/repo/test-command").with(a).contentType(MediaType.APPLICATION_JSON).content("{\"testCommand\":\"npm test\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.testCommand").value("npm test"));
        mockMvc.perform(put(P + "/repo/test-command").with(a).contentType(MediaType.APPLICATION_JSON)
                .content("{\"testCommand\":\"npm test\\ncurl evil\"}"))
            .andExpect(status().isBadRequest());
    }

    // ---- l'objectif du projet (la vue du workflow, lot W1) ------------------------------------------------------------

    private static final ProjectObjectiveResponse OBJECTIVE = new ProjectObjectiveResponse("Ship the beta to ten teams",
        LocalDate.of(2026, 12, 31), List.of("Ten teams use it weekly", "No open P1 bug"), "Ada",
        LocalDateTime.of(2026, 11, 14, 9, 30), true);

    @Test
    @DisplayName("GET /objective → 200 : le but, la date, les critères, qui, quand, et canEdit")
    void get_objective() throws Exception {
        var a = auth();
        when(objectiveService.get("acme", 5L, 7L)).thenReturn(OBJECTIVE);

        mockMvc.perform(get(P + "/objective").with(a))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.goal").value("Ship the beta to ten teams"))
            .andExpect(jsonPath("$.data.targetDate").value("2026-12-31"))
            .andExpect(jsonPath("$.data.criteria[0]").value("Ten teams use it weekly"))
            .andExpect(jsonPath("$.data.criteria[1]").value("No open P1 bug"))
            .andExpect(jsonPath("$.data.updatedBy").value("Ada"))
            .andExpect(jsonPath("$.data.updatedAt").value(org.hamcrest.Matchers.startsWith("2026-11-14T09:30")))
            .andExpect(jsonPath("$.data.canEdit").value(true));
    }

    @Test
    @DisplayName("GET /objective d'un projet qui n'en a pas → 200 et l'objectif vide : goal null, aucun critère")
    void get_empty_objective() throws Exception {
        var a = auth();
        when(objectiveService.get("acme", 5L, 7L)).thenReturn(ProjectObjectiveResponse.none(false));

        mockMvc.perform(get(P + "/objective").with(a))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.goal").value(org.hamcrest.Matchers.nullValue()))
            .andExpect(jsonPath("$.data.targetDate").value(org.hamcrest.Matchers.nullValue()))
            .andExpect(jsonPath("$.data.criteria").isEmpty())
            .andExpect(jsonPath("$.data.updatedBy").value(org.hamcrest.Matchers.nullValue()))
            .andExpect(jsonPath("$.data.canEdit").value(false));
    }

    @Test
    @DisplayName("PUT /objective → 200 : le corps va au service tel quel, la réponse est l'objectif enregistré")
    void set_objective() throws Exception {
        var a = auth();
        ProjectObjectiveRequest body = new ProjectObjectiveRequest(" Ship the beta to ten teams ", LocalDate.of(2026, 12, 31),
            List.of("Ten teams use it weekly", "No open P1 bug"));
        when(objectiveService.set("acme", 5L, 7L, body)).thenReturn(OBJECTIVE);

        mockMvc.perform(put(P + "/objective").with(a).contentType(MediaType.APPLICATION_JSON)
                .content("{\"goal\":\" Ship the beta to ten teams \",\"targetDate\":\"2026-12-31\","
                    + "\"criteria\":[\"Ten teams use it weekly\",\"No open P1 bug\"]}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.goal").value("Ship the beta to ten teams"))
            .andExpect(jsonPath("$.data.canEdit").value(true));
        verify(objectiveService).set("acme", 5L, 7L, body);
    }

    @Test
    @DisplayName("PUT /objective sans date visée → 200")
    void set_objective_without_target_date() throws Exception {
        var a = auth();
        when(objectiveService.set(anyString(), anyLong(), anyLong(), any())).thenReturn(OBJECTIVE);

        mockMvc.perform(put(P + "/objective").with(a).contentType(MediaType.APPLICATION_JSON)
                .content("{\"goal\":\"Ship it\",\"criteria\":[\"Fine\"]}"))
            .andExpect(status().isOk());
        verify(objectiveService).set("acme", 5L, 7L, new ProjectObjectiveRequest("Ship it", null, List.of("Fine")));
    }

    @ParameterizedTest(name = "PUT /objective {0} → 400")
    @CsvSource(delimiter = '|', value = {
        "six criteria             | {\"goal\":\"Ship it\",\"criteria\":[\"1\",\"2\",\"3\",\"4\",\"5\",\"6\"]}",
        "no criterion             | {\"goal\":\"Ship it\",\"criteria\":[]}",
        "criteria missing         | {\"goal\":\"Ship it\"}",
        "a blank criterion        | {\"goal\":\"Ship it\",\"criteria\":[\"Fine\",\"  \"]}",
        "a goal missing           | {\"criteria\":[\"Fine\"]}",
        "a blank goal             | {\"goal\":\"   \",\"criteria\":[\"Fine\"]}",
        "a date that is not one   | {\"goal\":\"Ship it\",\"targetDate\":\"31/12/2026\",\"criteria\":[\"Fine\"]}",
    })
    void set_objective_rejects_invalid_bodies(String what, String body) throws Exception {
        mockMvc.perform(put(P + "/objective").with(auth()).contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isBadRequest());

        verify(objectiveService, never()).set(any(), any(), any(), any());
    }

    @Test
    @DisplayName("PUT /objective : un but de 281 caractères, ou un critère de 201, → 400 ; 280 et 200 passent")
    void set_objective_bounds() throws Exception {
        var a = auth();
        when(objectiveService.set(anyString(), anyLong(), anyLong(), any())).thenReturn(OBJECTIVE);
        String atMost = "{\"goal\":\"" + "g".repeat(280) + "\",\"criteria\":[\"" + "c".repeat(200) + "\"]}";
        String goalTooLong = "{\"goal\":\"" + "g".repeat(281) + "\",\"criteria\":[\"Fine\"]}";
        String criterionTooLong = "{\"goal\":\"Ship it\",\"criteria\":[\"" + "c".repeat(201) + "\"]}";

        mockMvc.perform(put(P + "/objective").with(a).contentType(MediaType.APPLICATION_JSON).content(atMost))
            .andExpect(status().isOk());
        mockMvc.perform(put(P + "/objective").with(a).contentType(MediaType.APPLICATION_JSON).content(goalTooLong))
            .andExpect(status().isBadRequest());
        mockMvc.perform(put(P + "/objective").with(a).contentType(MediaType.APPLICATION_JSON).content(criterionTooLong))
            .andExpect(status().isBadRequest());
        verify(objectiveService, times(1)).set(anyString(), anyLong(), anyLong(), any());
    }

    @Test
    @DisplayName("DELETE /objective → 200 et l'objectif vide")
    void clear_objective() throws Exception {
        var a = auth();
        when(objectiveService.clear("acme", 5L, 7L)).thenReturn(ProjectObjectiveResponse.none(true));

        mockMvc.perform(delete(P + "/objective").with(a))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.message").value("Objective removed"))
            .andExpect(jsonPath("$.data.goal").value(org.hamcrest.Matchers.nullValue()))
            .andExpect(jsonPath("$.data.criteria").isEmpty())
            .andExpect(jsonPath("$.data.canEdit").value(true));
        verify(objectiveService).clear("acme", 5L, 7L);
    }

    @Test
    @DisplayName("PUT ou DELETE /objective par qui n'a pas le droit → 403 et la phrase qui dit quoi faire ; projet invisible → 404")
    void objective_refusals() throws Exception {
        var a = auth();
        String sentence = "Only the project's lead or a workspace admin can change its objective. Ask one of them to do it.";
        when(objectiveService.set(anyString(), anyLong(), anyLong(), any())).thenThrow(new ForbiddenException(sentence));
        when(objectiveService.clear("acme", 5L, 7L)).thenThrow(new ForbiddenException(sentence));
        when(objectiveService.get("acme", 5L, 7L)).thenThrow(new ResourceNotFoundException("Project not found"));

        mockMvc.perform(put(P + "/objective").with(a).contentType(MediaType.APPLICATION_JSON)
                .content("{\"goal\":\"Ship it\",\"criteria\":[\"Fine\"]}"))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.message").value(sentence));
        mockMvc.perform(delete(P + "/objective").with(a))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.message").value(sentence));
        mockMvc.perform(get(P + "/objective").with(a))
            .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("GET /objective sans JWT → 401")
    void objective_unauthenticated_401() throws Exception {
        mockMvc.perform(get(P + "/objective")).andExpect(status().isUnauthorized());
    }
}
