package com.taskforce.tf_api.core.repository;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

import com.taskforce.tf_api.core.enums.ConnectionScope;
import com.taskforce.tf_api.core.model.ConnectorApp;
import com.taskforce.tf_api.core.model.ConnectorConnection;
import com.taskforce.tf_api.core.model.McpOAuthRegistration;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.util.AbstractIntegrationTest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Une connexion par personne contre un <b>vrai Postgres</b> (V124, séance n°22 R154) : les tests unitaires mockent ce
 * dépôt, ils ne prouvent ni les index uniques partiels, ni la contrainte qui lie la portée au propriétaire, ni la requête
 * qui rend à une personne ses connexions et celles de l'espace, jamais celles d'une autre.
 */
@DisplayName("Connexions aux outils, par personne (intégration Postgres)")
class ConnectorConnectionRepositoryIntegrationTest extends AbstractIntegrationTest {

    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private ConnectorConnectionRepository connections;
    @Autowired private ConnectorAppRepository apps;
    @Autowired private McpOAuthRegistrationRepository registrations;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private IssueRepository issues;

    private User ada;
    private User bob;
    private Workspace ws;

    @BeforeEach
    void seed() {
        ada = userRepository.save(User.builder().keycloakId("kc-ada").email("ada@it.dev").displayName("a").isActive(true).build());
        bob = userRepository.save(User.builder().keycloakId("kc-bob").email("bob@it.dev").displayName("b").isActive(true).build());
        ws = workspaceRepository.save(Workspace.builder().name("IT").slug("ws-connect-it").owner(ada).build());
    }

    private ConnectorConnection personal(User owner) {
        return ConnectorConnection.builder().workspace(ws).connectorKey("notion").config("{\"mcpUrl\":\"https://x/mcp\"}")
            .scope(ConnectionScope.PERSONAL).owner(owner).connectedBy(owner).build();
    }

    private ConnectorConnection shared() {
        return ConnectorConnection.builder().workspace(ws).connectorKey("notion").config("{\"mcpUrl\":\"https://x/mcp\"}")
            .scope(ConnectionScope.WORKSPACE).connectedBy(ada).build();
    }

    @Test
    @DisplayName("une connexion par personne et par outil, plus une partagée : chacun voit la sienne et la partagée")
    void eachPersonHerOwnPlusTheShared() {
        connections.saveAndFlush(personal(ada));
        connections.saveAndFlush(personal(bob));
        connections.saveAndFlush(shared());

        List<ConnectorConnection> forAda = connections.findUsable(ws.getId(), ada.getId());
        assertThat(forAda).hasSize(2).allSatisfy(c -> assertThat(c.getOwner() == null || c.isOwnedBy(ada.getId())).isTrue());
        assertThat(connections.findByWorkspaceIdAndConnectorKeyAndOwnerId(ws.getId(), "notion", bob.getId()))
            .hasValueSatisfying(c -> assertThat(c.isOwnedBy(bob.getId())).isTrue());
        assertThat(connections.findByWorkspaceIdAndConnectorKeyAndOwnerIsNull(ws.getId(), "notion"))
            .hasValueSatisfying(c -> assertThat(c.isShared()).isTrue());
    }

    @Test
    @DisplayName("deux connexions personnelles du même outil pour la même personne : refusées par l'index")
    void oneConnectionPerPersonAndTool() {
        connections.saveAndFlush(personal(ada));

        assertThatThrownBy(() -> connections.saveAndFlush(personal(ada))).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("deux connexions partagées du même outil : refusées par l'index")
    void oneSharedConnectionPerTool() {
        connections.saveAndFlush(shared());

        assertThatThrownBy(() -> connections.saveAndFlush(shared())).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("la portée suit le propriétaire : une connexion personnelle sans personne est refusée par la base")
    void scopeMatchesTheOwner() {
        ConnectorConnection orphan = ConnectorConnection.builder().workspace(ws).connectorKey("linear")
            .scope(ConnectionScope.PERSONAL).build();

        assertThatThrownBy(() -> connections.saveAndFlush(orphan)).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("une ligne d'avant V124 (sans portée ni propriétaire) devient une connexion d'espace")
    void legacyRowsAreWorkspaceConnections() {
        jdbc.update("INSERT INTO connector_connection (workspace_id, connector_key, config, created_at, updated_at) "
            + "VALUES (?, 'linear', '{}', NOW(), NOW())", ws.getId());

        assertThat(connections.findByWorkspaceIdAndConnectorKeyAndOwnerIsNull(ws.getId(), "linear"))
            .hasValueSatisfying(c -> {
                assertThat(c.getScope()).isEqualTo(ConnectionScope.WORKSPACE);
                assertThat(c.getState().name()).isEqualTo("CONNECTED");
            });
    }

    @Test
    @DisplayName("une seule application d'entreprise par outil et par espace")
    void oneCompanyAppPerTool() {
        apps.saveAndFlush(ConnectorApp.builder().workspace(ws).connectorKey("slack-mcp").clientId("c").clientSecret("s").build());
        assertThat(apps.findByWorkspaceIdAndConnectorKey(ws.getId(), "slack-mcp")).hasValueSatisfying(a ->
            assertThat(a.getClientSecret()).isEqualTo("s"));

        assertThatThrownBy(() -> apps.saveAndFlush(ConnectorApp.builder().workspace(ws).connectorKey("slack-mcp")
            .clientId("c2").build())).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("une seule inscription dynamique par émetteur et adresse de retour")
    void oneRegistrationPerIssuer() {
        registrations.saveAndFlush(McpOAuthRegistration.builder().issuer("https://as.ex").redirectUri("http://127.0.0.1:47816/mcp/callback")
            .clientId("dcr-1").build());
        assertThat(registrations.findByIssuerAndRedirectUri("https://as.ex", "http://127.0.0.1:47816/mcp/callback"))
            .hasValueSatisfying(r -> assertThat(r.getClientId()).isEqualTo("dcr-1"));

        assertThatThrownBy(() -> registrations.saveAndFlush(McpOAuthRegistration.builder().issuer("https://as.ex")
            .redirectUri("http://127.0.0.1:47816/mcp/callback").clientId("dcr-2").build()))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("les issues importées : la colonne de V124 et les requêtes que le socle lit (R158)")
    void importedIssuesColumnAndQueries() {
        Integer column = jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.columns "
            + "WHERE table_name = 'issues' AND column_name = 'imported_from'", Integer.class);
        assertThat(column).isEqualTo(1);
        assertThat(issues.existsByProjectWorkspaceIdAndImportedFromIsNotNull(ws.getId())).isFalse();
        assertThat(issues.existsByProjectIdAndImportedFromIsNotNull(-1L)).isFalse();
        assertThat(issues.existsByIdInAndProjectWorkspaceIdAndImportedFromIsNotNull(List.of(-1L), ws.getId())).isFalse();
    }
}
