package com.taskforce.tf_api.core.service.mcp;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.ConnectorAppRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.service.AuthorizationService;
import com.taskforce.tf_api.core.service.integration.ConnectorCatalog;
import com.taskforce.tf_api.shared.exception.ForbiddenException;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * Tests unitaires - {@link ConnectorAppService} : l'application de l'entreprise vaut pour tout l'espace, le service
 * vérifie lui-même le rôle (règle 3).
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("ConnectorAppService")
class ConnectorAppServiceTest {

    @Mock private ConnectorAppRepository apps;
    @Mock private WorkspaceMemberRepository members;

    private final Workspace ws = Workspace.builder().id(1L).slug("acme").build();
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
        service = new ConnectorAppService(apps, catalog, new AuthorizationService(members));
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
}
