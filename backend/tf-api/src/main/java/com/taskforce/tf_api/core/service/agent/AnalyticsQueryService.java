package com.taskforce.tf_api.core.service.agent;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.response.NamedValue;
import com.taskforce.tf_api.core.repository.ProjectRepository;

import lombok.RequiredArgsConstructor;

/**
 * <b>Requête d'analyse « répartition » sûre</b> — le moteur qui donne au modèle un accès réel aux
 * données, sans jamais lui laisser écrire du SQL.
 *
 * <p>Le modèle ne choisit que parmi une <b>whitelist</b> : une {@link Dimension} (grouper par…),
 * une {@link Measure} (compter / sommer…) et un {@link Scope} (toutes / ouvertes / terminées). Ces
 * trois choix sont mappés à des <b>fragments SQL figés</b> ; seule la liste des projets du workspace
 * est un paramètre lié. Résultat : aucune injection possible, et les données sont 100 % réelles.
 *
 * <p>Couvre à lui seul une large classe de questions : « issues par projet / statut / assigné /
 * priorité / type », en nombre ou en story points, sur tout / l'ouvert / le terminé.
 */
@Service
@RequiredArgsConstructor
public class AnalyticsQueryService {

    private final JdbcTemplate      jdbcTemplate;
    private final ProjectRepository projectRepository;

    private static final int MAX_ROWS = 50;

    /** Axe de regroupement autorisé → expression SQL + jointure nécessaire. */
    public enum Dimension {
        PROJECT ("p.name",                                  "JOIN projects p ON p.id = i.project_id",       "Projet"),
        STATUS  ("s.name",                                  "",                                             "Statut"),
        ASSIGNEE("COALESCE(u.display_name, 'Non assigné')", "LEFT JOIN users u ON u.id = i.assignee_id",    "Assigné"),
        PRIORITY("i.priority",                              "",                                             "Priorité"),
        TYPE    ("COALESCE(t.name, 'Sans type')",           "LEFT JOIN issue_types t ON t.id = i.type_id",  "Type");

        final String expr;
        final String join;
        final String label;
        Dimension(String expr, String join, String label) { this.expr = expr; this.join = join; this.label = label; }
    }

    /** Mesure autorisée → expression d'agrégation SQL. */
    public enum Measure {
        COUNT ("COUNT(*)",                         "Nombre d'issues"),
        POINTS("COALESCE(SUM(i.story_points), 0)", "Story points");

        final String expr;
        final String label;
        Measure(String expr, String label) { this.expr = expr; this.label = label; }
    }

    /** Périmètre (filtre sur la catégorie de statut). */
    public enum Scope {
        ALL ("",                                                  "toutes"),
        OPEN("AND s.category NOT IN ('COMPLETED', 'CANCELLED')",  "ouvertes"),
        DONE("AND s.category = 'COMPLETED'",                      "terminées");

        final String clause;
        final String label;
        Scope(String clause, String label) { this.clause = clause; this.label = label; }
    }

    private static final Map<String, Dimension> DIMENSIONS = index(Dimension.values(), Enum::name);
    private static final Map<String, Measure>   MEASURES   = index(Measure.values(),   Enum::name);
    private static final Map<String, Scope>     SCOPES     = index(Scope.values(),     Enum::name);

    public static List<String> dimensionKeys() { return List.copyOf(DIMENSIONS.keySet()); }
    public static List<String> measureKeys()   { return List.copyOf(MEASURES.keySet()); }
    public static List<String> scopeKeys()     { return List.copyOf(SCOPES.keySet()); }

    public boolean isValidDimension(String key) { return DIMENSIONS.containsKey(up(key)); }

    /** Libellé de la dimension (pour l'axe / le titre). */
    public String dimensionLabel(String key) {
        Dimension d = DIMENSIONS.get(up(key));
        return d != null ? d.label : "Catégorie";
    }

    /** Libellé de la mesure (pour l'axe / le titre). */
    public String measureLabel(String key) {
        Measure m = MEASURES.get(up(key));
        return m != null ? m.label : "Valeur";
    }

    /**
     * Exécute la répartition et renvoie les points (libellé → valeur), triés décroissant.
     * Les trois choix sont validés contre la whitelist (défaut sûr si inconnu).
     */
    @Transactional(readOnly = true)
    public List<NamedValue> run(Long workspaceId, String dimensionKey, String measureKey, String scopeKey) {
        Dimension dimension = DIMENSIONS.getOrDefault(up(dimensionKey), Dimension.PROJECT);
        Measure   measure   = MEASURES.getOrDefault(up(measureKey), Measure.COUNT);
        Scope     scope     = SCOPES.getOrDefault(up(scopeKey), Scope.ALL);

        List<Long> projectIds = projectRepository.findByWorkspaceIdOrderByCreatedAtDesc(workspaceId)
            .stream().map(p -> p.getId()).toList();
        if (projectIds.isEmpty()) return List.of();

        String placeholders = projectIds.stream().map(id -> "?").collect(Collectors.joining(","));
        // Tous les fragments viennent d'enums (figés) ; seuls les projectIds sont des paramètres liés.
        String sql = "SELECT " + dimension.expr + " AS label, " + measure.expr + " AS value "
            + "FROM issues i JOIN issue_statuses s ON s.id = i.status_id "
            + (dimension.join.isEmpty() ? "" : dimension.join + " ")
            + "WHERE i.project_id IN (" + placeholders + ") " + scope.clause + " "
            + "GROUP BY " + dimension.expr + " "
            + "ORDER BY value DESC LIMIT " + MAX_ROWS;

        return jdbcTemplate.query(sql, projectIds.toArray(), (rs, n) ->
            new NamedValue(labelOrDash(rs.getString("label")), rs.getLong("value")));
    }

    // =========================================================================
    // Prédiction — projections dérivées de signaux RÉELS (jamais inventées)
    // =========================================================================

    /** Type de prédiction autorisé. L'enum garde la porte ouverte à d'autres projections. */
    public enum Prediction {
        SUCCESS("Score de succès (%)", "Prédiction de succès par projet");

        final String yLabel;
        final String title;
        Prediction(String yLabel, String title) { this.yLabel = yLabel; this.title = title; }
    }

    private static final Map<String, Prediction> PREDICTIONS = index(Prediction.values(), Enum::name);

    public static List<String> predictionKeys() { return List.copyOf(PREDICTIONS.keySet()); }
    public boolean isValidPrediction(String key) { return PREDICTIONS.containsKey(up(key)); }
    public String predictionYLabel(String key) { Prediction p = PREDICTIONS.get(up(key)); return p != null ? p.yLabel : "Score"; }
    public String predictionTitle(String key)  { Prediction p = PREDICTIONS.get(up(key)); return p != null ? p.title : "Prédiction"; }

    /**
     * Prédiction par projet à partir de signaux réels — <b>aucune donnée inventée</b>.
     * <p>SUCCESS = score 0-100 : <b>70 % ratio de complétion</b> (issues terminées / total) +
     * <b>30 % (1 − ratio de retard)</b> (issues ouvertes en retard / ouvertes). C'est un modèle
     * déterministe et explicable, pas une boule de cristal — le libellé le dit.
     */
    @Transactional(readOnly = true)
    public List<NamedValue> predict(Long workspaceId, String kindKey) {
        // Une seule prédiction pour l'instant (SUCCESS) ; le défaut sûr couvre toute clé inconnue.
        PREDICTIONS.getOrDefault(up(kindKey), Prediction.SUCCESS);

        List<Long> projectIds = projectRepository.findByWorkspaceIdOrderByCreatedAtDesc(workspaceId)
            .stream().map(p -> p.getId()).toList();
        if (projectIds.isEmpty()) return List.of();

        String placeholders = projectIds.stream().map(id -> "?").collect(Collectors.joining(","));
        // Seuls les projectIds sont des paramètres liés ; le reste est figé → aucune injection.
        String sql = """
            SELECT p.name AS label,
                   ROUND(100.0 * (
                       0.7 * COALESCE(COUNT(*) FILTER (WHERE s.category = 'COMPLETED')::numeric
                                      / NULLIF(COUNT(i.id), 0), 0)
                     + 0.3 * (1 - LEAST(1.0, COALESCE(
                           COUNT(*) FILTER (WHERE s.category NOT IN ('COMPLETED','CANCELLED') AND i.due_date < CURRENT_DATE)::numeric
                           / NULLIF(COUNT(*) FILTER (WHERE s.category NOT IN ('COMPLETED','CANCELLED')), 0), 0)))
                   ))::int AS value
            FROM projects p
            LEFT JOIN issues i ON i.project_id = p.id
            LEFT JOIN issue_statuses s ON s.id = i.status_id
            WHERE p.id IN (%s)
            GROUP BY p.id, p.name
            ORDER BY value DESC
            LIMIT %d
            """.formatted(placeholders, MAX_ROWS);

        return jdbcTemplate.query(sql, projectIds.toArray(), (rs, n) ->
            new NamedValue(labelOrDash(rs.getString("label")), rs.getLong("value")));
    }

    // -------------------------------------------------------------------------

    private static <E extends Enum<E>> Map<String, E> index(E[] values, java.util.function.Function<E, String> key) {
        Map<String, E> map = new LinkedHashMap<>();
        for (E v : values) map.put(key.apply(v).toUpperCase(Locale.ROOT), v);
        return map;
    }

    private static String up(String s) {
        return s == null ? "" : s.trim().toUpperCase(Locale.ROOT);
    }

    private static String labelOrDash(String label) {
        return label == null || label.isBlank() ? "—" : label;
    }
}
