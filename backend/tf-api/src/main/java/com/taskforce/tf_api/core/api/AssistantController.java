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
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.taskforce.tf_api.core.dto.response.AssistantAnswer;
import com.taskforce.tf_api.core.dto.response.ChatTurnResponse;
import com.taskforce.tf_api.core.model.AiConversation;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.AiConversationService;
import com.taskforce.tf_api.core.service.agent.AgentService;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
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

    private Long resolveUserId(Jwt jwt) {
        String email = jwt.getClaimAsString("email");
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
        return user.getId();
    }

    // -------------------------------------------------------------------------
    // SSE endpoint — retourne la réponse LLM sous forme de Server-Sent Events
    // -------------------------------------------------------------------------

    @PostMapping(produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter chatStream(
        @PathVariable String slug,
        @Valid @RequestBody AssistantRequest body,
        @AuthenticationPrincipal Jwt jwt
    ) {
        SseEmitter emitter = new SseEmitter(60_000L); // 60s timeout

        // Exécution dans un thread séparé pour ne pas bloquer le Tomcat worker
        Long userId = resolveUserId(jwt);
        Thread.ofVirtual().start(() -> {
            try {
                String response = agentService.run(slug, userId, body.message()).answer();

                // Simuler un streaming par mots (chunks de ~5 mots)
                String[] words = response.split("(?<=\\s)|(?=\\s)");
                StringBuilder chunk = new StringBuilder();
                int wordCount = 0;

                for (String word : words) {
                    chunk.append(word);
                    wordCount++;
                    if (wordCount % 5 == 0) {
                        emitter.send(SseEmitter.event()
                            .name("chunk")
                            .data(chunk.toString()));
                        chunk.setLength(0);
                    }
                }

                // Dernier chunk restant
                if (!chunk.isEmpty()) {
                    emitter.send(SseEmitter.event()
                        .name("chunk")
                        .data(chunk.toString()));
                }

                // Signal de fin
                emitter.send(SseEmitter.event()
                    .name("done")
                    .data("[DONE]"));
                emitter.complete();

            } catch (Exception ex) {
                log.error("Assistant SSE error — workspace={}: {}", slug, ex.getMessage());
                try {
                    emitter.send(SseEmitter.event()
                        .name("error")
                        .data(ex.getMessage()));
                } catch (Exception ignored) {
                    // client disconnected
                }
                emitter.completeWithError(ex);
            }
        });

        return emitter;
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

        // Mémoire multi-tours : historique de la conversation AVANT d'ajouter le tour courant.
        List<Map<String, Object>> history = conversationService.recentHistory(conv.getId());
        AssistantAnswer answer = agentService.run(slug, userId, body.message(), history);

        // Persiste le tour dans la conversation (multi-conversation + historique).
        conversationService.appendMessage(conv.getId(), "user", body.message(), null, 0);
        conversationService.appendMessage(conv.getId(), "assistant", answer.answer(), answer.mode(),
            answer.usage() != null ? answer.usage().totalTokens() : 0);
        String title = conversationService.autoTitle(conv.getId(), body.message());

        return ResponseEntity.ok(ApiResponse.success(new ChatTurnResponse(conv.getId(), title, answer)));
    }

    // -------------------------------------------------------------------------
    // DTOs internes
    // -------------------------------------------------------------------------

    public record AssistantRequest(
        @NotBlank @Size(max = 4000) String message,
        Long conversationId
    ) {}
}
