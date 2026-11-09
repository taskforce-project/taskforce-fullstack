package com.taskforce.tf_api.core.api;

import java.util.List;
import java.util.Map;
import java.util.Objects;

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
import com.taskforce.tf_api.core.service.agent.CortexTurns;
import com.taskforce.tf_api.core.service.agent.ModelCapabilityService;
import com.taskforce.tf_api.core.service.agent.ProjectCorrection;
import com.taskforce.tf_api.core.service.agent.Question;
import com.taskforce.tf_api.core.service.agent.QuestionNeeded;
import com.taskforce.tf_api.core.service.agent.Screen;
import com.taskforce.tf_api.core.service.agent.TurnInput;
import com.taskforce.tf_api.core.service.agent.TurnInput.LastCard;
import com.taskforce.tf_api.core.service.ai.AttachedFile;
import com.taskforce.tf_api.core.service.ai.ChosenModel;
import com.taskforce.tf_api.core.service.ai.TurnHistory;
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
    private final CortexTurns           turns;

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
        return ResponseEntity.ok(ApiResponse.success(turns.run(userId, body.turn(), () -> turn(slug, ws, userId, body))));
    }

    /**
     * Arrête un tour de la personne (R134) : l'appel au modèle en cours est coupé, le suivant ne part pas. Rend le tour tel
     * qu'il s'est arrêté et gardé ; null quand il n'a pas encore commencé, qu'il est déjà fini ou qu'il finit encore.
     */
    @PostMapping(value = "/stop", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ApiResponse<ChatTurnResponse>> stop(
        @PathVariable String slug,
        @Valid @RequestBody AssistantStopRequest body,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        access.resolveAndAuthorize(slug, userId);
        return ResponseEntity.ok(ApiResponse.success(turns.stop(userId, body.turn())));
    }

    private ChatTurnResponse turn(String slug, Workspace ws, Long userId, AssistantRequest body) {
        // La conversation travaille dans le projet que la rangée sous le compositeur montre (R135) ; l'écran n'en décide plus.
        AiConversation conv = conversationService.getOrCreate(ws.getId(), userId, body.conversationId(),
            body.project() == null ? null : body.project().id());
        if (body.conversationId() != null && body.project() != null
            && !Objects.equals(conv.getProjectId(), body.project().id())) {
            conversationService.setProject(conv.getId(), userId, ws.getId(), body.project().id());
        }
        Long project = body.project() != null ? body.project().id() : conv.getProjectId();

        // La taille de la conversation AVANT d'ajouter le tour courant, que la proposition d'un modèle compare (R118).
        List<Map<String, Object>> history = conversationService.recentHistory(conv.getId());
        // Mémoire multi-tours : ce qui part au modèle se choisit quand la requête est construite, selon sa fenêtre, et les
        // messages les plus anciens se condensent d'abord si elle passerait 80 % (TF-J1-13). L'écran de la personne
        // (R114) : Cortex le lit avant les notes, avec ses droits.
        TurnHistory memory = (budget, tier) -> conversationService.fit(conv.getId(), budget, tier);
        // Le modèle : celui vers lequel la personne envoie la demande d'un clic (R118), sinon celui qu'elle a choisi
        // (R113), sinon celui de l'instance. TaskForce ne change jamais de modèle sans elle.
        String sentTo = capabilities.requestedModel(body.model());
        String chosen = sentTo != null ? sentTo : capabilities.chosenModel(userId);
        // « Tu t'es trompé de projet » reprend la dernière carte préparée de cette conversation (R135).
        LastCard lastCard = ProjectCorrection.asks(body.message()) ? conversationService.lastCard(conv.getId()).orElse(null) : null;
        TurnInput input = new TurnInput(body.message(), memory, body.screenOf(), body.attachedOf(), body.filesOf(), conv.getId(),
            project, lastCard);
        AssistantAnswer answer = ChosenModel.using(chosen, () -> agentService.run(slug, userId, input));
        boolean stopped = AgentService.STOPPED_MODE.equals(answer.mode());
        // Ce que TaskForce dit sous la réponse : un modèle qui tient une demande trop grande (TF-J1-13), la proposition d'un
        // modèle plus fort, ou la demande envoyée à un autre. Rien sous un tour que la personne a arrêté.
        ChatTurnResponse.Escalation escalation = sentTo != null || stopped ? null : answer.offer() != null ? answer.offer()
            : capabilities.offer(body.message(), history, capabilities.cortexModel(chosen)).orElse(null);
        String notice = stopped ? null : sentTo != null ? ModelCapabilityService.sentNotice(sentTo)
            : escalation != null ? escalation.text() : null;

        // Persiste le tour dans la conversation (multi-conversation + historique), avec ce que TaskForce y a dit et ce qu'il
        // a donné à lire au modèle (la ligne grise, R123) : une conversation rouverte se relit pareil, les fichiers joints et
        // « Stopped by you » compris.
        conversationService.appendAsked(conv.getId(), body.message(), keptFiles(body.filesOf(), answer));
        conversationService.appendAnswer(conv.getId(),
            notice == null ? answer.answer() : answer.answer() + ModelCapabilityService.block(notice), answer.mode(),
            answer.usage() != null ? answer.usage().totalTokens() : 0, answer.model(), answer.read(), preparedCard(answer));
        String title = conversationService.autoTitle(conv.getId(), body.message());

        return new ChatTurnResponse(conv.getId(), title, answer, escalation, sentTo, conversationService.currentProject(conv.getId()));
    }

    /**
     * Ce qui reste des fichiers avec la demande (R134) : leur contenu quand le modèle l'a reçu ; sinon leurs noms, pour qu'une
     * demande trop grande pour ce modèle ne fasse pas tomber l'historique des tours suivants.
     */
    private static List<AttachedFile> keptFiles(List<AttachedFile> files, AssistantAnswer answer) {
        boolean read = answer.read() != null && !answer.read().files().isEmpty();
        return read ? files : files.stream().map(AttachedFile::nameOnly).toList();
    }

    /** La carte que cette réponse prépare (R135), ou la question qui la précède : ce que « tu t'es trompé de projet » reprend. */
    private static LastCard preparedCard(AssistantAnswer answer) {
        return answer.toolCalls() == null ? null : answer.toolCalls().stream()
            .filter(call -> AgentService.PREPARED.contains(call.name())
                && ("pending".equals(call.status()) || AgentService.QUESTION.equals(call.status())))
            .reduce((first, second) -> second)
            .map(call -> new LastCard(call.name(), call.input()))
            .orElse(null);
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
     * (R118). {@code attach} : ce qu'elle a joint depuis le compositeur (R123), trois au plus : une issue (son projet et
     * son id), que TaskForce lit comme avant un résumé, ou un projet (sans issue), dont il montre le tableau.
     * {@code turn} : le nom que le client donne à ce tour, pour pouvoir l'arrêter (R134) ; {@code project} : le projet de
     * la conversation tel que la rangée le montre (R135) : son {@code id}, null pour « No project », absent pour le laisser
     * tel qu'il est ; {@code files} : les fichiers texte joints (R134), cinq au plus, 256 Ko chacun.
     */
    public record AssistantRequest(
        @NotBlank @Size(max = 4000) String message,
        Long conversationId,
        @Valid ScreenRequest screen,
        @Size(max = 128) String model,
        @Size(max = 3) List<@NotNull @Valid ScreenRequest> attach,
        @Size(max = 64) String turn,
        @Valid ProjectRequest project,
        @Size(max = AttachedFile.MAX_FILES) List<@NotNull @Valid FileRequest> files
    ) {
        Screen screenOf() {
            return screen == null ? Screen.NONE : new Screen(screen.projectId(), screen.issueId());
        }

        /** Les pièces jointes, chacune dans son projet : une issue sans projet ne se lit pas. */
        List<Screen> attachedOf() {
            if (attach == null) return List.of();
            return attach.stream().filter(item -> item.projectId() != null)
                .map(item -> new Screen(item.projectId(), item.issueId())).toList();
        }

        List<AttachedFile> filesOf() {
            return files == null ? List.of() : files.stream().map(file -> new AttachedFile(file.name(), file.text())).toList();
        }
    }

    /** Le projet de la conversation : son id, null pour aucun. */
    public record ProjectRequest(@Positive Long id) {}

    /** Un fichier texte joint à la demande : son nom et son contenu, lus dans le navigateur. */
    public record FileRequest(
        @NotBlank @Size(max = 255) String name,
        @NotNull @Size(max = AttachedFile.MAX_CHARS) String text
    ) {}

    /** Le tour à arrêter, par le nom que le client lui a donné. */
    public record AssistantStopRequest(@NotBlank @Size(max = 64) String turn) {}

    /**
     * Le projet ouvert et l'issue ouverte, par leurs ids, ou ce que la personne a joint ; ce qu'ils montrent se relit avec
     * ses droits.
     */
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
