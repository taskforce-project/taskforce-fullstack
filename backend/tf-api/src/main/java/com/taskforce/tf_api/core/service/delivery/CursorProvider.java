package com.taskforce.tf_api.core.service.delivery;

import java.util.LinkedHashMap;
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
 * Provider de délégation <b>Cursor</b> via l'API <b>Background Agents</b> (TF-AGENT-DELIVERY).
 *
 * <p>Provider <b>asynchrone</b> : {@code dispatch} lance un background agent sur le dépôt lié au projet
 * (le run tourne dans le cloud de Cursor, sous le compte de l'utilisateur, facturé chez lui) et rend le
 * handle de l'agent ; {@code poll} interroge son état jusqu'à la PR. La clé API Cursor du workspace est
 * stockée chiffrée ({@link IntegrationProvider#CURSOR}). Nécessite un <b>dépôt lié</b> (slice 1).</p>
 *
 * <p><b>Non vérifié en live</b> (pas de compte Cursor de test) : câblé sur le contrat public documenté
 * (`api.cursor.com/v0/agents`), prouvé par {@code MockRestServiceServer}. Une différence de contrat →
 * le run échoue proprement (FAILED → « Blocked » avec le message), rien d'autre ne casse.</p>
 */
@Component
@Slf4j
public class CursorProvider implements DeliveryAgentProvider {

    static final String AGENTS_URL = "https://api.cursor.com/v0/agents";

    private final IntegrationRepository integrationRepository;
    private final RestTemplate http;

    public CursorProvider(IntegrationRepository integrationRepository) {
        this.integrationRepository = integrationRepository;
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5_000);
        factory.setReadTimeout(30_000);
        this.http = new RestTemplate(factory);
    }

    @Override public String key()          { return "cursor"; }
    @Override public String displayName()  { return "Cursor"; }
    @Override public String logoKey()      { return "cursor"; }
    @Override public boolean available()   { return true; }
    @Override public List<String> models() { return List.of("auto", "claude-4-sonnet", "gpt-5"); }

    @Override
    @SuppressWarnings({"rawtypes", "unchecked"})
    public DeliveryDispatch dispatch(AgentBrief brief) {
        String apiKey = requireApiKey(brief.workspaceId());
        String repo   = requireRepo(brief);

        Map<String, Object> source = new LinkedHashMap<>();
        source.put("repository", "https://github.com/" + repo);
        source.put("ref", "main");
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("prompt", Map.of("text", prompt(brief)));
        body.put("source", source);
        if (brief.model() != null && !brief.model().isBlank() && !"auto".equalsIgnoreCase(brief.model())) {
            body.put("model", brief.model().trim());
        }

        try {
            ResponseEntity<Map> resp = http.exchange(
                AGENTS_URL, HttpMethod.POST, new HttpEntity<>(body, headers(apiKey)), Map.class);
            Map<?, ?> payload = resp.getBody();
            String id = str(payload, "id");
            if (id == null) {
                throw new BusinessException("Cursor : reponse de lancement sans identifiant d'agent");
            }
            return new DeliveryDispatch(id); // asynchrone : le runner/refresh fera le poll
        } catch (RestClientResponseException e) {
            throw apiError(e, brief.issueId());
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException("Appel Cursor impossible : " + e.getMessage());
        }
    }

    @Override
    @SuppressWarnings({"rawtypes", "unchecked"})
    public DeliveryPoll poll(String externalRef, Long workspaceId) {
        String apiKey = requireApiKey(workspaceId);
        try {
            ResponseEntity<Map> resp = http.exchange(
                AGENTS_URL + "/" + externalRef, HttpMethod.GET, new HttpEntity<>(headers(apiKey)), Map.class);
            Map<?, ?> payload = resp.getBody();
            String status = str(payload, "status");
            DeliveryRunStatus mapped = mapStatus(status);
            if (mapped == DeliveryRunStatus.DONE) {
                String url = targetUrl(payload);
                String summary = str(payload, "summary");
                return new DeliveryPoll(DeliveryRunStatus.DONE,
                    summary != null ? summary : "Cursor a termine la tache. Voir la pull request.", url, null);
            }
            if (mapped == DeliveryRunStatus.FAILED) {
                return new DeliveryPoll(DeliveryRunStatus.FAILED, null, null,
                    "Cursor a echoue (statut " + status + ")");
            }
            return new DeliveryPoll(DeliveryRunStatus.RUNNING, null, null, null);
        } catch (RestClientResponseException e) {
            throw apiError(e, null);
        } catch (Exception e) {
            throw new BusinessException("Suivi Cursor impossible : " + e.getMessage());
        }
    }

    // ---------------------------------------------------------------------

    private HttpHeaders headers(String apiKey) {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        h.setBearerAuth(apiKey);
        return h;
    }

    private String requireApiKey(Long workspaceId) {
        if (workspaceId == null) {
            throw new BusinessException("Workspace introuvable pour la délégation");
        }
        return integrationRepository.findByWorkspaceIdAndProvider(workspaceId, IntegrationProvider.CURSOR)
            .map(Integration::getAccessToken)
            .filter(k -> k != null && !k.isBlank())
            .orElseThrow(() -> new BusinessException(
                "Connectez d'abord votre cle API Cursor dans les reglages de delegation du workspace"));
    }

    private String requireRepo(AgentBrief brief) {
        if (brief.repoFullName() == null || brief.repoFullName().isBlank()) {
            throw new BusinessException("Cursor a besoin d'un depot de code lie au projet (onglet repository)");
        }
        return brief.repoFullName().trim();
    }

    private DeliveryRunStatus mapStatus(String status) {
        if (status == null) return DeliveryRunStatus.RUNNING;
        String s = status.toUpperCase();
        if (s.equals("FINISHED") || s.equals("COMPLETED") || s.equals("DONE")) return DeliveryRunStatus.DONE;
        if (s.equals("ERROR") || s.equals("FAILED") || s.equals("EXPIRED") || s.equals("CANCELLED")) {
            return DeliveryRunStatus.FAILED;
        }
        return DeliveryRunStatus.RUNNING;
    }

    private String targetUrl(Map<?, ?> payload) {
        if (payload != null && payload.get("target") instanceof Map<?, ?> target) {
            Object pr = target.get("prUrl");
            if (pr != null) return pr.toString();
            Object url = target.get("url");
            if (url != null) return url.toString();
        }
        return null;
    }

    private String prompt(AgentBrief brief) {
        StringBuilder sb = new StringBuilder();
        sb.append(brief.title() == null ? "(sans titre)" : brief.title());
        if (brief.description() != null && !brief.description().isBlank()) {
            sb.append("\n\n").append(brief.description().trim());
        }
        return sb.toString();
    }

    private String str(Map<?, ?> payload, String key) {
        Object v = payload != null ? payload.get(key) : null;
        return v != null ? v.toString() : null;
    }

    private BusinessException apiError(RestClientResponseException e, Long issueId) {
        log.warn("Cursor API {} (issue {})", e.getStatusText(), issueId);
        String body = e.getResponseBodyAsString();
        String line = (body == null || body.isBlank()) ? "erreur inconnue"
            : (body.length() > 300 ? body.substring(0, 300) : body);
        return new BusinessException("Cursor API (" + e.getStatusText() + ") : " + line);
    }
}
