package com.taskforce.tf_api.core.service.mcp;

import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.model.ConnectorApp;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.ConnectorAppRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.service.AuditService;
import com.taskforce.tf_api.core.service.AuthorizationService;
import com.taskforce.tf_api.core.service.integration.ConnectorCatalog;
import com.taskforce.tf_api.shared.exception.ForbiddenException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires - {@link ConnectorAppService} : l'application de l'entreprise vaut pour tout l'espace, le service
 * vérifie lui-même le rôle (règle 3), et un autre identifiant efface l'émetteur épinglé sur l'ancienne (V130).
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("ConnectorAppService")
class ConnectorAppServiceTest {

    @Mock private ConnectorAppRepository apps;
    @Mock private WorkspaceMemberRepository members;
    @Mock private AuditService audit;

    private final Workspace ws = Workspace.builder().id(1L).slug("acme").build();
    private final User ada = User.builder().id(7L).email("ada@acme.test").build();
    private final User bob = User.builder().id(8L).email("bob@acme.test").build();
    private ConnectorAppService service;

    @BeforeEach
    void setUp() {
        ConnectorCatalog catalog = new ConnectorCatalog();
        catalog.build();
        // Les vrais droits : Ada (7) administre l'espace, Bob (8) y est membre.
        lenient().when(members.findByWorkspaceIdAndUserId(1L, 7L))
            .thenReturn(Optional.of(WorkspaceMember.builder().role(WorkspaceRole.ADMIN).build()));
        lenient().when(members.findByWorkspaceIdAndUserId(1L, 8L))
            .thenReturn(Optional.of(WorkspaceMember.builder().role(WorkspaceRole.MEMBER).build()));
        service = new ConnectorAppService(apps, catalog, new AuthorizationService(members), audit);
    }

    @Test
    @DisplayName("saisir puis retirer l'application de l'entreprise entre au journal de l'espace, jamais avec le secret")
    void savingAndRemovingAreRecordedWithoutTheSecret() {
        ConnectorApp app = ConnectorApp.builder().id(3L).workspace(ws).connectorKey("slack-mcp").build();
        when(apps.findByWorkspaceIdAndConnectorKey(1L, "slack-mcp")).thenReturn(Optional.empty(), Optional.of(app));

        service.save(ws, ada, "slack-mcp", "1234.5678", "xoxs-very-secret");
        service.remove(1L, 7L, "slack-mcp");

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> details = ArgumentCaptor.forClass(Map.class);
        verify(audit, org.mockito.Mockito.times(2)).record(eq(1L), eq(7L), eq(AuditService.COMPANY_APP_CHANGED),
            eq("connector_app"), eq("slack-mcp"), details.capture());
        assertThat(details.getAllValues().get(0)).containsEntry("change", "saved").containsEntry("clientId", "1234.5678")
            .containsEntry("secretChanged", true);
        assertThat(details.getAllValues().get(1)).containsEntry("change", "removed");
        assertThat(details.getAllValues().toString()).doesNotContain("xoxs-very-secret");
        verify(apps).delete(app);
    }

    @Test
    @DisplayName("un membre refusé n'écrit rien au journal")
    void aRefusalIsNotRecorded() {
        assertThatThrownBy(() -> service.save(ws, bob, "slack-mcp", "cid", "s")).isInstanceOf(ForbiddenException.class);
        org.mockito.Mockito.verifyNoInteractions(audit);
    }

    @Test
    @DisplayName("un membre ne voit, ne saisit ni ne retire l'application de l'entreprise : refus, rien ne change")
    void aMemberIsRefused() {
        assertThatThrownBy(() -> service.list(1L, 8L)).isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> service.save(ws, bob, "slack-mcp", "cid", "secret"))
            .isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> service.remove(1L, 8L, "slack-mcp")).isInstanceOf(ForbiddenException.class);

        verify(apps, never()).findByWorkspaceId(any());
        verify(apps, never()).findByWorkspaceIdAndConnectorKey(any(), any());
        verify(apps, never()).save(any());
        verify(apps, never()).delete(any());
    }

    @Test
    @DisplayName("un administrateur saisit un autre identifiant : l'émetteur épinglé s'efface ; le même identifiant le garde")
    void anotherClientIdClearsThePinnedIssuer() {
        ConnectorApp app = ConnectorApp.builder().id(3L).workspace(ws).connectorKey("glean").clientId("old-id")
            .clientSecret("s-1").issuer("https://sso.glean.example").build();
        when(apps.findByWorkspaceIdAndConnectorKey(1L, "glean")).thenReturn(Optional.of(app));

        service.save(ws, ada, "glean", "old-id", "s-2");
        assertThat(app.getIssuer()).isEqualTo("https://sso.glean.example");
        assertThat(app.getClientSecret()).isEqualTo("s-2");

        ConnectorAppService.CompanyApp saved = service.save(ws, ada, "glean", " new-id ", "");

        assertThat(app.getIssuer()).isNull(); // la prochaine connexion d'un administrateur l'épinglera de nouveau
        assertThat(app.getClientId()).isEqualTo("new-id");
        assertThat(app.getClientSecret()).isEqualTo("s-2"); // un secret vide garde celui déjà saisi
        assertThat(saved).isEqualTo(new ConnectorAppService.CompanyApp("glean", "new-id", true));
        verify(apps, org.mockito.Mockito.times(2)).save(app);
    }
}
