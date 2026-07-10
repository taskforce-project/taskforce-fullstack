package com.taskforce.tf_api.core.service.agent;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.dto.response.ChartSpecResponse;
import com.taskforce.tf_api.core.service.LlmClient;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Traduit une demande en langage naturel en {@link ChartSpecResponse} — un graphe rendu depuis
 * les <b>vraies séries analytics</b>, jamais des données inventées.
 *
 * <p>L'IA ne choisit que le cadrage : quel jeu de données, quel type de graphe, quelles séries.
 * On lui décrit un <b>catalogue fermé</b> ({@link #DATASETS}) et on valide sa sortie contre ce
 * catalogue — une clé de série inconnue est écartée, un dataset inconnu est refusé. Si aucun LLM
 * n'est configuré (ou s'il échoue), un repli déterministe par mots-clés garde la fonction utile.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ChartSpecService {

    private final BrainAccessGuard access;
    private final LlmClient        llm;
    private final ObjectMapper     objectMapper;

    @Value("${ai.groq.assistant-model:llama-3.3-70b-versatile}")
    private String model;

    /** Un jeu de données réel et ses séries traçables — le périmètre de ce que l'IA peut demander. */
    private record Dataset(String key, String defaultChartType, List<String> series, String describe) {}

    /** Catalogue fermé. Toute spec produite est validée contre lui (pas d'invention de dataset/série). */
    private static final Map<String, Dataset> DATASETS = new LinkedHashMap<>();
    static {
        DATASETS.put("throughput", new Dataset("throughput", "area", List.of("opened", "resolved"),
            "Tâches ouvertes et résolues au fil du temps (série temporelle ; bucket day|week)."));
        DATASETS.put("burndown", new Dataset("burndown", "line", List.of("remaining", "ideal"),
            "Reste à faire d'un sprint comparé à la trajectoire idéale, jour par jour."));
        DATASETS.put("capacity", new Dataset("capacity", "bar", List.of("openIssues"),
            "Nombre d'issues ouvertes par membre (comparaison catégorielle)."));
        DATASETS.put("workload", new Dataset("workload", "heatmap", List.of(),
            "Intensité de charge par membre et par jour (heatmap ; pas de choix de séries)."));
    }

    private static final List<String> CHART_TYPES = List.of("area", "bar", "line");

    public ChartSpecResponse generate(String slug, Long userId, String prompt, Long projectId) {
        access.resolveAndAuthorize(slug, userId);  // autorisation (membre du workspace)

        if (llm.isConfigured()) {
            try {
                return validate(callLlm(prompt), prompt);
            } catch (Exception ex) {
                log.warn("Génération de graphe IA indisponible : {}", ex.getMessage());
            }
        }
        return heuristic(prompt);
    }

    // =========================================================================
    // LLM
    // =========================================================================

    private ChartSpecResponse callLlm(String prompt) throws Exception {
        String content = llm.chatCompletion(model, systemPrompt(), prompt, true, "fast");
        JsonNode json = objectMapper.readTree(content);
        String unsupported = text(json, "unsupported");
        if (!unsupported.isEmpty()) {
            return new ChartSpecResponse(text(json, "title"), "", null, null, null, List.of(), unsupported);
        }
        List<String> series = new ArrayList<>();
        JsonNode s = json.path("series");
        if (s.isArray()) s.forEach(n -> series.add(n.asText("").trim()));
        return new ChartSpecResponse(
            text(json, "title"),
            text(json, "description"),
            text(json, "dataset").toLowerCase(Locale.ROOT),
            text(json, "chartType").toLowerCase(Locale.ROOT),
            emptyToNull(text(json, "bucket").toLowerCase(Locale.ROOT)),
            series,
            null);
    }

    private String systemPrompt() {
        StringBuilder sb = new StringBuilder();
        sb.append("Tu es un assistant d'analyse pour Taskforce. À partir d'une demande en langage ")
          .append("naturel, tu choisis COMMENT visualiser un jeu de données réel. Tu ne fabriques ")
          .append("aucune donnée : tu ne fais que sélectionner un dataset, un type de graphe et des séries.\n\n")
          .append("Jeux de données disponibles (les SEULS autorisés) :\n");
        for (Dataset d : DATASETS.values()) {
            sb.append("- \"").append(d.key()).append("\" : ").append(d.describe());
            if (!d.series().isEmpty()) sb.append(" Séries valides : ").append(String.join(", ", d.series())).append(".");
            sb.append("\n");
        }
        sb.append("\nRéponds STRICTEMENT en JSON (aucun texte hors JSON) :\n")
          .append("{\"title\": string (titre court en français), \"description\": string (une phrase), ")
          .append("\"dataset\": un des identifiants ci-dessus, \"chartType\": \"area\"|\"bar\"|\"line\", ")
          .append("\"bucket\": \"day\"|\"week\"|null (uniquement pour throughput), ")
          .append("\"series\": array des clés de séries valides pour ce dataset}\n\n")
          .append("Si la demande ne peut PAS être satisfaite avec ces jeux de données (ex. revenus, ")
          .append("données externes), réponds UNIQUEMENT {\"unsupported\": string} expliquant brièvement ")
          .append("en français ce qui manque. Ne propose jamais de données que tu n'as pas.");
        return sb.toString();
    }

    // =========================================================================
    // Validation contre le catalogue
    // =========================================================================

    private ChartSpecResponse validate(ChartSpecResponse spec, String prompt) {
        if (spec.unsupported() != null && !spec.unsupported().isBlank()) return spec;

        Dataset dataset = DATASETS.get(spec.dataset());
        if (dataset == null) {
            // L'IA a choisi un dataset hors catalogue → on retombe sur l'heuristique plutôt que de rendre du faux.
            log.debug("Dataset IA inconnu '{}', repli heuristique", spec.dataset());
            return heuristic(prompt);
        }

        String chartType = CHART_TYPES.contains(spec.chartType()) ? spec.chartType() : dataset.defaultChartType();

        // On ne garde que les séries réellement valides pour ce dataset ; sinon toutes ses séries par défaut.
        List<String> series = new ArrayList<>(spec.series() == null ? List.of() : spec.series());
        series.retainAll(dataset.series());
        if (series.isEmpty()) series = new ArrayList<>(dataset.series());

        String bucket = "throughput".equals(dataset.key())
            ? ("day".equals(spec.bucket()) ? "day" : "week")
            : null;

        String title = spec.title() == null || spec.title().isBlank() ? defaultTitle(dataset) : spec.title().trim();
        String description = spec.description() == null ? "" : spec.description().trim();

        return new ChartSpecResponse(title, description, dataset.key(), chartType, bucket, series, null);
    }

    // =========================================================================
    // Repli déterministe (LLM absent ou en échec)
    // =========================================================================

    private ChartSpecResponse heuristic(String prompt) {
        String p = prompt == null ? "" : prompt.toLowerCase(Locale.ROOT);

        if (containsAny(p, "burndown", "reste", "sprint", "restant", "idéal", "ideal")) {
            return spec("Burndown du sprint", "burndown", "line", null, List.of("remaining", "ideal"));
        }
        if (containsAny(p, "membre", "charge", "capacit", "assign", "équipe", "equipe", "surcharge")) {
            if (containsAny(p, "jour", "heatmap", "quotidien", "semaine", "période", "periode")) {
                return spec("Charge de l'équipe", "workload", "heatmap", null, List.of());
            }
            return spec("Charge par membre", "capacity", "bar", null, List.of("openIssues"));
        }
        boolean daily = containsAny(p, "jour", "quotidien", "30", "daily");
        return spec(daily ? "Débit quotidien" : "Débit hebdomadaire",
            "throughput", "area", daily ? "day" : "week", List.of("resolved", "opened"));
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private ChartSpecResponse spec(String title, String dataset, String chartType, String bucket, List<String> series) {
        return new ChartSpecResponse(title, "", dataset, chartType, bucket, series, null);
    }

    private String defaultTitle(Dataset d) {
        return switch (d.key()) {
            case "throughput" -> "Débit";
            case "burndown"   -> "Burndown du sprint";
            case "capacity"   -> "Charge par membre";
            case "workload"   -> "Charge de l'équipe";
            default           -> "Graphe";
        };
    }

    private boolean containsAny(String haystack, String... needles) {
        for (String n : needles) if (haystack.contains(n)) return true;
        return false;
    }

    private String text(JsonNode node, String field) {
        return node.path(field).asText("").trim();
    }

    private String emptyToNull(String value) {
        return value == null || value.isEmpty() || "null".equals(value) ? null : value;
    }
}
