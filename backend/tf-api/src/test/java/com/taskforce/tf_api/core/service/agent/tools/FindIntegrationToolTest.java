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
        return new ConnectorView(key, name, category, "OAUTH2", "AVAILABLE", connected,
            List.of(), caps, null, null, null, null, null);
    }

    private IntegrationCatalogResponse catalog() {
        return new IntegrationCatalogResponse(2, 2, 1, List.of(
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
        assertThat(out).contains("Stripe").contains("NON connecté").contains("Réglages");
    }

    @Test
    @DisplayName("match par capacité (« billing ») + statut déjà connecté visible")
    void finds_by_capability() {
        when(catalogService.getCatalog(eq("acme"), eq(7L))).thenReturn(catalog());
        String out = tool().execute(Map.<String, Object>of("query", "billing"), new AgentContext("acme", 1L, 7L));
        assertThat(out).contains("Stripe"); // trouvé via la capacité, pas le nom
    }

    @Test
    @DisplayName("aucune correspondance → réponse franche (pas d'intégration)")
    void no_match_is_honest() {
        when(catalogService.getCatalog(eq("acme"), eq(7L))).thenReturn(catalog());
        String out = tool().execute(Map.<String, Object>of("query", "salesforce"), new AgentContext("acme", 1L, 7L));
        assertThat(out).contains("Aucune intégration");
    }
}
