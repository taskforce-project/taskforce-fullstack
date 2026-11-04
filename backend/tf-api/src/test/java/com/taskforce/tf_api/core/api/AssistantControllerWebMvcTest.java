package com.taskforce.tf_api.core.api;

import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.taskforce.tf_api.core.dto.response.AssistantActionResult;
import com.taskforce.tf_api.core.dto.response.AssistantAnswer.AssistantToolCall;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.agent.Screen;
import com.taskforce.tf_api.shared.security.SecurityConfig;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Tests de tranche web — {@link AssistantController} (endpoint chat JSON, accord d'une action proposée).
 * {@code AgentService} mocké.
 */
@WebMvcTest(AssistantController.class)
@Import(SecurityConfig.class)
@ActiveProfiles("test")
@DisplayName("AssistantController (@WebMvcTest)")
class AssistantControllerWebMvcTest {

    @Autowired private MockMvc mockMvc;

    @MockitoBean private com.taskforce.tf_api.core.service.agent.AgentService agentService;
    @MockitoBean private com.taskforce.tf_api.core.service.AiConversationService conversationService;
    @MockitoBean private com.taskforce.tf_api.core.service.brain.BrainAccessGuard access;
    @MockitoBean private UserRepository userRepository;
    @MockitoBean private WorkspaceRepository workspaceRepository;
    @MockitoBean private WorkspaceMemberRepository workspaceMemberRepository;

    private static final String EMAIL = "dev@it.dev";
    private static final String URL = "/api/workspaces/acme/assistant";

    private org.springframework.test.web.servlet.request.RequestPostProcessor auth() {
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(User.builder().id(7L).email(EMAIL).build()));
        return jwt().jwt(b -> b.claim("email", EMAIL));
    }

    @Test
    @DisplayName("POST assistant (Accept JSON) → 200")
    void chat_json_200() throws Exception {
        // Chaîne complète : autorisation → conversation (get/create) → agent (avec historique) → persistance.
        var ws = com.taskforce.tf_api.core.model.Workspace.builder().id(1L).slug("acme").name("Acme").build();
        when(access.resolveAndAuthorize(anyString(), anyLong())).thenReturn(ws);
        var conv = org.mockito.Mockito.mock(com.taskforce.tf_api.core.model.AiConversation.class);
        when(conv.getId()).thenReturn(1L);
        when(conversationService.getOrCreate(anyLong(), anyLong(), any())).thenReturn(conv);
        when(conversationService.recentHistory(anyLong())).thenReturn(java.util.List.of());
        when(conversationService.autoTitle(anyLong(), anyString())).thenReturn("Bonjour");
        when(agentService.run(anyString(), anyLong(), anyString(), any(), any())).thenReturn(
            new com.taskforce.tf_api.core.dto.response.AssistantAnswer(
                "Réponse", null, "fast", java.util.List.of(), java.util.List.of(), java.util.List.of(),
                com.taskforce.tf_api.core.dto.response.AssistantAnswer.AssistantUsage.NONE));

        mockMvc.perform(post(URL).with(auth())
                .accept(MediaType.APPLICATION_JSON)
                .contentType(MediaType.APPLICATION_JSON).content("{\"message\":\"Bonjour\"}"))
            .andExpect(status().isOk());
        verify(agentService).run(eq("acme"), eq(7L), eq("Bonjour"), any(), eq(Screen.NONE));
    }

    @ParameterizedTest(name = "écran {0} → {1}")
    @CsvSource(delimiter = '|', value = {
        "{\"projectId\":12}                 | 12   | ",
        "{\"projectId\":12,\"issueId\":34}  | 12   | 34",
        "{\"issueId\":34}                   |      | ",   // une issue sans son projet ne se lit pas
    })
    @DisplayName("POST assistant avec l'écran (R114) : le projet et l'issue ouverts partent à Cortex")
    void chat_passes_the_screen(String screen, Long projectId, Long issueId) throws Exception {
        var ws = com.taskforce.tf_api.core.model.Workspace.builder().id(1L).slug("acme").name("Acme").build();
        when(access.resolveAndAuthorize(anyString(), anyLong())).thenReturn(ws);
        var conv = org.mockito.Mockito.mock(com.taskforce.tf_api.core.model.AiConversation.class);
        when(conv.getId()).thenReturn(1L);
        when(conversationService.getOrCreate(anyLong(), anyLong(), any())).thenReturn(conv);
        when(conversationService.recentHistory(anyLong())).thenReturn(java.util.List.of());
        when(agentService.run(anyString(), anyLong(), anyString(), any(), any())).thenReturn(
            new com.taskforce.tf_api.core.dto.response.AssistantAnswer(
                "Réponse", null, "fast", java.util.List.of(), java.util.List.of(), java.util.List.of(),
                com.taskforce.tf_api.core.dto.response.AssistantAnswer.AssistantUsage.NONE));

        mockMvc.perform(post(URL).with(auth())
                .accept(MediaType.APPLICATION_JSON)
                .contentType(MediaType.APPLICATION_JSON).content("{\"message\":\"supprime ça\",\"screen\":" + screen + "}"))
            .andExpect(status().isOk());
        verify(agentService).run(eq("acme"), eq(7L), eq("supprime ça"), any(), eq(new Screen(projectId, issueId)));
    }

    @Test
    @DisplayName("POST assistant avec un écran invalide (@Positive) → 400")
    void chat_invalid_screen_400() throws Exception {
        mockMvc.perform(post(URL).with(auth())
                .accept(MediaType.APPLICATION_JSON)
                .contentType(MediaType.APPLICATION_JSON).content("{\"message\":\"hi\",\"screen\":{\"projectId\":-1}}"))
            .andExpect(status().isBadRequest());
        verify(agentService, never()).run(any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("POST actions/answer → 200 : la réponse à la question de TaskForce, et la suite du geste (R115)")
    void answer_200() throws Exception {
        String record = "00000000-0000-0000-0000-0000000000aa";
        String ref = "sha256:" + "d".repeat(64);
        when(agentService.answer("acme", 7L, "delete_issue", record, ref, "TESTTA-2"))
            .thenReturn(new AssistantToolCall("delete_issue", "pending", "{\"issue\":\"TESTTA-2\"}", "Deleting TESTTA-2...",
                record, null, java.util.Map.of("key", "TESTTA-2")));

        mockMvc.perform(post(URL + "/actions/answer").with(auth())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"tool\":\"delete_issue\",\"record\":\"" + record + "\",\"ref\":\"" + ref + "\",\"value\":\"TESTTA-2\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.status").value("pending"))
            .andExpect(jsonPath("$.data.target.key").value("TESTTA-2"));
    }

    @ParameterizedTest(name = "answer {0} → 400")
    @ValueSource(strings = {
        "{\"tool\":\"delete_issue\",\"record\":\"r\",\"ref\":\"q\"}",            // sans réponse
        "{\"tool\":\"delete_issue\",\"record\":\"r\",\"value\":\"TESTTA-2\"}",   // sans question
        "{\"tool\":\"delete_issue\",\"ref\":\"q\",\"value\":\"TESTTA-2\"}",      // sans dossier
        "{\"tool\":\"delete_issue\",\"record\":\"r\",\"ref\":\"q\",\"value\":\"  \"}",
    })
    void answer_incomplete_400(String body) throws Exception {
        mockMvc.perform(post(URL + "/actions/answer").with(auth())
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isBadRequest());
        verify(agentService, never()).answer(any(), any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("POST assistant message vide (@NotBlank) → 400")
    void chat_invalid_400() throws Exception {
        mockMvc.perform(post(URL).with(auth())
                .accept(MediaType.APPLICATION_JSON)
                .contentType(MediaType.APPLICATION_JSON).content("{\"message\":\"\"}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("POST assistant sans JWT → 401")
    void chat_unauthenticated_401() throws Exception {
        mockMvc.perform(post(URL)
                .accept(MediaType.APPLICATION_JSON)
                .contentType(MediaType.APPLICATION_JSON).content("{\"message\":\"hi\"}"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("POST assistant message > 4000 caractères (@Size) → 400")
    void chat_message_too_long_400() throws Exception {
        String tooLong = "x".repeat(4001);
        mockMvc.perform(post(URL).with(auth())
                .accept(MediaType.APPLICATION_JSON)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"message\":\"" + tooLong + "\"}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("POST assistant utilisateur introuvable → 404")
    void chat_user_not_found_404() throws Exception {
        // JWT valide mais aucun utilisateur en DB → resolveUserId lève ResourceNotFoundException
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.empty());

        mockMvc.perform(post(URL)
                .with(jwt().jwt(b -> b.claim("email", EMAIL)))
                .accept(MediaType.APPLICATION_JSON)
                .contentType(MediaType.APPLICATION_JSON).content("{\"message\":\"Bonjour\"}"))
            .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("POST actions/execute → 200 : l'action accordée part au noyau, avec son dossier")
    void approved_action_200() throws Exception {
        String record = "00000000-0000-0000-0000-0000000000aa";
        when(agentService.runApproved("acme", 7L, "create_note", "{\"title\":\"T\"}", record))
            .thenReturn(new AssistantActionResult("create_note", "success", "Note created"));

        mockMvc.perform(post(URL + "/actions/execute").with(auth())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"tool\":\"create_note\",\"input\":\"{\\\"title\\\":\\\"T\\\"}\",\"record\":\"" + record + "\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.status").value("success"))
            .andExpect(jsonPath("$.data.output").value("Note created"));
    }

    @ParameterizedTest(name = "{0} → 400")
    @ValueSource(strings = {
        "{\"tool\":\"create_note\",\"input\":\"{}\"}",                 // sans dossier
        "{\"tool\":\"\",\"input\":\"{}\",\"record\":\"r\"}",          // sans outil
    })
    void approved_action_without_tool_or_record_400(String body) throws Exception {
        mockMvc.perform(post(URL + "/actions/execute").with(auth())
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isBadRequest());
        verify(agentService, never()).runApproved(any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("POST actions/undo → 200 : défait ce que Cortex a créé, par le dossier de la réponse (R77)")
    void undo_200() throws Exception {
        String record = "00000000-0000-0000-0000-0000000000aa";
        when(agentService.undo("acme", 7L, "create_project", record, null))
            .thenReturn(new AssistantActionResult("create_project", "success", "Removed the project PRICING \"Pricing\"."));

        mockMvc.perform(post(URL + "/actions/undo").with(auth())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"tool\":\"create_project\",\"record\":\"" + record + "\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.output").value("Removed the project PRICING \"Pricing\"."));
    }

    @Test
    @DisplayName("POST actions/undo avec ref → 200 : défait le geste que la carte nomme, parmi ceux de la réponse")
    void undo_names_the_gesture_it_undoes() throws Exception {
        String record = "00000000-0000-0000-0000-0000000000aa";
        String ref = "sha256:" + "c".repeat(64);
        when(agentService.undo("acme", 7L, "update_issue", record, ref))
            .thenReturn(new AssistantActionResult("update_issue", "success", "Put back the column of TF-12 \"Fix login\"."));

        mockMvc.perform(post(URL + "/actions/undo").with(auth())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"tool\":\"update_issue\",\"record\":\"" + record + "\",\"ref\":\"" + ref + "\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.output").value("Put back the column of TF-12 \"Fix login\"."));
    }

    @ParameterizedTest(name = "undo {0} → 400")
    @ValueSource(strings = {
        "{\"tool\":\"create_project\"}",       // sans dossier
        "{\"tool\":\"\",\"record\":\"r\"}", // sans outil
    })
    void undo_without_tool_or_record_400(String body) throws Exception {
        mockMvc.perform(post(URL + "/actions/undo").with(auth())
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isBadRequest());
        verify(agentService, never()).undo(any(), any(), any(), any(), any());
    }
}
