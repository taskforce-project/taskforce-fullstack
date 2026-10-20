package com.taskforce.tf_api.modules.transfer.service;

import java.util.List;
import java.util.Map;

/**
 * Fichier de projet TaskForce : un zip qui contient {@code project.json} et {@code files/<id>}, le contenu de chaque
 * pièce jointe. Le JSON porte les lignes du projet, table par table, telles que PostgreSQL les rend
 * ({@code row_to_json}), et les personnes qu'elles citent. Le même fichier va de la webapp à l'app desktop et
 * inversement, puisque c'est le même backend des deux côtés : un projet passe ainsi d'un côté à l'autre, ou se garde
 * comme sauvegarde.
 *
 * <p>Ce qui voyage : le projet, ses statuts, types et labels, ses cycles, ses pages, et tous ses tickets (sous-tickets
 * et archivés compris) avec leurs labels, commentaires, historique, checklist, temps passé, liens, cycles, pièces
 * jointes et liens GitHub. Ce qui reste : les membres et équipes de l'espace, le Brain OS (propre à l'espace), les
 * connexions et clés (chiffrées pour une seule instance), l'historique des agents.</p>
 */
final class ProjectBundle {

    static final String FORMAT = "taskforce-project";

    /** Version du format ; un fichier d'une version plus récente est refusé. */
    static final int VERSION = 1;

    static final String MANIFEST = "project.json";

    static final String FILES = "files/";

    private static final String PROJECT_ISSUES = "SELECT id FROM issues WHERE project_id = :project";

    private static final String ISSUE_SCOPE = "issue_id IN (" + PROJECT_ISSUES + ")";

    /**
     * Une table du projet.
     *
     * @param name    nom de la table
     * @param scope   lignes du projet ({@code :project} est son identifiant)
     * @param orderBy ordre de lecture, stable d'un export à l'autre
     * @param refs    table visée par chaque clé étrangère gardée ; toute autre clé étrangère est laissée de côté
     * @param hasId   la table a une clé {@code id}, renumérotée à l'import
     */
    record Table(String name, String scope, String orderBy, Map<String, String> refs, boolean hasId) {
    }

    /** Tables du projet, dans l'ordre où l'import les recrée : une table ne cite que des tables qui la précèdent. */
    static final List<Table> TABLES = List.of(
        new Table("projects", "id = :project", "id",
            Map.of("workspace_id", "workspaces", "created_by", "users"), true),
        new Table("issue_statuses", "project_id = :project", "id", Map.of("project_id", "projects"), true),
        new Table("issue_types", "project_id = :project", "id", Map.of("project_id", "projects"), true),
        new Table("project_labels", "project_id = :project", "id", Map.of("project_id", "projects"), true),
        new Table("cycles", "project_id = :project", "id",
            Map.of("project_id", "projects", "created_by", "users"), true),
        new Table("pages", "project_id = :project", "id",
            Map.of("project_id", "projects", "created_by", "users"), true),
        new Table("issues", "project_id = :project", "id",
            Map.of("project_id", "projects", "status_id", "issue_statuses", "type_id", "issue_types",
                "assignee_id", "users", "reporter_id", "users", "parent_id", "issues",
                "assignment_assigned_by_id", "users"), true),
        new Table("issue_label_assignments", ISSUE_SCOPE, "issue_id, label_id",
            Map.of("issue_id", "issues", "label_id", "project_labels"), false),
        new Table("issue_comments", ISSUE_SCOPE, "id", Map.of("issue_id", "issues", "author_id", "users"), true),
        new Table("issue_activity", ISSUE_SCOPE, "id", Map.of("issue_id", "issues", "actor_id", "users"), true),
        new Table("issue_checklist_items", ISSUE_SCOPE, "id", Map.of("issue_id", "issues"), true),
        new Table("issue_worklogs", ISSUE_SCOPE, "id", Map.of("issue_id", "issues", "user_id", "users"), true),
        new Table("issue_relations",
            "source_id IN (" + PROJECT_ISSUES + ") AND target_id IN (" + PROJECT_ISSUES + ")", "id",
            Map.of("source_id", "issues", "target_id", "issues", "created_by", "users"), true),
        new Table("cycle_issues",
            "cycle_id IN (SELECT id FROM cycles WHERE project_id = :project) AND " + ISSUE_SCOPE, "id",
            Map.of("cycle_id", "cycles", "issue_id", "issues", "added_by", "users"), true),
        new Table("attachments", ISSUE_SCOPE, "id", Map.of("issue_id", "issues", "uploaded_by", "users"), true),
        new Table("issue_github_links", ISSUE_SCOPE, "id", Map.of("issue_id", "issues", "linked_by", "users"), true)
    );

    private ProjectBundle() {
    }
}
