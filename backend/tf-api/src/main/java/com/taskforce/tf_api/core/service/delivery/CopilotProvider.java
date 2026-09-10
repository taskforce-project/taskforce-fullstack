package com.taskforce.tf_api.core.service.delivery;

import java.util.List;
import java.util.Map;

import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.client.RestTemplate;

import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.enums.IntegrationProvider;
import com.taskforce.tf_api.core.model.Integration;
import com.taskforce.tf_api.core.repository.IntegrationRepository;
import com.taskforce.tf_api.shared.exception.BusinessException;

import lombok.extern.slf4j.Slf4j;

/**
 * Provider de délégation <b>GitHub Copilot</b> (TF-AGENT-DELIVERY).
 *
 * <p>Première passe <b>synchrone</b> : exécute la tâche via l'<b>inférence de modèles hébergée par GitHub</b>
 * (endpoint OpenAI-compatible {@code models.github.ai/inference}) en réutilisant le <b>token GitHub déjà
 * connecté</b> au workspace ({@link IntegrationProvider#GITHUB}) - donc « sous le compte GitHub de
 * l'utilisateur », zéro clé supplémentaire. La sortie texte sert de résumé livrable (task-agnostic), rendue
 * immédiatement via {@link DeliveryDispatch#immediateResult()}.</p>
 *
 * <p><b>Suite</b> (comme {@code claude-code} pour Claude) : le <b>coding agent</b> Copilot qui ouvre une PR
 * (assignation d'issue au bot Copilot), asynchrone. <b>Non vérifié en live</b> (pas de compte Copilot de
 * test) : câblé sur le contrat public, prouvé par {@code MockRestServiceServer} ; un token sans accès aux
 * modèles → le run échoue proprement (FAILED → « Blocked » avec le message).</p>
 */
@Component
@Slf4j
public class CopilotProvider implements DeliveryAgentProvider {

    static final String INFERENCE_URL = "https://models.github.ai/inference/chat/completions";
    private static final String DEFAULT_MODEL = "openai/gpt-4o-mini";
    private static final int    MAX_TOKENS    = 4096;

    private final IntegrationRepository integrationRepository;
    private final RestTemplate http;

    public CopilotProvider(IntegrationRepository integrationRepository) {
        this.integrationRepository = integrationRepository;
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5_000);
        factory.setReadTimeout(120_000);
        this.http = new RestTemplate(factory);
    }

    @Override public String key()          { return "github-copilot"; }
    @Override public String displayName()  { return "GitHub Copilot"; }
    @Override public String logoKey()      { return "githubcopilot"; }
    @Override public boolean available()   { return true; }
    @Override public List<String> models() { return List.of("openai/gpt-4o", "openai/gpt-4o-mini"); }

    @Override
    @SuppressWarnings({"rawtypes", "unchecked"})
    public DeliveryDispatch dispatch(AgentBrief brief) {
        String token = requireGithubToken(brief.workspaceId());
        String model = (brief.model() != null && !brief.model().isBlank()) ? brief.model().trim() : DEFAULT_MODEL;

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(token);

        Map<String, Object> body = Map.of(
            "model", model,
            "max_tokens", MAX_TOKENS,
            "messages", List.of(
                Map.of("role", "system", "content", systemPrompt()),
                Map.of("role", "user", "content", userPrompt(brief)))
        );

        try {
            ResponseEntity<Map> resp = http.exchange(
                INFERENCE_URL, HttpMethod.POST, new HttpEntity<>(body, headers), Map.class);
            Map<?, ?> payload = resp.getBody();
            String text = extractText(payload);
            String id = (payload != null && payload.get("id") != null) ? payload.get("id").toString() : "cmpl";
            return new DeliveryDispatch(id, new DeliveryPoll(DeliveryRunStatus.DONE, text, null, null));
        } catch (RestClientResponseException e) {
            log.warn("GitHub Models {} sur délégation issue {}", e.getStatusText(), brief.issueId());
            throw new BusinessException(
                "GitHub Copilot (" + e.getStatusText() + ") : " + firstLine(e.getResponseBodyAsString()));
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException("Appel GitHub Copilot impossible : " + e.getMessage());
        }
    }

    private String requireGithubToken(Long workspaceId) {
        if (workspaceId == null) {
            throw new BusinessException("Workspace introuvable pour la délégation");
        }
        return integrationRepository.findByWorkspaceIdAndProvider(workspaceId, IntegrationProvider.GITHUB)
            .map(Integration::getAccessToken)
            .filter(k -> k != null && !k.isBlank())
            .orElseThrow(() -> new BusinessException(
                "Connectez d'abord GitHub au workspace (reglages Integrations) pour deleguer a Copilot"));
    }

    /** Concatène le texte de la première réponse OpenAI ({@code choices[0].message.content}). */
    private String extractText(Map<?, ?> payload) {
        if (payload == null || !(payload.get("choices") instanceof List<?> choices) || choices.isEmpty()) {
            return "(reponse vide)";
        }
        if (choices.get(0) instanceof Map<?, ?> choice
            && choice.get("message") instanceof Map<?, ?> message
            && message.get("content") != null) {
            String content = message.get("content").toString();
            return content.isBlank() ? "(reponse sans texte)" : content;
        }
        return "(reponse sans texte)";
    }

    private String systemPrompt() {
        return "Tu es un agent de livraison dans TaskForce. On te confie une tache issue d'un tableau kanban. "
            + "Produis le livrable concret et directement exploitable (plan d'action, code, texte, analyse) "
            + "selon l'objectif de la tache. Sois precis et actionnable.";
    }

    private String userPrompt(AgentBrief brief) {
        StringBuilder sb = new StringBuilder();
        sb.append("Tache : ").append(brief.title() == null ? "(sans titre)" : brief.title());
        if (brief.description() != null && !brief.description().isBlank()) {
            sb.append("\n\nDescription :\n").append(brief.description().trim());
        }
        if (brief.repoFullName() != null && !brief.repoFullName().isBlank()) {
            sb.append("\n\nDepot de code concerne : ").append(brief.repoFullName().trim());
        }
        return sb.toString();
    }

    private String firstLine(String s) {
        if (s == null || s.isBlank()) return "erreur inconnue";
        int nl = s.indexOf('\n');
        String line = (nl > 0) ? s.substring(0, nl) : s;
        return line.length() > 300 ? line.substring(0, 300) : line;
    }
}
