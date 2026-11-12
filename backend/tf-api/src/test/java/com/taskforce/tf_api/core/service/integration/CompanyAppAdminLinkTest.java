package com.taskforce.tf_api.core.service.integration;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.mock.env.MockEnvironment;

import com.taskforce.tf_api.core.dto.response.IntegrationCatalogResponse;
import com.taskforce.tf_api.core.dto.response.IntegrationCatalogResponse.ConnectorView;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.ConnectorAppRepository;
import com.taskforce.tf_api.core.repository.IntegrationRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.mcp.McpOAuthSettings;
import com.taskforce.tf_api.core.service.mcp.WorkspaceMcpService;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/**
 * La page de l'administrateur chez Microsoft porte l'identifiant de notre application Entra (TF-J2-14) : un lien en un
 * clic pour qu'il accorde TaskForce à toute son entreprise. Sans application sur l'instance, pas de lien qui mènerait nulle
 * part ; les autres outils gardent le leur.
 */
@DisplayName("Le lien de l'administrateur de Microsoft 365")
class CompanyAppAdminLinkTest {

    private IntegrationCatalogResponse catalog(MockEnvironment env) {
        WorkspaceRepository workspaces = Mockito.mock(WorkspaceRepository.class);
        WorkspaceMemberRepository members = Mockito.mock(WorkspaceMemberRepository.class);
        WorkspaceMcpService mcp = Mockito.mock(WorkspaceMcpService.class);
        ConnectorAppRepository apps = Mockito.mock(ConnectorAppRepository.class);
        when(workspaces.findBySlug("acme")).thenReturn(Optional.of(Workspace.builder().id(1L).slug("acme").build()));
        when(members.existsByWorkspaceIdAndUserId(1L, 7L)).thenReturn(true);
        when(mcp.connectedServers(1L, 7L)).thenReturn(List.of());
        when(apps.findByWorkspaceId(1L)).thenReturn(List.of());
        ConnectorCatalog connectors = new ConnectorCatalog();
        connectors.build();
        McpOAuthSettings settings = new McpOAuthSettings("https://api.example.test", "", "https://app.example.test",
            "TaskForce", "web", "");
        settings.setEnvironment(env);
        return new IntegrationCatalogService(connectors, workspaces, members, Mockito.mock(IntegrationRepository.class),
            mcp, apps, settings).getCatalog("acme", 7L);
    }

    private static ConnectorView tool(IntegrationCatalogResponse catalog, String key) {
        return catalog.categories().stream().flatMap(g -> g.tools().stream()).filter(t -> t.key().equals(key))
            .findFirst().orElseThrow();
    }

    @Test
    @DisplayName("avec notre application : l'accord de l'administrateur, en un lien")
    void withOurApp() {
        MockEnvironment env = new MockEnvironment().withProperty("TF_MICROSOFT_CLIENT_ID", "11111111-2222-3333-4444-555555555555");
        IntegrationCatalogResponse catalog = catalog(env);

        assertThat(tool(catalog, "microsoft-365").admin().link())
            .isEqualTo("https://login.microsoftonline.com/organizations/adminconsent?client_id=11111111-2222-3333-4444-555555555555");
        assertThat(tool(catalog, "microsoft-365").writeChoice()).isTrue();
        assertThat(tool(catalog, "google-drive").admin().link()).startsWith("https://admin.google.com/");
    }

    @Test
    @DisplayName("sans application sur l'instance : pas de lien")
    void withoutOurApp() {
        assertThat(tool(catalog(new MockEnvironment()), "microsoft-365").admin().link()).isNull();
    }
}
