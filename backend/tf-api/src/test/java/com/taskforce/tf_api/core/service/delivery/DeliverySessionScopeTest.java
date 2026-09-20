package com.taskforce.tf_api.core.service.delivery;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Périmètre d'une session déléguée (ADR-013), session de référence : workspace {@code acme}, projet 12.
 * Liste d'autorisation : tout ce qui n'est pas explicitement admis doit être refusé.
 */
@DisplayName("DeliverySessionScope")
class DeliverySessionScopeTest {

    private static final String SLUG = "acme";
    private static final Long PROJECT = 12L;

    @ParameterizedTest(name = "admis : {0} {1}")
    @CsvSource({
        // Lecture : sous-arbres utiles du workspace du run, tous projets confondus
        "GET,  /api/workspaces/acme/projects",
        "GET,  /api/workspaces/acme/projects/12/issues",
        "GET,  /api/workspaces/acme/projects/12/issues/5/comments",
        "GET,  /api/workspaces/acme/projects/99/issues",
        "HEAD, /api/workspaces/acme/projects/12/issues/5",
        "GET,  /api/workspaces/acme/brain",
        "GET,  /api/workspaces/acme/brain/nodes/7",
        "GET,  /api/workspaces/acme/my-issues",
        "GET,  /api/workspaces/acme/analytics/kpis",
        // Lecture portée par un POST : la recherche sémantique
        "POST, /api/workspaces/acme/brain/search",
        // Écriture : les issues du projet du run, et rien d'autre
        "POST,  /api/workspaces/acme/projects/12/issues",
        "PATCH, /api/workspaces/acme/projects/12/issues/5",
        "POST,  /api/workspaces/acme/projects/12/issues/5/comments",
        "PUT,   /api/workspaces/acme/projects/12/issues/5",
        "post,  /api/workspaces/acme/projects/12/issues/5/comments",
    })
    void allows(String method, String path) {
        assertThat(DeliverySessionScope.allows(method, path, SLUG, PROJECT)).isTrue();
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
        // Écriture hors des issues du projet du run
        "POST,  /api/workspaces/acme/projects/99/issues",
        "PATCH, /api/workspaces/acme/projects/99/issues/5",
        "POST,  /api/workspaces/acme/projects/123/issues",
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
        // Suppression : jamais, même dans le projet du run
        "DELETE, /api/workspaces/acme/projects/12/issues/5",
        "DELETE, /api/workspaces/acme/projects/12/issues/5/comments/3",
        "DELETE, /api/workspaces/acme/projects/12",
        // Autres méthodes
        "OPTIONS, /api/workspaces/acme/projects/12/issues",
        "TRACE,   /api/workspaces/acme/projects",
        // Chemins exotiques (défense en profondeur)
        "GET,   /api/workspaces/acme/projects/../members",
        "GET,   /api/workspaces/acme//projects",
        "GET,   /api/workspaces/acme/projects;x=1",
        "GET,   /api/workspaces/acme/projects%2f..%2fmembers",
        "POST,  /api/workspaces/acme/projects/12/issues/..%2f..%2f99/issues",
    })
    void denies(String method, String path) {
        assertThat(DeliverySessionScope.allows(method, path, SLUG, PROJECT)).isFalse();
    }

    @ParameterizedTest(name = "session incomplète refusée : slug=[{0}] projet=[{1}]")
    @CsvSource(value = {
        "NULL, 12",
        "'',   12",
        "acme, NULL",
    }, nullValues = "NULL")
    void denies_incomplete_session(String slug, Long projectId) {
        assertThat(DeliverySessionScope.allows("GET", "/api/workspaces/acme/projects", slug, projectId)).isFalse();
    }
}
