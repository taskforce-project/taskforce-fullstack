package com.taskforce.tf_api.core.service.mcp;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.dto.request.CreateIssueRequest;
import com.taskforce.tf_api.core.dto.request.CreateProjectRequest;
import com.taskforce.tf_api.core.dto.response.ProjectResponse;
import com.taskforce.tf_api.core.enums.IssuePriority;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.core.service.LlmClient;
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.shared.exception.BusinessException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Import d'un projet externe (TF-MCP-04) : tire les issues d'un outil connecté en MCP (ex. Linear),
 * les <b>normalise</b> en une passe LLM (générique, quel que soit le serveur), crée un projet <b>natif</b>
 * TaskForce et y recrée les issues en masse. C'est le « importer son boulot ici » du wizard.
 *
 * <p>Autorisation (membre + BUSINESS+ + manager) faite en amont par le contrôleur. Réutilise
 * {@link WorkspaceMcpService} pour le fetch (session + token OAuth gérés), donc aucun code par service.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class McpImportService {

    /** Bornes de sûreté : issues max par import, et taille max des données brutes envoyées au LLM. */
    private static final int MAX_IMPORT = 100;
    private static final int RAW_CHAR_LIMIT = 12_000;

    private final WorkspaceMcpService workspaceMcp;
    private final ProjectService projectService;
    private final IssueService issueService;
    private final LlmClient llm;
    private final ObjectMapper objectMapper;

    @Value("${ai.model.assistant:gateway-default}")
    private String model;

    /** Résultat d'un import : le projet créé + le nombre d'issues importées / trouvées. */
    public record ImportResult(Long projectId, String projectIdentifier, String projectName,
                               int imported, int found) {}

    /** Une issue normalisée depuis la source externe (schéma commun, quel que soit le serveur). */
    private record NormalizedIssue(String title, String description, IssuePriority priority) {}

    /**
     * Importe les issues du connecteur MCP {@code connectorKey} dans un nouveau projet {@code targetName}.
     */
    public ImportResult importProject(Workspace ws, Long userId, String connectorKey, String targetName) {
        if (connectorKey == null || connectorKey.isBlank()) throw new BusinessException("connectorKey requis");
        if (targetName == null || targetName.isBlank()) throw new BusinessException("Nom du projet cible requis");

        String issuesTool = findIssuesTool(ws.getId(), connectorKey);
        String raw = workspaceMcp.execute(ws.getId(), connectorKey + "__" + issuesTool, Map.of());
        List<NormalizedIssue> issues = normalize(raw);

        ProjectResponse project = projectService.createProject(ws.getSlug(), userId, projectRequest(targetName));
        int imported = 0;
        for (NormalizedIssue ni : issues) {
            if (imported >= MAX_IMPORT) break;
            try {
                issueService.createIssue(ws.getSlug(), project.getId(), issueRequest(ni), userId);
                imported++;
            } catch (Exception e) {
                log.warn("Import : issue « {} » ignorée : {}", ni.title(), e.getMessage());
            }
        }
        log.info("Import MCP {} → projet {} : {}/{} issues", connectorKey, project.getIdentifier(), imported, issues.size());
        return new ImportResult(project.getId(), project.getIdentifier(), project.getName(), imported, issues.size());
    }

    /** Cherche l'outil « lister les issues » du connecteur, par nom (générique). */
    private String findIssuesTool(Long workspaceId, String connectorKey) {
        List<String> tools = workspaceMcp.serverStatuses(workspaceId).stream()
            .filter(s -> connectorKey.equals(s.connectorKey()) && s.reachable())
            .findFirst()
            .map(WorkspaceMcpService.McpServerStatus::tools)
            .orElseThrow(() -> new BusinessException("Serveur MCP « " + connectorKey + " » non connecté ou injoignable"));
        return tools.stream().filter(t -> t.equalsIgnoreCase("list_issues")).findFirst()
            .or(() -> tools.stream().filter(t -> containsAll(t, "issue", "list")).findFirst())
            .or(() -> tools.stream().filter(t -> t.toLowerCase(Locale.ROOT).contains("issue")).findFirst())
            .orElseThrow(() -> new BusinessException("« " + connectorKey + " » n'expose pas d'outil de liste d'issues"));
    }

    private List<NormalizedIssue> normalize(String raw) {
        if (raw == null || raw.isBlank()) return List.of();
        String payload = raw.length() > RAW_CHAR_LIMIT ? raw.substring(0, RAW_CHAR_LIMIT) : raw;
        String json;
        if (llm.isConfigured()) {
            String system = "Tu extrais les issues d'un projet depuis des données brutes d'un outil externe. "
                + "Réponds STRICTEMENT en JSON, sans aucun texte autour : "
                + "{\"issues\":[{\"title\":\"...\",\"description\":\"...\",\"priority\":\"NONE|LOW|MEDIUM|HIGH|URGENT\"}]}. "
                + "title est obligatoire ; description et priority sont facultatifs.";
            try {
                json = llm.chatCompletion(model, system, "Données:\n" + payload, true);
            } catch (Exception e) {
                log.warn("Normalisation LLM échouée, tentative de parse direct : {}", e.getMessage());
                json = payload;
            }
        } else {
            json = payload; // pas de LLM configuré : on tente de parser directement le JSON de l'outil
        }
        return parseIssues(json);
    }

    private List<NormalizedIssue> parseIssues(String json) {
        List<NormalizedIssue> out = new ArrayList<>();
        if (json == null || json.isBlank()) return out;
        JsonNode root;
        try {
            root = objectMapper.readTree(json);
        } catch (Exception e) {
            return out; // format non exploitable → projet créé vide (l'appelant voit found=0)
        }
        JsonNode arr = root.isArray() ? root
            : root.has("issues") ? root.get("issues")
            : root.has("data") ? root.get("data")
            : null;
        if (arr == null || !arr.isArray()) return out;
        for (JsonNode n : arr) {
            String title = firstNonBlank(n, "title", "name", "summary");
            if (title == null) continue;
            out.add(new NormalizedIssue(title, firstNonBlank(n, "description", "body", "content"),
                parsePriority(text(n, "priority"))));
        }
        return out;
    }

    // -------------------------------------------------------------------------

    private CreateProjectRequest projectRequest(String name) {
        CreateProjectRequest r = new CreateProjectRequest();
        r.setName(name);
        r.setIdentifier(deriveIdentifier(name));
        return r;
    }

    private CreateIssueRequest issueRequest(NormalizedIssue ni) {
        CreateIssueRequest r = new CreateIssueRequest();
        r.setTitle(ni.title());
        if (ni.description() != null && !ni.description().isBlank()) r.setDescription(ni.description());
        if (ni.priority() != null) r.setPriority(ni.priority());
        return r;
    }

    private static boolean containsAll(String tool, String a, String b) {
        String t = tool.toLowerCase(Locale.ROOT);
        return t.contains(a) && t.contains(b);
    }

    private static String text(JsonNode n, String field) {
        JsonNode v = n.get(field);
        return v == null || v.isNull() ? null : v.asText(null);
    }

    private static String firstNonBlank(JsonNode n, String... fields) {
        for (String f : fields) {
            String v = text(n, f);
            if (v != null && !v.isBlank()) return v;
        }
        return null;
    }

    private static IssuePriority parsePriority(String s) {
        if (s == null || s.isBlank()) return null;
        try {
            return IssuePriority.valueOf(s.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static String deriveIdentifier(String name) {
        String base = name.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
        if (base.length() < 2) return "PRJ";
        return base.substring(0, Math.min(10, base.length()));
    }
}
