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
import com.taskforce.tf_api.core.dto.response.ChartSuggestion;
import com.taskforce.tf_api.core.dto.response.NamedValue;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.service.AiMeter;
import com.taskforce.tf_api.core.service.LlmClient;
import com.taskforce.tf_api.core.service.ProjectVisibilityGuard;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Traduit une demande en langage naturel en {@link ChartSpecResponse} — un graphe rendu depuis les
 * <b>vraies données</b>, jamais fabriquées. Deux capacités offertes au modèle :
 *
 * <ol>
 *   <li><b>Séries temporelles</b> (courbes dans le temps) : jeux de données fixes du {@link #DATASETS}
 *       — le front les charge via les endpoints analytics.</li>
 *   <li><b>Répartitions « X par Y »</b> : le modèle choisit une dimension / mesure / périmètre dans
 *       une whitelist et {@link AnalyticsQueryService} exécute une requête SQL sûre en base. C'est
 *       le vrai « retrieval » : le modèle interroge les données réelles sans jamais écrire de SQL.</li>
 * </ol>
 *
 * <p>Toute sortie est validée contre les whitelists ; hors périmètre → {@code unsupported} explicite.
 * Repli déterministe par mots-clés si le LLM est absent.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ChartSpecService {

    private final BrainAccessGuard       access;
    private final LlmClient              llm;
    private final AnalyticsQueryService  queryService;
    private final ObjectMapper           objectMapper;
    private final ProjectVisibilityGuard visibilityGuard;
    private final AiMeter                aiMeter; // gate quota + comptage de la conso tokens de la génération de graphe

    @Value("${ai.model.assistant:gateway-default}")
    private String model;

    // ── Séries temporelles ───────────────────────────────────────────────────

    private record Dataset(String key, String defaultChartType, List<String> series, String describe) {}

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
        DATASETS.put("projects", new Dataset("projects", "bar", List.of("completion", "done", "open"),
            "Avancement par projet : « completion » = % de complétion (pour « niveau d'avancement »), "
            + "« done »/« open » = issues terminées/ouvertes par projet."));
    }

    private static final List<String> CHART_TYPES = List.of("area", "bar", "line");

    // =========================================================================

    public ChartSpecResponse generate(String slug, Long userId, String prompt, Long projectId) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        // Scope TF-RBAC-INTEL : répartitions/prédictions bornées aux projets visibles par l'utilisateur.
        List<Long> projectIds = visibilityGuard.viewableProjectIds(ws.getId(), userId);

        if (llm.isConfigured()) {
            try {
                // Métré : gate quota (au-dessus du plafond → repli heuristique, aucun token brûlé) + comptage réel.
                ChartSpecResponse fromLlm = aiMeter.metered(ws.getId(), () -> callLlm(projectIds, prompt));
                if (fromLlm != null) return fromLlm;
            } catch (Exception ex) {
                log.warn("Génération de graphe IA indisponible : {}", ex.getMessage());
            }
        }
        return heuristic(projectIds, prompt);
    }

    /** Ré-exécute une répartition (rafraîchit un graphe épinglé avec des données à jour). */
    public ChartSpecResponse runBreakdown(String slug, Long userId, String dimension, String measure, String scope) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        if (!queryService.isValidDimension(dimension)) {
            return unsupported(null, "Dimension de répartition inconnue : " + dimension, List.of());
        }
        List<Long> projectIds = visibilityGuard.viewableProjectIds(ws.getId(), userId);
        return breakdown(projectIds, null, "", "bar", dimension, measure, scope);
    }

    // =========================================================================
    // LLM
    // =========================================================================

    /** Interroge le LLM et construit la réponse. Retourne null si sa sortie n'est pas exploitable. */
    private ChartSpecResponse callLlm(List<Long> projectIds, String prompt) throws Exception {
        String content = llm.chatCompletion(model, systemPrompt(), prompt, true, "fast");
        JsonNode json = objectMapper.readTree(content);

        String unsupported = text(json, "unsupported");
        if (!unsupported.isEmpty()) return unsupported(text(json, "title"), unsupported, readSuggestions(json.path("suggestions")));

        String title = text(json, "title");
        String description = text(json, "description");
        String chartType = text(json, "chartType").toLowerCase(Locale.ROOT);

        // Prédiction (dérivée de données réelles) si le modèle l'a demandée — prioritaire.
        String predict = text(json, "predict");
        if (!predict.isEmpty() && queryService.isValidPrediction(predict)) {
            return prediction(projectIds, title, description, predict);
        }

        // Répartition (retrieval DB) prioritaire si le modèle a choisi une dimension.
        String dimension = text(json, "dimension");
        if (!dimension.isEmpty() && queryService.isValidDimension(dimension)) {
            return breakdown(projectIds, title, description, chartType, dimension, text(json, "measure"), text(json, "scope"));
        }

        // Sinon série temporelle si le dataset est connu.
        Dataset dataset = DATASETS.get(text(json, "dataset").toLowerCase(Locale.ROOT));
        if (dataset != null) {
            List<String> series = new ArrayList<>();
            JsonNode s = json.path("series");
            if (s.isArray()) s.forEach(n -> series.add(n.asText("").trim()));
            return timeseries(dataset, title, description, chartType, text(json, "bucket").toLowerCase(Locale.ROOT), series);
        }
        return null;  // rien d'exploitable → repli heuristique
    }

    private String systemPrompt() {
        StringBuilder sb = new StringBuilder();
        sb.append("Tu es un assistant d'analyse pour Taskforce. Tu choisis COMMENT visualiser des ")
          .append("données réelles de gestion de projet. Tu ne fabriques aucune donnée.\n\n")
          .append("Tu as TROIS moyens :\n\n")
          .append("A) RÉPARTITION « X par Y » — pour compter/regrouper des issues. Réponds avec :\n")
          .append("   \"dimension\": un de [PROJECT, STATUS, ASSIGNEE, PRIORITY, TYPE] (grouper par),\n")
          .append("   \"measure\": [COUNT] (nombre d'issues) ou [POINTS] (story points),\n")
          .append("   \"scope\": [ALL] (toutes), [OPEN] (ouvertes) ou [DONE] (terminées),\n")
          .append("   \"chartType\": \"bar\" (défaut) ou \"line\".\n")
          .append("   Exemples : « nombre d'issues par projet » → dimension=PROJECT, measure=COUNT, scope=ALL ; ")
          .append("« issues ouvertes par assigné » → ASSIGNEE/COUNT/OPEN ; « story points par statut » → STATUS/POINTS/ALL.\n\n")
          .append("B) SÉRIE TEMPORELLE — jeux de données prédéfinis :\n");
        for (Dataset d : DATASETS.values()) {
            sb.append("   - \"").append(d.key()).append("\" : ").append(d.describe());
            if (!d.series().isEmpty()) sb.append(" Séries : ").append(String.join(", ", d.series())).append(".");
            sb.append("\n");
        }
        sb.append("   Réponds avec \"dataset\": un identifiant ci-dessus, \"chartType\", \"bucket\" (throughput), \"series\".\n\n")
          .append("C) PRÉDICTION — projections dérivées des données réelles (jamais inventées) :\n")
          .append("   \"predict\": \"SUCCESS\" → score de succès (0-100) par projet, calculé sur le taux de complétion et les retards.\n")
          .append("   Choisis-le pour « prédiction / chances de succès / réussite / santé / risque des projets ». ")
          .append("Ce n'est pas de la voyance : c'est un score explicable sur données réelles.\n\n")
          .append("Ajoute toujours \"title\" (court, français) et \"description\" (une phrase). Réponds STRICTEMENT en JSON.\n")
          .append("Choisis A (répartition) pour « par projet/statut/assigné/priorité/type » ou « combien/nombre ». ")
          .append("Choisis B pour une évolution dans le temps ou l'avancement des projets.\n\n")
          // Anti-refus : la plupart des demandes ont une vue proche. Ne PAS refuser par excès de prudence.
          .append("IMPORTANT — RÉPONDS TOUJOURS par la vue la plus proche disponible plutôt que de refuser :\n")
          .append("- « les personnes les plus chargées / charge par personne / qui a le plus de tâches » ")
          .append("→ répartition ASSIGNEE/COUNT/OPEN (ou dataset \"capacity\").\n")
          .append("- « charge sur 14 jours / dans le temps par membre » → dataset \"workload\" (c'EST la charge par membre sur 14 jours).\n")
          .append("- une fenêtre temporelle (« sur 14 jours », « ce mois ») n'est PAS un obstacle : choisis workload ou throughput.\n\n")
          .append("Ne réponds \"unsupported\" QUE si la donnée est vraiment absente de Taskforce (revenus, ventes, ")
          .append("sources externes, satisfaction client…). Dans ce cas réponds : {\"unsupported\": string (ce qui manque, ")
          .append("en français), \"suggestions\": [{\"label\": string (bouton court), \"prompt\": string (une demande PROCHE ")
          .append("et répondable)}]} — propose 2 à 3 reformulations que TU sais faire avec les données ci-dessus.");
        return sb.toString();
    }

    // =========================================================================
    // Construction des réponses
    // =========================================================================

    private ChartSpecResponse breakdown(List<Long> projectIds, String title, String description, String chartType,
                                        String dimension, String measure, String scope) {
        List<NamedValue> data = queryService.run(projectIds, dimension, measure, scope);
        String ct = List.of("bar", "line").contains(chartType) ? chartType : "bar";
        String dim = dimension.toUpperCase(Locale.ROOT);
        String mes = measure == null || measure.isBlank() ? "COUNT" : measure.toUpperCase(Locale.ROOT);
        String scp = scope == null || scope.isBlank() ? "ALL" : scope.toUpperCase(Locale.ROOT);
        String xLabel = queryService.dimensionLabel(dimension);
        String yLabel = queryService.measureLabel(measure);
        String finalTitle = title == null || title.isBlank() ? yLabel + " par " + xLabel.toLowerCase(Locale.ROOT) : title.trim();
        return new ChartSpecResponse(finalTitle, safe(description), "breakdown",
            null, ct, null, null, data, dim, mes, scp, xLabel, yLabel, null, List.of());
    }

    /**
     * Prédiction par projet — rendue comme une répartition (barres) dont les valeurs sont calculées
     * en base à partir de signaux réels (cf. {@link AnalyticsQueryService#predict}). {@code dimension}
     * reste nul : c'est un instantané (pas de ré-exécution auto), la donnée voyage dans le spec.
     */
    private ChartSpecResponse prediction(List<Long> projectIds, String title, String description, String kind) {
        List<NamedValue> data = queryService.predict(projectIds, kind);
        String finalTitle = title == null || title.isBlank() ? queryService.predictionTitle(kind) : title.trim();
        return new ChartSpecResponse(finalTitle, safe(description), "breakdown",
            null, "bar", null, null, data, null, null, null, "Projet", queryService.predictionYLabel(kind), null, List.of());
    }

    private ChartSpecResponse timeseries(Dataset dataset, String title, String description,
                                         String chartType, String bucket, List<String> requestedSeries) {
        String ct = CHART_TYPES.contains(chartType) ? chartType : dataset.defaultChartType();
        List<String> series = new ArrayList<>(requestedSeries == null ? List.of() : requestedSeries);
        series.retainAll(dataset.series());
        if (series.isEmpty()) series = new ArrayList<>(dataset.series());
        String resolvedBucket = "throughput".equals(dataset.key())
            ? ("day".equals(bucket) ? "day" : "week") : null;
        String finalTitle = title == null || title.isBlank() ? defaultTitle(dataset) : title.trim();
        return new ChartSpecResponse(finalTitle, safe(description), "timeseries",
            dataset.key(), ct, resolvedBucket, series, null, null, null, null, null, null, null, List.of());
    }

    private ChartSpecResponse unsupported(String title, String message, List<ChartSuggestion> suggestions) {
        List<ChartSuggestion> resolved = suggestions == null || suggestions.isEmpty() ? defaultSuggestions() : suggestions;
        return new ChartSpecResponse(safe(title), "", "unsupported",
            null, null, null, null, null, null, null, null, null, null, message, resolved);
    }

    /** Reformulations proposées par défaut — toutes répondables (couvrent le catalogue). */
    private List<ChartSuggestion> defaultSuggestions() {
        return List.of(
            new ChartSuggestion("Charge par membre", "issues ouvertes par assigné"),
            new ChartSuggestion("Charge de l'équipe sur 14 jours", "charge de l'équipe jour par jour"),
            new ChartSuggestion("Issues par projet", "nombre d'issues par projet"),
            new ChartSuggestion("Avancement des projets", "avancement des projets"),
            new ChartSuggestion("Débit hebdomadaire", "tâches résolues et ouvertes par semaine"));
    }

    // =========================================================================
    // Repli déterministe (LLM absent ou en échec)
    // =========================================================================

    private ChartSpecResponse heuristic(List<Long> projectIds, String prompt) {
        String p = prompt == null ? "" : prompt.toLowerCase(Locale.ROOT);

        // 0) Prédiction — avant la répartition (« succès des projets » contient « projet »).
        if (containsAny(p, "prédiction", "prediction", "prédire", "predire", "succès", "succes",
                "réussite", "reussite", "chance", "risque", "santé", "sante")) {
            return prediction(projectIds, null, "", "SUCCESS");
        }

        // 1) Répartition « par X » — le vrai retrieval, prioritaire.
        String dimension = detectDimension(p);
        if (dimension != null) {
            String measure = containsAny(p, "point", "story") ? "POINTS" : "COUNT";
            String scope = containsAny(p, "ouvert", "en cours", "restant") ? "OPEN"
                : containsAny(p, "terminé", "termine", "résolu", "resolu", "fini", "fermé", "ferme", "clos") ? "DONE" : "ALL";
            return breakdown(projectIds, null, "", "bar", dimension, measure, scope);
        }

        // 2) Séries temporelles.
        if (containsAny(p, "burndown", "reste", "sprint", "restant", "idéal", "ideal")) {
            return timeseries(DATASETS.get("burndown"), "Burndown du sprint", "", "line", null, List.of("remaining", "ideal"));
        }
        if (containsAny(p, "avancement", "complétion", "completion", "progress", "progression")) {
            return timeseries(DATASETS.get("projects"), "Avancement des projets", "", "bar", null, List.of("completion"));
        }
        if (containsAny(p, "charge") && containsAny(p, "jour", "heatmap", "quotidien", "semaine", "période", "periode")) {
            return timeseries(DATASETS.get("workload"), "Charge de l'équipe", "", "heatmap", null, List.of());
        }
        if (containsAny(p, "membre", "charg", "capacit", "équipe", "equipe")) {
            return timeseries(DATASETS.get("capacity"), "Charge par membre", "", "bar", null, List.of("openIssues"));
        }
        boolean daily = containsAny(p, "jour", "quotidien", "30", "daily");
        return timeseries(DATASETS.get("throughput"), daily ? "Débit quotidien" : "Débit hebdomadaire",
            "", "area", daily ? "day" : "week", List.of("resolved", "opened"));
    }

    /** Détecte une dimension de répartition dans la demande (null si aucune). */
    private String detectDimension(String p) {
        if (containsAny(p, "par projet", "par projets", "chaque projet", "issues par projet")) return "PROJECT";
        if (containsAny(p, "par statut", "par status", "par état", "par etat", "par colonne")) return "STATUS";
        if (containsAny(p, "par assign", "par membre", "par responsable", "par personne", "par développeur", "par developpeur")) return "ASSIGNEE";
        if (containsAny(p, "par priorit")) return "PRIORITY";
        if (containsAny(p, "par type")) return "TYPE";
        return null;
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private String defaultTitle(Dataset d) {
        return switch (d.key()) {
            case "throughput" -> "Débit";
            case "burndown"   -> "Burndown du sprint";
            case "capacity"   -> "Charge par membre";
            case "workload"   -> "Charge de l'équipe";
            case "projects"   -> "Avancement des projets";
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

    /** Lit les reformulations proposées par le modèle (label + prompt), en ne gardant que les valides. */
    private List<ChartSuggestion> readSuggestions(JsonNode node) {
        if (node == null || !node.isArray()) return List.of();
        List<ChartSuggestion> out = new ArrayList<>();
        for (JsonNode s : node) {
            String label = text(s, "label");
            String prompt = text(s, "prompt");
            if (!label.isEmpty() && !prompt.isEmpty()) out.add(new ChartSuggestion(label, prompt));
            if (out.size() == 3) break;
        }
        return out;
    }

    private String safe(String value) {
        return value == null ? "" : value.trim();
    }
}
