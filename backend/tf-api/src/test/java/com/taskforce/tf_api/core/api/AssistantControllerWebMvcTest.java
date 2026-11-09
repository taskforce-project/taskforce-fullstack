package com.taskforce.tf_api.core.api;

import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

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
import com.taskforce.tf_api.core.dto.response.ChatTurnResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.agent.ModelCapabilityService;
import com.taskforce.tf_api.core.service.agent.Screen;
import com.taskforce.tf_api.core.service.ai.ChosenModel;
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
    @MockitoBean private ModelCapabilityService capabilities;
    @MockitoBean private com.taskforce.tf_api.core.service.agent.TurnProgressPublisher turnProgress;

    private static final String EMAIL = "dev@it.dev";
    private static final String URL = "/api/workspaces/acme/assistant";

    private org.springframework.test.web.servlet.request.RequestPostProcessor auth() {
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(User.builder().id(7L).email(EMAIL).build()));
        return jwt().jwt(b -> b.claim("email", EMAIL));
    }

    /** Un tour qui aboutit : l'espace, sa conversation, et la réponse de l'agent, qui note le modèle qu'il a reçu. */
    private AtomicReference<String> answering(String text) {
        var ws = com.taskforce.tf_api.core.model.Workspace.builder().id(1L).slug("acme").name("Acme").build();
        when(access.resolveAndAuthorize(anyString(), anyLong())).thenReturn(ws);
        var conv = org.mockito.Mockito.mock(com.taskforce.tf_api.core.model.AiConversation.class);
        when(conv.getId()).thenReturn(1L);
        when(conversationService.getOrCreate(anyLong(), anyLong(), any(), any())).thenReturn(conv);
        when(conversationService.recentHistory(anyLong())).thenReturn(java.util.List.of());
        when(conversationService.autoTitle(anyLong(), anyString())).thenReturn("Move");
        AtomicReference<String> model = new AtomicReference<>();
        when(agentService.run(anyString(), anyLong(), anyString(), any(), any(), any())).thenAnswer(call -> {
            model.set(ChosenModel.current().orElse(null));
            // Le modèle qui répond, comme la passerelle le dit : celui que la personne a choisi ou cliqué, ici.
            return new com.taskforce.tf_api.core.dto.response.AssistantAnswer(text, null, "deep", java.util.List.of(),
                java.util.List.of(), java.util.List.of(), com.taskforce.tf_api.core.dto.response.AssistantAnswer.AssistantUsage.NONE,
                null, model.get());
        });
        return model;
    }

    @Test
    @DisplayName("POST assistant : la banque dit que le modèle échoue, TaskForce le propose et le garde dans la conversation")
    void chat_offers_a_stronger_model() throws Exception {
        AtomicReference<String> used = answering("Done.");
        when(capabilities.cortexModel(null)).thenReturn("qwen2.5:7b-instruct");
        String text = "qwen2.5:7b-instruct failed 1 of 2 test cases for requests that use TaskForce's tools; qwen3:8b passed them all.";
        when(capabilities.offer(anyString(), any(), anyString())).thenReturn(Optional.of(
            new ChatTurnResponse.Escalation("tools", "qwen2.5:7b-instruct", "qwen3:8b", text)));

        mockMvc.perform(post(URL).with(auth())
                .accept(MediaType.APPLICATION_JSON)
                .contentType(MediaType.APPLICATION_JSON).content("{\"message\":\"Move ATLAS-3 to Done\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.escalation.to").value("qwen3:8b"))
            .andExpect(jsonPath("$.data.escalation.capability").value("tools"))
            .andExpect(jsonPath("$.data.sentTo").doesNotExist())
            .andExpect(jsonPath("$.data.answer.answer").value("Done."));
        // Rien n'a changé de modèle : la personne décide d'un clic.
        org.assertj.core.api.Assertions.assertThat(used.get()).isNull();
        verify(conversationService).appendMessage(1L, "assistant", "Done." + ModelCapabilityService.block(text), "deep", 0, null, null);
    }

    @Test
    @DisplayName("POST assistant : une demande trop grande pour le modèle propose celui qui la tient, un champ à part dans la réponse")
    void chat_offers_a_model_that_holds_a_request_too_big() throws Exception {
        String text = "qwen3:14b's context window is 40,960. You can send this request to qwen3:14b.";
        ChatTurnResponse.Escalation offer = new ChatTurnResponse.Escalation("context", "qwen3:8b", "qwen3:14b", text);
        answering("Too big.");
        when(agentService.run(anyString(), anyLong(), anyString(), any(), any(), any())).thenReturn(
            new com.taskforce.tf_api.core.dto.response.AssistantAnswer("Too big.", null, "fallback", java.util.List.of(), java.util.List.of(),
                java.util.List.of(), com.taskforce.tf_api.core.dto.response.AssistantAnswer.AssistantUsage.NONE, null, null, null, offer));

        mockMvc.perform(post(URL).with(auth())
                .accept(MediaType.APPLICATION_JSON)
                .contentType(MediaType.APPLICATION_JSON).content("{\"message\":\"Summarize\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.escalation.to").value("qwen3:14b"))
            .andExpect(jsonPath("$.data.escalation.capability").value("context"))
            .andExpect(jsonPath("$.data.answer.offer").doesNotExist());
        verify(capabilities, never()).offer(anyString(), any(), anyString());
        verify(conversationService).appendMessage(1L, "assistant", "Too big." + ModelCapabilityService.block(text), "fallback", 0, null, null);
    }

    @Test
    @DisplayName("POST assistant avec un modèle : la demande part à ce modèle, et TaskForce dit que la personne l'a demandé")
    void chat_sends_the_request_to_the_model_the_person_clicked() throws Exception {
        AtomicReference<String> used = answering("Moved.");
        when(capabilities.requestedModel("qwen3:8b")).thenReturn("qwen3:8b");

        mockMvc.perform(post(URL).with(auth())
                .accept(MediaType.APPLICATION_JSON)
                .contentType(MediaType.APPLICATION_JSON).content("{\"message\":\"Move ATLAS-3 to Done\",\"model\":\"qwen3:8b\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.sentTo").value("qwen3:8b"))
            .andExpect(jsonPath("$.data.escalation").doesNotExist());
        org.assertj.core.api.Assertions.assertThat(used.get()).isEqualTo("qwen3:8b");
        verify(capabilities, never()).offer(anyString(), any(), anyString());
        verify(conversationService).appendMessage(1L, "assistant",
            "Moved." + ModelCapabilityService.block(ModelCapabilityService.sentNotice("qwen3:8b")), "deep", 0, "qwen3:8b", null);
    }

    @Test
    @DisplayName("POST assistant : le modèle choisi par la personne répond, sans proposition quand la banque ne dit rien")
    void chat_answers_with_the_model_the_person_chose() throws Exception {
        AtomicReference<String> used = answering("Hi.");
        when(capabilities.chosenModel(7L)).thenReturn("qwen3:14b");
        when(capabilities.cortexModel("qwen3:14b")).thenReturn("qwen3:14b");

        mockMvc.perform(post(URL).with(auth())
                .accept(MediaType.APPLICATION_JSON)
                .contentType(MediaType.APPLICATION_JSON).content("{\"message\":\"Hello\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.escalation").doesNotExist())
            .andExpect(jsonPath("$.data.answer.model").value("qwen3:14b"));
        org.assertj.core.api.Assertions.assertThat(used.get()).isEqualTo("qwen3:14b");
        // Le modèle qui a répondu reste avec la réponse : une conversation rouverte le montre encore.
        verify(conversationService).appendMessage(1L, "assistant", "Hi.", "deep", 0, "qwen3:14b", null);
    }

    @Test
    @DisplayName("POST assistant (Accept JSON) → 200")
    void chat_json_200() throws Exception {
        // Chaîne complète : autorisation → conversation (get/create) → agent (avec historique) → persistance.
        var ws = com.taskforce.tf_api.core.model.Workspace.builder().id(1L).slug("acme").name("Acme").build();
        when(access.resolveAndAuthorize(anyString(), anyLong())).thenReturn(ws);
        var conv = org.mockito.Mockito.mock(com.taskforce.tf_api.core.model.AiConversation.class);
        when(conv.getId()).thenReturn(1L);
        when(conversationService.getOrCreate(anyLong(), anyLong(), any(), any())).thenReturn(conv);
        when(conversationService.recentHistory(anyLong())).thenReturn(java.util.List.of());
        when(conversationService.autoTitle(anyLong(), anyString())).thenReturn("Bonjour");
        when(agentService.run(anyString(), anyLong(), anyString(), any(), any(), any())).thenReturn(
            new com.taskforce.tf_api.core.dto.response.AssistantAnswer(
                "Réponse", null, "fast", java.util.List.of(), java.util.List.of(), java.util.List.of(),
                com.taskforce.tf_api.core.dto.response.AssistantAnswer.AssistantUsage.NONE));

        mockMvc.perform(post(URL).with(auth())
                .accept(MediaType.APPLICATION_JSON)
                .contentType(MediaType.APPLICATION_JSON).content("{\"message\":\"Bonjour\"}"))
            .andExpect(status().isOk());
        verify(agentService).run(eq("acme"), eq(7L), eq("Bonjour"), any(), eq(Screen.NONE), eq(java.util.List.of()));
    }

    @ParameterizedTest(name = "écran {0} → {1}")
    @CsvSource(delimiter = '|', value = {
        "{\"projectId\":12}                 | 12   | ",
        "{\"projectId\":12,\"issueId\":34}  | 12   | 34",
        "{\"issueId\":34}                   |      | ",   // une issue sans son projet ne se lit pas
    })
    @DisplayName("POST assistant avec l'écran (R114) : le projet et l'issue ouverts partent à Cortex, le projet range la conversation")
    void chat_passes_the_screen(String screen, Long projectId, Long issueId) throws Exception {
        var ws = com.taskforce.tf_api.core.model.Workspace.builder().id(1L).slug("acme").name("Acme").build();
        when(access.resolveAndAuthorize(anyString(), anyLong())).thenReturn(ws);
        var conv = org.mockito.Mockito.mock(com.taskforce.tf_api.core.model.AiConversation.class);
        when(conv.getId()).thenReturn(1L);
        when(conversationService.getOrCreate(anyLong(), anyLong(), any(), any())).thenReturn(conv);
        when(conversationService.recentHistory(anyLong())).thenReturn(java.util.List.of());
        when(agentService.run(anyString(), anyLong(), anyString(), any(), any(), any())).thenReturn(
            new com.taskforce.tf_api.core.dto.response.AssistantAnswer(
                "Réponse", null, "fast", java.util.List.of(), java.util.List.of(), java.util.List.of(),
                com.taskforce.tf_api.core.dto.response.AssistantAnswer.AssistantUsage.NONE));

        mockMvc.perform(post(URL).with(auth())
                .accept(MediaType.APPLICATION_JSON)
                .contentType(MediaType.APPLICATION_JSON).content("{\"message\":\"supprime ça\",\"screen\":" + screen + "}"))
            .andExpect(status().isOk());
        verify(agentService).run(eq("acme"), eq(7L), eq("supprime ça"), any(), eq(new Screen(projectId, issueId)), any());
        // Une conversation qui commence sur un projet se range sous lui (R121) ; sans projet à l'écran, sous aucun.
        verify(conversationService).getOrCreate(eq(1L), eq(7L), any(), eq(projectId));
    }

    @Test
    @DisplayName("POST assistant avec des pièces jointes (R123) : chacune part à Cortex dans son projet ; ce que le modèle a lu est gardé")
    void chat_passes_the_attachments_and_keeps_what_was_read() throws Exception {
        var ws = com.taskforce.tf_api.core.model.Workspace.builder().id(1L).slug("acme").name("Acme").build();
        when(access.resolveAndAuthorize(anyString(), anyLong())).thenReturn(ws);
        var conv = org.mockito.Mockito.mock(com.taskforce.tf_api.core.model.AiConversation.class);
        when(conv.getId()).thenReturn(1L);
        when(conversationService.getOrCreate(anyLong(), anyLong(), any(), any())).thenReturn(conv);
        when(conversationService.recentHistory(anyLong())).thenReturn(java.util.List.of());
        var read = new com.taskforce.tf_api.core.dto.response.AssistantAnswer.AssistantRead(
            java.util.List.of(new com.taskforce.tf_api.core.dto.response.AssistantAnswer.AssistantRead.IssueRead("OPS-35", 3)),
            java.util.List.of(), java.util.List.of(), 0);
        when(agentService.run(anyString(), anyLong(), anyString(), any(), any(), any())).thenReturn(
            new com.taskforce.tf_api.core.dto.response.AssistantAnswer(
                "Réponse", null, "fast", java.util.List.of(), java.util.List.of(), java.util.List.of(),
                com.taskforce.tf_api.core.dto.response.AssistantAnswer.AssistantUsage.NONE, null, "qwen3:8b", read));

        mockMvc.perform(post(URL).with(auth())
                .accept(MediaType.APPLICATION_JSON)
                .contentType(MediaType.APPLICATION_JSON).content("{\"message\":\"résume\",\"attach\":["
                    + "{\"projectId\":30,\"issueId\":350},{\"projectId\":31},{\"issueId\":9}]}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.answer.read.issues[0].key").value("OPS-35"))
            .andExpect(jsonPath("$.data.answer.read.issues[0].comments").value(3));
        // Une issue sans son projet ne se lit pas.
        verify(agentService).run(eq("acme"), eq(7L), eq("résume"), any(), eq(Screen.NONE),
            eq(java.util.List.of(new Screen(30L, 350L), new Screen(31L, null))));
        verify(conversationService).appendMessage(1L, "assistant", "Réponse", "fast", 0, "qwen3:8b", read);
    }

    @Test
    @DisplayName("POST assistant avec plus de trois pièces jointes → 400")
    void chat_too_many_attachments_400() throws Exception {
        mockMvc.perform(post(URL).with(auth())
                .accept(MediaType.APPLICATION_JSON)
                .contentType(MediaType.APPLICATION_JSON).content("{\"message\":\"hi\",\"attach\":["
                    + "{\"projectId\":1},{\"projectId\":2},{\"projectId\":3},{\"projectId\":4}]}"))
            .andExpect(status().isBadRequest());
        verify(agentService, never()).run(any(), any(), any(), any(), any(), any());
    }

    /**
     * La recette de la 1.13 (étapes 35 et 38) : un texte de 11 000 caractères était refusé avant que le budget de la
     * requête le voie. La borne ne protège plus que le serveur : un long message passe, la réponse dit le reste.
     */
    @org.junit.jupiter.params.ParameterizedTest(name = "{0} caractères : {1}")
    @org.junit.jupiter.params.provider.CsvSource({"11482, 200", "400000, 200", "400001, 400"})
    void a_long_message_is_only_bounded_to_protect_the_server(int length, int expected) throws Exception {
        answering("Answered.");

        mockMvc.perform(post(URL).with(auth())
                .accept(MediaType.APPLICATION_JSON)
                .contentType(MediaType.APPLICATION_JSON).content("{\"message\":\"" + "a".repeat(length) + "\"}"))
            .andExpect(status().is(expected));
    }

    @Test
    @DisplayName("POST assistant trop long : le refus dit la limite et quoi faire, dans le champ du message")
    void a_refused_message_says_the_limit() throws Exception {
        mockMvc.perform(post(URL).with(auth())
                .accept(MediaType.APPLICATION_JSON)
                .contentType(MediaType.APPLICATION_JSON).content("{\"message\":\"" + "a".repeat(400_001) + "\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.validationErrors.message[0]").value(
                "This message is too long: TaskForce takes 400,000 characters at most. Shorten it, or split it in two."));
        verify(agentService, never()).run(any(), any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("POST assistant avec un écran invalide (@Positive) → 400")
    void chat_invalid_screen_400() throws Exception {
        mockMvc.perform(post(URL).with(auth())
                .accept(MediaType.APPLICATION_JSON)
                .contentType(MediaType.APPLICATION_JSON).content("{\"message\":\"hi\",\"screen\":{\"projectId\":-1}}"))
            .andExpect(status().isBadRequest());
        verify(agentService, never()).run(any(), any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("POST actions/answer → 200 : les réponses d'une carte de TaskForce, toutes à la fois, et la suite du geste (R115)")
    void answer_200() throws Exception {
        String record = "00000000-0000-0000-0000-0000000000aa";
        String ref = "sha256:" + "d".repeat(64);
        when(agentService.answer(eq("acme"), eq(7L), eq("create_project"), eq(record), eq(ref), any()))
            .thenReturn(new AssistantToolCall("create_project", "success", "{\"name\":\"Atlas\"}",
                "Project created in TaskForce: ATLAS \"Atlas\" (id 31).", record, "sha256:r1", null));

        mockMvc.perform(post(URL + "/actions/answer").with(auth())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"tool\":\"create_project\",\"record\":\"" + record + "\",\"ref\":\"" + ref + "\",\"answers\":["
                    + "{\"field\":\"name\",\"other\":\"Atlas\"},{\"field\":\"repository\",\"values\":[\"new-private\"]}]}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.status").value("success"))
            .andExpect(jsonPath("$.data.ref").value("sha256:r1"));
        // Chaque question a sa réponse, telle que la carte l'a envoyée : ce qui est tapé, et les choix cochés.
        @SuppressWarnings("unchecked")
        org.mockito.ArgumentCaptor<java.util.List<com.taskforce.tf_api.core.service.agent.Question.Answer>> answers =
            org.mockito.ArgumentCaptor.forClass(java.util.List.class);
        verify(agentService).answer(eq("acme"), eq(7L), eq("create_project"), eq(record), eq(ref), answers.capture());
        org.assertj.core.api.Assertions.assertThat(answers.getValue()).containsExactly(
            new com.taskforce.tf_api.core.service.agent.Question.Answer("name", java.util.List.of(), "Atlas"),
            new com.taskforce.tf_api.core.service.agent.Question.Answer("repository", java.util.List.of("new-private"), ""));
    }

    @ParameterizedTest(name = "answer {0} → 400")
    @ValueSource(strings = {
        "{\"tool\":\"delete_issue\",\"record\":\"r\",\"ref\":\"q\"}",                                        // sans réponse
        "{\"tool\":\"delete_issue\",\"record\":\"r\",\"ref\":\"q\",\"answers\":[]}",                         // une carte vide
        "{\"tool\":\"delete_issue\",\"record\":\"r\",\"answers\":[{\"field\":\"issue\",\"other\":\"x\"}]}",  // sans carte
        "{\"tool\":\"delete_issue\",\"ref\":\"q\",\"answers\":[{\"field\":\"issue\",\"other\":\"x\"}]}",     // sans dossier
        "{\"tool\":\"delete_issue\",\"record\":\"r\",\"ref\":\"q\",\"answers\":[{\"other\":\"x\"}]}",        // sans question
        "{\"tool\":\"t\",\"record\":\"r\",\"ref\":\"q\",\"answers\":[{\"field\":\"a\"},{\"field\":\"b\"},{\"field\":\"c\"}]}",
        "{\"tool\":\"t\",\"record\":\"r\",\"ref\":\"q\",\"answers\":[{\"field\":\"a\",\"values\":[\"1\",\"2\",\"3\",\"4\",\"5\"]}]}",
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
