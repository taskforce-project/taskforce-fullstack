package com.taskforce.tf_api.core.api;

import java.util.List;
import java.util.Map;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.dto.response.AssistantActionResult;
import com.taskforce.tf_api.core.dto.response.AssistantAnswer;
import com.taskforce.tf_api.core.dto.response.AssistantAnswer.AssistantToolCall;
import com.taskforce.tf_api.core.dto.response.ChatTurnResponse;
import com.taskforce.tf_api.core.model.AiConversation;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.AiConversationService;
import com.taskforce.tf_api.core.service.agent.AgentService;
import com.taskforce.tf_api.core.service.agent.ModelCapabilityService;
import com.taskforce.tf_api.core.service.agent.Question;
import com.taskforce.tf_api.core.service.agent.QuestionNeeded;
import com.taskforce.tf_api.core.service.agent.Screen;
import com.taskforce.tf_api.core.service.ai.ChosenModel;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Endpoint pour l'assistant IA du workspace.
 *
 * POST /api/workspaces/{slug}/assistant
 *   Body  : { "message": "..." }
 *   Accept: text/event-stream   → SSE token-by-token (simulé)
 *   Accept: application/json    → réponse complète JSON
 */
@RestController
@RequestMapping("/api/workspaces/{slug}/assistant")
@RequiredArgsConstructor
@Slf4j
public class AssistantController {

    private final AgentService          agentService;
    private final UserRepository        userRepository;
    private final BrainAccessGuard      access;
    private final AiConversationService conversationService;
    private final ModelCapabilityService capabilities;

    private Long resolveUserId(Jwt jwt) {
        String email = jwt.getClaimAsString("email");
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        return user.getId();
    }

    // -------------------------------------------------------------------------
    // JSON endpoint — réponse complète (utile pour tests / curl)
    // -------------------------------------------------------------------------

    @PostMapping(produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ApiResponse<ChatTurnResponse>> chat(
        @PathVariable String slug,
        @Valid @RequestBody AssistantRequest body,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        AiConversation conv = conversationService.getOrCreate(ws.getId(), userId, body.conversationId());

        // Compression de contexte : condense les anciens échanges si le fil est trop long (avant de lire l'historique).
        conversationService.compressIfNeeded(conv.getId());

        // Mémoire multi-tours : historique de la conversation AVANT d'ajouter le tour courant. L'écran de la personne
        // (R114) : Cortex le lit avant les notes, avec ses droits.
        List<Map<String, Object>> history = conversationService.recentHistory(conv.getId());
        // Le modèle : celui vers lequel la personne envoie la demande d'un clic (R118), sinon celui qu'elle a choisi
        // (R113), sinon celui de l'instance. TaskForce ne change jamais de modèle sans elle.
        String sentTo = capabilities.requestedModel(body.model());
        String chosen = sentTo != null ? sentTo : capabilities.chosenModel(userId);
        AssistantAnswer answer = ChosenModel.using(chosen, () -> agentService.run(slug, userId, body.message(), history,
            body.screenOf()));
        // Ce que TaskForce dit sous la réponse : la proposition d'un modèle plus fort, ou la demande envoyée à un autre.
        ChatTurnResponse.Escalation escalation = sentTo != null ? null
            : capabilities.offer(body.message(), history, capabilities.cortexModel(chosen)).orElse(null);
        String notice = sentTo != null ? ModelCapabilityService.sentNotice(sentTo)
            : escalation != null ? escalation.text() : null;

        // Persiste le tour dans la conversation (multi-conversation + historique), avec ce que TaskForce y a dit : une
        // conversation rouverte se relit pareil.
        conversationService.appendMessage(conv.getId(), "user", body.message(), null, 0);
        conversationService.appendMessage(conv.getId(), "assistant",
            notice == null ? answer.answer() : answer.answer() + ModelCapabilityService.block(notice), answer.mode(),
            answer.usage() != null ? answer.usage().totalTokens() : 0, answer.model());
        String title = conversationService.autoTitle(conv.getId(), body.message());

        return ResponseEntity.ok(ApiResponse.success(new ChatTurnResponse(conv.getId(), title, answer, escalation, sentTo)));
    }

    /**
     * Lance une action que Cortex a proposée et que la personne accorde (« Approve and run ») : le service la rejuge par
     * les règles de l'espace et la garde au dossier de la réponse (R35).
     */
    @PostMapping(value = "/actions/execute", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ApiResponse<AssistantActionResult>> runApproved(
        @PathVariable String slug,
        @Valid @RequestBody AssistantActionRequest body,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        return ResponseEntity.ok(ApiResponse.success(
            agentService.runApproved(slug, userId, body.tool(), body.input(), body.record())));
    }

    /**
     * Défait d'un geste ce que Cortex vient de faire, depuis le dossier de la réponse (R77) : une création, ou un geste
     * sur une issue (un changement, un commentaire). {@code ref} nomme le résultat à défaire, quand une réponse en a
     * plusieurs du même outil.
     */
    @PostMapping(value = "/actions/undo", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ApiResponse<AssistantActionResult>> undo(
        @PathVariable String slug,
        @Valid @RequestBody AssistantUndoRequest body,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        return ResponseEntity.ok(ApiResponse.success(agentService.undo(slug, userId, body.tool(), body.record(), body.ref())));
    }

    /**
     * Les réponses de la personne à une carte de questions de TaskForce (R115), toutes à la fois : pour chaque question,
     * les choix cochés ou la réponse tapée. Le geste reprend sans le modèle, rejugé par les règles de l'espace, et rend la
     * suite : d'autres questions, sa carte, ou ce qu'il a fait.
     */
    @PostMapping(value = "/actions/answer", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ApiResponse<AssistantToolCall>> answerQuestion(
        @PathVariable String slug,
        @Valid @RequestBody AssistantAnswerRequest body,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        List<Question.Answer> answers = body.answers().stream()
            .map(answer -> new Question.Answer(answer.field(), answer.values(), answer.other()))
            .toList();
        return ResponseEntity.ok(ApiResponse.success(
            agentService.answer(slug, userId, body.tool(), body.record(), body.ref(), answers)));
    }

    // -------------------------------------------------------------------------
    // DTOs internes
    // -------------------------------------------------------------------------

    /**
     * {@code screen} : ce que la personne voit quand elle écrit (R114) ; absent, Cortex répond sans l'écran.
     * {@code model} : le modèle vers lequel la personne envoie cette demande, d'un clic sur la proposition de TaskForce
     * (R118).
     */
    public record AssistantRequest(
        @NotBlank @Size(max = 4000) String message,
        Long conversationId,
        @Valid ScreenRequest screen,
        @Size(max = 128) String model
    ) {
        Screen screenOf() {
            return screen == null ? Screen.NONE : new Screen(screen.projectId(), screen.issueId());
        }
    }

    /** Le projet ouvert et l'issue ouverte, par leurs ids ; ce qu'ils montrent se relit avec les droits de la personne. */
    public record ScreenRequest(@Positive Long projectId, @Positive Long issueId) {}

    /**
     * Les réponses à une carte de questions de TaskForce : l'outil et le dossier de la réponse qui l'a posée, {@code ref}
     * l'empreinte de la carte, et une réponse par question, deux au plus.
     */
    public record AssistantAnswerRequest(
        @NotBlank @Size(max = 128) String tool,
        @NotBlank @Size(max = 64) String record,
        @NotBlank @Size(max = 80) String ref,
        @NotEmpty @Size(max = QuestionNeeded.MAX_QUESTIONS) List<@NotNull @Valid QuestionAnswer> answers
    ) {}

    /**
     * La réponse à une question de la carte, nommée par l'argument qu'elle remplit : les valeurs des choix cochés (un
     * seul pour une question à un seul choix), et ce qui est tapé dans « Other ».
     */
    public record QuestionAnswer(
        @NotBlank @Size(max = 64) String field,
        @Size(max = Question.MAX_CHOICES) List<@NotBlank @Size(max = 200) String> values,
        @Size(max = 2000) String other
    ) {}

    /** L'action proposée, telle que la réponse l'a rendue : son outil, ses arguments, le dossier qui l'a vue naître. */
    public record AssistantActionRequest(
        @NotBlank @Size(max = 128) String tool,
        @Size(max = 20000) String input,
        @NotBlank @Size(max = 64) String record
    ) {}

    /** {@code ref} : l'empreinte du résultat à défaire, telle que la réponse l'a rendue ; absente, le dernier. */
    public record AssistantUndoRequest(
        @NotBlank @Size(max = 128) String tool,
        @NotBlank @Size(max = 64) String record,
        @Size(max = 80) String ref
    ) {}
}
