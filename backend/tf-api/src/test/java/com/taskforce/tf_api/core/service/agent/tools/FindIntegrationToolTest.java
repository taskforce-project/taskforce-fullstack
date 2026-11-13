package com.taskforce.tf_api.core.service.agent.tools;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.dto.response.IntegrationCatalogResponse;
import com.taskforce.tf_api.core.dto.response.IntegrationCatalogResponse.CategoryGroup;
import com.taskforce.tf_api.core.dto.response.IntegrationCatalogResponse.ConnectorView;
import com.taskforce.tf_api.core.service.agent.AgentContext;
import com.taskforce.tf_api.core.service.integration.IntegrationCatalogService;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

/** Tests unitaires — {@link FindIntegrationTool} (Pilier 3 TF-MCP-03 : « connecte X » / réponse franche). */
@ExtendWith(MockitoExtension.class)
@DisplayName("FindIntegrationTool")
class FindIntegrationToolTest {

    @Mock private IntegrationCatalogService catalogService;

    private FindIntegrationTool tool() { return new FindIntegrationTool(catalogService); }

    private ConnectorView connector(String key, String name, String category, boolean connected, List<String> caps) {
        return new ConnectorView(key, name, category, "OAUTH2", connected,
            List.of(), caps, null, null, null, null, null);
    }

    private IntegrationCatalogResponse catalog() {
        return new IntegrationCatalogResponse(2, 1, List.of(
            new CategoryGroup("PAYMENT", "Paiement", List.of(
                connector("stripe", "Stripe", "PAYMENT", false, List.of("payments", "billing")))),
            new CategoryGroup("PROJECT_MANAGEMENT", "Gestion de projet", List.of(
                connector("linear", "Linear", "PROJECT_MANAGEMENT", true, List.of("mcp"))))));
    }

    @Test
    @DisplayName("métadonnées : name find_integration + query requis")
    void metadata() {
        var t = tool();
        assertThat(t.name()).isEqualTo("find_integration");
        @SuppressWarnings("unchecked")
        List<String> required = (List<String>) t.parametersSchema().get("required");
        assertThat(required).contains("query");
    }

    @Test
    @DisplayName("service disponible NON connecté (par nom) → invite à connecter")
    void finds_available_not_connected() {
        when(catalogService.getCatalog(eq("acme"), eq(7L))).thenReturn(catalog());
        String out = tool().execute(Map.<String, Object>of("query", "stripe"), new AgentContext("acme", 1L, 7L));
        assertThat(out).contains("Stripe").contains("NOT connected").contains("Settings");
    }

    @Test
    @DisplayName("match par capacité (« billing ») + statut déjà connecté visible")
    void finds_by_capability() {
        when(catalogService.getCatalog(eq("acme"), eq(7L))).thenReturn(catalog());
        String out = tool().execute(Map.<String, Object>of("query", "billing"), new AgentContext("acme", 1L, 7L));
        assertThat(out).contains("Stripe"); // trouvé via la capacité, pas le nom
    }

    @Test
    @DisplayName("un outil que l'éditeur ferme encore se dit pas encore connectable, avec la raison")
    void a_blocked_tool_is_not_offered() {
        ConnectorView square = new ConnectorView("square", "Square", "FINANCE_HR", "MCP", false, List.of(), List.of("mcp"),
            null, null, null, null, "https://mcp.squareup.com/mcp", "NOT_CONNECTED", null, null, "self-registration",
            null, null, false, false, "Square admits only the MCP clients on its allowlist.", false);
        when(catalogService.getCatalog(eq("acme"), eq(7L))).thenReturn(new IntegrationCatalogResponse(1, 0,
            List.of(new CategoryGroup("FINANCE_HR", "Finance and HR", List.of(square)))));

        String out = tool().execute(Map.<String, Object>of("query", "square"), new AgentContext("acme", 1L, 7L));

        assertThat(out).contains("Square").contains("NOT available to connect yet").contains("allowlist")
            .doesNotContain("available, NOT connected");
    }

    @Test
    @DisplayName("une carte par outil (R160) : GitHub dit sa native et ses outils en direct pour Cortex, une seule fois")
    void a_native_says_its_second_access() {
        ConnectorView live = new ConnectorView("github-mcp", "GitHub", "CODE", "MCP", false, List.of(), List.of("mcp"),
            null, null, null, null, "https://api.githubcopilot.com/mcp/", "NOT_CONNECTED", null, null, "our-app",
            null, null, false, true, null, false);
        ConnectorView github = new ConnectorView("github", "GitHub", "CODE", "OAUTH2", true, List.of(),
            List.of("observe", "act"), null, null, null, null, null, "CONNECTED", null, null, null, null, null, false,
            false, null, true, live);
        when(catalogService.getCatalog(eq("acme"), eq(7L))).thenReturn(new IntegrationCatalogResponse(1, 1,
            List.of(new CategoryGroup("CODE", "Code and deploy", List.of(github)))));

        String out = tool().execute(Map.<String, Object>of("query", "github"), new AgentContext("acme", 1L, 7L));

        assertThat(out).contains("- GitHub (Code and deploy) : already connected; its live tools for Cortex: available, NOT connected");
        assertThat(out.split("GitHub \\(", -1)).hasSize(2);
    }

    @Test
    @DisplayName("une native se trouve aussi par son second accès : sa clé, ses capacités (R159)")
    void a_native_is_found_by_its_second_access() {
        ConnectorView live = new ConnectorView("slack-mcp", "Slack", "CHAT_MAIL", "MCP", false, List.of(), List.of("mcp"),
            null, null, null, null, "https://mcp.slack.com/mcp", "NOT_CONNECTED", null, null, "company-app",
            null, null, false, false, null, false);
        ConnectorView slack = new ConnectorView("slack", "Slack", "CHAT_MAIL", "OAUTH2", false, List.of(),
            List.of("observe", "act"), null, null, null, null, null, "NOT_CONNECTED", null, null, null, null, null, false,
            false, null, true, live);
        when(catalogService.getCatalog(eq("acme"), eq(7L))).thenReturn(new IntegrationCatalogResponse(1, 0,
            List.of(new CategoryGroup("CHAT_MAIL", "Chat, mail and meetings", List.of(slack)))));

        // Ni le nom, ni la clé, ni les capacités de la native ne disent « mcp » : son second accès, si.
        String out = tool().execute(Map.<String, Object>of("query", "mcp"), new AgentContext("acme", 1L, 7L));

        assertThat(out).contains("- Slack (Chat, mail and meetings)").doesNotContain("No integration matches");
    }

    @Test
    @DisplayName("aucune correspondance → réponse franche, et la piste du serveur MCP")
    void no_match_is_honest() {
        when(catalogService.getCatalog(eq("acme"), eq(7L))).thenReturn(catalog());
        String out = tool().execute(Map.<String, Object>of("query", "salesforce"), new AgentContext("acme", 1L, 7L));
        assertThat(out).contains("No integration matches").contains("Connect an MCP server");
    }
}
