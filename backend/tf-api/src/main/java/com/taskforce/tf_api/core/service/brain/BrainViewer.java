package com.taskforce.tf_api.core.service.brain;

import java.util.Collection;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Ce qu'une personne lit du Brain OS d'un espace, posé par {@link BrainAccessGuard}. Une note rattachée à un projet ne
 * se lit que si l'on voit ce projet, la règle de {@code ProjectVisibilityGuard} : un propriétaire ou un admin de
 * l'espace lit tout, un autre membre les notes de l'espace et celles des projets publics ou dont il est membre.
 *
 * <p>Une note est rattachée à un projet par sa référence ({@code refType} PROJECT, ISSUE ou CYCLE, ou un {@code refId}
 * sans {@code refType} : les notes que l'ingestion range dans le dossier d'un projet), par {@code metadata.projectId},
 * ou par une page parente rattachée : le dossier d'un projet abrite ses notes, à toute profondeur. Une référence qui
 * ne mène à aucun projet visible cache la note : un projet, une issue ou un cycle supprimé ne la rend pas publique.</p>
 *
 * @param workspaceId       l'espace lu
 * @param seesAll           vrai pour un propriétaire ou un admin : aucune note n'est cachée
 * @param visibleProjectIds les projets de l'espace dont les notes se lisent, quand {@code seesAll} est faux
 */
public record BrainViewer(Long workspaceId, boolean seesAll, List<Long> visibleProjectIds) {

    /**
     * Notes de l'espace cachées à la personne : celles rattachées à un projet hors de la liste, puis, de proche en
     * proche, les pages rangées dessous. Paramètres : la liste des projets visibles, puis l'espace.
     */
    static final String HIDDEN_NODES = """
        WITH RECURSIVE visible(id) AS (SELECT unnest(CAST(? AS bigint[]))),
        hidden(id) AS (
            SELECT n.id FROM knowledge_nodes n
            WHERE n.workspace_id = ? AND (
                   (n.ref_id IS NOT NULL AND (n.ref_type IS NULL OR n.ref_type = 'PROJECT')
                       AND n.ref_id NOT IN (SELECT id FROM visible))
                OR (n.ref_id IS NOT NULL AND n.ref_type = 'ISSUE' AND NOT EXISTS (
                       SELECT 1 FROM issues i JOIN visible v ON v.id = i.project_id WHERE i.id = n.ref_id))
                OR (n.ref_id IS NOT NULL AND n.ref_type = 'CYCLE' AND NOT EXISTS (
                       SELECT 1 FROM cycles c JOIN visible v ON v.id = c.project_id WHERE c.id = n.ref_id))
                OR (n.metadata ->> 'projectId' IS NOT NULL
                       AND n.metadata ->> 'projectId' NOT IN (SELECT CAST(id AS text) FROM visible)))
            UNION
            SELECT child.id FROM knowledge_nodes child JOIN hidden h ON child.parent_node_id = h.id
        )
        SELECT id FROM hidden""";

    public BrainViewer {
        visibleProjectIds = seesAll ? List.of() : List.copyOf(visibleProjectIds);
    }

    /** Un propriétaire ou un admin de l'espace : il lit tout. */
    public static BrainViewer seeingAll(Long workspaceId) {
        return new BrainViewer(workspaceId, true, List.of());
    }

    /** Une personne qui lit les notes de l'espace et celles de ces projets, rien d'autre. */
    public static BrainViewer seeing(Long workspaceId, Collection<Long> projectIds) {
        return new BrainViewer(workspaceId, false, List.copyOf(projectIds));
    }

    /**
     * Clause à ajouter au {@code WHERE} d'une requête sur {@code knowledge_nodes}, vide pour qui lit tout. Le filtre se
     * fait dans la requête, avant le classement et la limite : la personne reçoit autant de notes qu'elle en demande.
     */
    String sqlFilter(String idColumn) {
        return seesAll ? "" : "AND " + idColumn + " NOT IN (" + HIDDEN_NODES + ") ";
    }

    /** Paramètres de {@link #HIDDEN_NODES}, dans l'ordre (aucun pour qui lit tout). */
    List<Object> sqlArgs() {
        return seesAll ? List.of() : List.of(projectArray(), workspaceId);
    }

    /** Littéral de tableau PostgreSQL ({@code {1,2}}) : des identifiants numériques, rien à échapper. */
    private String projectArray() {
        return visibleProjectIds.stream().map(String::valueOf).collect(Collectors.joining(",", "{", "}"));
    }
}
