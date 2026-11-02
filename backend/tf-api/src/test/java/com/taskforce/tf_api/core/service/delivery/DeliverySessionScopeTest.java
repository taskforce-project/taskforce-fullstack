package com.taskforce.tf_api.core.service.delivery;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Périmètre d'une session déléguée (ADR-013), session de référence : workspace {@code acme}, projet 12, issue 5.
 * Liste d'autorisation : tout ce qui n'est pas explicitement admis doit être refusé.
 */
@DisplayName("DeliverySessionScope")
class DeliverySessionScopeTest {

    private static final String SLUG = "acme";
    private static final Long PROJECT = 12L;
    private static final Long ISSUE = 5L;

    @ParameterizedTest(name = "admis : {0} {1}")
    @CsvSource({
        // Lecture : sous-arbres utiles du workspace du run, tous projets et toutes issues confondus
        "GET,  /api/workspaces/acme/projects",
        "GET,  /api/workspaces/acme/projects/12/issues",
        "GET,  /api/workspaces/acme/projects/12/issues/5/comments",
        "GET,  /api/workspaces/acme/projects/12/issues/6",
        "GET,  /api/workspaces/acme/projects/12/issues/6/comments",
        "GET,  /api/workspaces/acme/projects/99/issues",
        "HEAD, /api/workspaces/acme/projects/12/issues/5",
        "GET,  /api/workspaces/acme/brain",
        "GET,  /api/workspaces/acme/brain/nodes/7",
        "GET,  /api/workspaces/acme/my-issues",
        "GET,  /api/workspaces/acme/analytics/kpis",
        // Lecture portée par un POST : la recherche sémantique
        "POST, /api/workspaces/acme/brain/search",
        // Serveur MCP de l'instance : chaque outil y est rejugé sur son équivalent REST
        "POST,  /api/workspaces/acme/mcp",
        "GET,   /api/workspaces/acme/mcp",
    })
    void allows(String method, String path) {
        assertThat(DeliverySessionScope.allows(method, path, SLUG, PROJECT, ISSUE)).isTrue();
    }

    /**
     * R110 (séance n°16) : l'agent modifie la seule issue qu'on lui a confiée, et peut créer une issue dans le projet
     * du run ; une autre issue du même projet, ou d'un autre projet, reste hors de sa portée.
     */
    @ParameterizedTest(name = "écriture : {0} {1} -> {2}")
    @CsvSource({
        // L'issue du run : ses champs, sa colonne, sa checklist, ses commentaires
        "PATCH, /api/workspaces/acme/projects/12/issues/5,                 true",
        "PUT,   /api/workspaces/acme/projects/12/issues/5,                 true",
        "POST,  /api/workspaces/acme/projects/12/issues/5/comments,        true",
        "post,  /api/workspaces/acme/projects/12/issues/5/comments,        true",
        "PATCH, /api/workspaces/acme/projects/12/issues/5/comments/3,      true",
        "PATCH, /api/workspaces/acme/projects/12/issues/5/checklist/31,    true",
        // Créer une issue dans le projet du run (règle create-issue)
        "POST,  /api/workspaces/acme/projects/12/issues,                   true",
        // Une autre issue du même projet : ni ses champs, ni un commentaire, ni sa checklist
        "PATCH, /api/workspaces/acme/projects/12/issues/6,                 false",
        "PUT,   /api/workspaces/acme/projects/12/issues/6,                 false",
        "POST,  /api/workspaces/acme/projects/12/issues/6/comments,        false",
        "PATCH, /api/workspaces/acme/projects/12/issues/6/comments/3,      false",
        "PATCH, /api/workspaces/acme/projects/12/issues/6/checklist/31,    false",
        "POST,  /api/workspaces/acme/projects/12/issues/6/smart-assign,    false",
        // Préfixe de NOM et non de segment : l'issue 55 n'est pas l'issue 5
        "PATCH, /api/workspaces/acme/projects/12/issues/55,                false",
        "POST,  /api/workspaces/acme/projects/12/issues/55/comments,       false",
        // Ce qui vaut pour toutes les issues du projet
        "POST,  /api/workspaces/acme/projects/12/issues/statuses,          false",
        "PATCH, /api/workspaces/acme/projects/12/issues/statuses/3,        false",
        "POST,  /api/workspaces/acme/projects/12/issues/statuses/reorder,  false",
        "POST,  /api/workspaces/acme/projects/12/issues/smart-assign/bulk, false",
        "PATCH, /api/workspaces/acme/projects/12/issues,                   false",
        "PUT,   /api/workspaces/acme/projects/12/issues,                   false",
        // Un autre projet : ni une création, ni une issue du même numéro
        "POST,  /api/workspaces/acme/projects/99/issues,                   false",
        "POST,  /api/workspaces/acme/projects/123/issues,                  false",
        "PATCH, /api/workspaces/acme/projects/99/issues/5,                 false",
        "POST,  /api/workspaces/acme/projects/99/issues/5/comments,        false",
        "PATCH, /api/workspaces/acme/projects/99/issues/5/checklist/31,    false",
    })
    void writes_reach_only_the_issue_of_the_run(String method, String path, boolean allowed) {
        assertThat(DeliverySessionScope.allows(method, path, SLUG, PROJECT, ISSUE)).isEqualTo(allowed);
    }

    @ParameterizedTest(name = "refusé : {0} {1}")
    @CsvSource({
        // Autre workspace, ou hors workspace
        "GET,   /api/workspaces/other/projects",
        "GET,   /api/workspaces/acme-evil/projects",
        "GET,   /api/workspaces",
        "GET,   /api/workspaces/acme",
        "GET,   /api/users/me",
        "GET,   /api/billing/portal",
        "POST,  /api/auth/login",
        // Lecture hors liste : membres, intégrations, webhooks, MCP, délégation, notifications
        "GET,   /api/workspaces/acme/members",
        "GET,   /api/workspaces/acme/integrations",
        "GET,   /api/workspaces/acme/webhooks",
        "GET,   /api/workspaces/acme/mcp/servers",
        "GET,   /api/workspaces/acme/delivery/runs",
        "GET,   /api/workspaces/acme/notifications",
        // Préfixe de NOM et non de segment
        "GET,   /api/workspaces/acme/projects-archive",
        "GET,   /api/workspaces/acme/brainstorm",
        // Écriture hors des issues
        "POST,  /api/workspaces/acme/projects/12/issues-bulk",
        "PATCH, /api/workspaces/acme/projects/12",
        "POST,  /api/workspaces/acme/projects/12/cycles",
        "POST,  /api/workspaces/acme/projects/12/pages",
        "POST,  /api/workspaces/acme/projects",
        "POST,  /api/workspaces/acme/brain/nodes",
        "POST,  /api/workspaces/acme/brain/reseed",
        "PATCH, /api/workspaces/acme/brain/nodes/7",
        "POST,  /api/workspaces/acme/assistant",
        "POST,  /api/workspaces/acme/delivery/issues/5/delegate",
        "POST,  /api/workspaces/acme/brain/search/extra",
        // Suppression : jamais, même sur l'issue du run
        "DELETE, /api/workspaces/acme/projects/12/issues/5",
        "DELETE, /api/workspaces/acme/projects/12/issues/5/comments/3",
        "DELETE, /api/workspaces/acme/projects/12/issues/5/checklist/31",
        "DELETE, /api/workspaces/acme/projects/12",
        "DELETE, /api/workspaces/acme/mcp",
        // Serveur MCP d'un autre workspace, ou autre méthode
        "POST,   /api/workspaces/other/mcp",
        "PATCH,  /api/workspaces/acme/mcp",
        "POST,   /api/workspaces/acme/mcp/actions/execute",
        // Autres méthodes
        "OPTIONS, /api/workspaces/acme/projects/12/issues",
        "TRACE,   /api/workspaces/acme/projects",
        // Chemins exotiques (défense en profondeur)
        "GET,   /api/workspaces/acme/projects/../members",
        "GET,   /api/workspaces/acme//projects",
        "GET,   /api/workspaces/acme/projects;x=1",
        "GET,   /api/workspaces/acme/projects%2f..%2fmembers",
        "POST,  /api/workspaces/acme/projects/12/issues/..%2f..%2f99/issues",
        "POST,  /api/workspaces/acme/projects/12/issues/5/../6/comments",
    })
    void denies(String method, String path) {
        assertThat(DeliverySessionScope.allows(method, path, SLUG, PROJECT, ISSUE)).isFalse();
    }

    @ParameterizedTest(name = "session incomplète refusée : slug=[{0}] projet=[{1}] issue=[{2}]")
    @CsvSource(value = {
        "NULL, 12,   5",
        "'',   12,   5",
        "acme, NULL, 5",
        "acme, 12,   NULL",
    }, nullValues = "NULL")
    void denies_incomplete_session(String slug, Long projectId, Long issueId) {
        String read = "/api/workspaces/acme/projects";
        String write = "/api/workspaces/acme/projects/12/issues/5";
        assertThat(DeliverySessionScope.allows("GET", read, slug, projectId, issueId)).isFalse();
        assertThat(DeliverySessionScope.allows("PATCH", write, slug, projectId, issueId)).isFalse();
    }
}
