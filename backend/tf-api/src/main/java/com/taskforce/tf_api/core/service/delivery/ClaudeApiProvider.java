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
 * Provider de délégation <b>Claude via l'API Anthropic</b> (TF-AGENT-DELIVERY B1).
 *
 * <p>Modèle « zéro install » : l'utilisateur colle sa clé API Anthropic (stockée chiffrée par workspace,
 * {@link Integration}), et TaskForce exécute la tâche <b>dans le cloud d'Anthropic, facturé sur son
 * compte</b>. C'est un provider <b>synchrone</b> : {@code dispatch} fait un appel Messages API et renvoie
 * directement le résultat via {@link DeliveryDispatch#immediateResult()} (pas de {@code poll}).</p>
 *
 * <p><b>Portée première passe</b> : un unique appel Messages → la sortie texte de Claude sert de résumé
 * livrable (plan, code, texte, analyse - donc <i>task-agnostic</i>). Le clone de dépôt + édits agentiques
 * + ouverture de PR (Managed Agents) est l'étape suivante, portée par le provider {@code claude-code}
 * (encore « à venir »).</p>
 */
@Component
@Slf4j
public class ClaudeApiProvider implements DeliveryAgentProvider {

    static final String MESSAGES_URL      = "https://api.anthropic.com/v1/messages";
    static final String ANTHROPIC_VERSION = "2023-06-01";
    private static final String DEFAULT_MODEL = "claude-sonnet-5";
    private static final int    MAX_TOKENS    = 4096;

    private final IntegrationRepository integrationRepository;
    private final RestTemplate http;

    public ClaudeApiProvider(IntegrationRepository integrationRepository) {
        this.integrationRepository = integrationRepository;
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5_000);
        factory.setReadTimeout(120_000); // un run peut être long
        this.http = new RestTemplate(factory);
    }

    @Override public String key()          { return "claude-api"; }
    @Override public String displayName()  { return "Claude (API)"; }
    @Override public String logoKey()      { return "anthropic"; } // logo vendorisé (SVGL)
    @Override public boolean available()   { return true; }
    @Override public List<String> models() { return List.of("claude-opus-5", "claude-sonnet-5"); }

    @Override
    @SuppressWarnings({"rawtypes", "unchecked"})
    public DeliveryDispatch dispatch(AgentBrief brief) {
        String apiKey = requireApiKey(brief.workspaceId());
        String model  = (brief.model() != null && !brief.model().isBlank())
            ? brief.model().trim() : DEFAULT_MODEL;

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("x-api-key", apiKey);
        headers.set("anthropic-version", ANTHROPIC_VERSION);

        Map<String, Object> body = Map.of(
            "model", model,
            "max_tokens", MAX_TOKENS,
            "system", systemPrompt(),
            "messages", List.of(Map.of("role", "user", "content", userPrompt(brief)))
        );

        try {
            ResponseEntity<Map> resp = http.exchange(
                MESSAGES_URL, HttpMethod.POST, new HttpEntity<>(body, headers), Map.class);
            Map<?, ?> payload = resp.getBody();
            String text = extractText(payload);
            String id = (payload != null && payload.get("id") != null) ? payload.get("id").toString() : "msg";
            return new DeliveryDispatch(id, new DeliveryPoll(DeliveryRunStatus.DONE, text, null, null));
        } catch (RestClientResponseException e) {
            // 401 clé invalide, 400 modèle inconnu, 429 quota/crédit, 529 surcharge...
            log.warn("Anthropic API {} sur délégation issue {}", e.getStatusText(), brief.issueId());
            throw new BusinessException(
                "Anthropic API (" + e.getStatusText() + ") : " + firstLine(e.getResponseBodyAsString()));
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException("Appel Anthropic impossible : " + e.getMessage());
        }
    }

    /** Lit la clé API Anthropic (chiffrée) connectée au workspace, ou lève une erreur claire si absente. */
    private String requireApiKey(Long workspaceId) {
        if (workspaceId == null) {
            throw new BusinessException("Workspace introuvable pour la délégation");
        }
        return integrationRepository.findByWorkspaceIdAndProvider(workspaceId, IntegrationProvider.ANTHROPIC)
            .map(Integration::getAccessToken)
            .filter(k -> k != null && !k.isBlank())
            .orElseThrow(() -> new BusinessException(
                "Connectez d'abord votre cle API Anthropic dans les reglages de delegation du workspace"));
    }

    /** Concatène les blocs texte de la réponse Messages API ({@code content:[{type:"text",text:...}]}). */
    private String extractText(Map<?, ?> payload) {
        if (payload == null || !(payload.get("content") instanceof List<?> content)) {
            return "(reponse vide)";
        }
        StringBuilder sb = new StringBuilder();
        for (Object block : content) {
            if (block instanceof Map<?, ?> m && "text".equals(m.get("type")) && m.get("text") != null) {
                if (sb.length() > 0) sb.append("\n\n");
                sb.append(m.get("text"));
            }
        }
        return sb.length() > 0 ? sb.toString() : "(reponse sans texte)";
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

    /** Première ligne bornée du corps d'erreur (le JSON d'erreur Anthropic tient sur une ligne). */
    private String firstLine(String s) {
        if (s == null || s.isBlank()) return "erreur inconnue";
        int nl = s.indexOf('\n');
        String line = (nl > 0) ? s.substring(0, nl) : s;
        return line.length() > 300 ? line.substring(0, 300) : line;
    }
}
