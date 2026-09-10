package com.taskforce.tf_api.core.service.delivery;

import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.dto.response.DeliveryKeyStatus;
import com.taskforce.tf_api.core.enums.IntegrationProvider;
import com.taskforce.tf_api.core.model.Integration;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.DeliveryRunRepository;
import com.taskforce.tf_api.core.repository.IntegrationRepository;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.ProjectVisibilityGuard;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Connexion / état / déconnexion de la clé API Anthropic du workspace (TF-AGENT-DELIVERY B1).
 * Vérifie l'autorisation (OWNER/ADMIN pour écrire), le stockage de la clé (trim) et l'indice non
 * sensible renvoyé (jamais la clé en clair).
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("DeliveryService - clé Anthropic")
class DeliveryServiceAnthropicTest {

    @Mock private DeliveryRunRepository runRepository;
    @Mock private IssueRepository issueRepository;
    @Mock private UserRepository userRepository;
    @Mock private DeliveryAgentProviderRegistry registry;
    @Mock private ProjectVisibilityGuard visibilityGuard;
    @Mock private BrainAccessGuard access;
    @Mock private IntegrationRepository integrationRepository;

    @InjectMocks private DeliveryService service;

    @Test
    @DisplayName("connect : exige OWNER/ADMIN, stocke la clé (trim) sous provider ANTHROPIC")
    void connect_stores_trimmed_key() {
        Workspace ws = mock(Workspace.class);
        when(ws.getId()).thenReturn(5L);
        when(access.resolveAndAuthorizeOwner("acme", 1L)).thenReturn(ws);

        Integration saved = new Integration();
        saved.setAccessToken("sk-ant-abcd");
        when(integrationRepository.findByWorkspaceIdAndProvider(5L, IntegrationProvider.ANTHROPIC))
            .thenReturn(Optional.empty(), Optional.of(saved)); // 1: connect (absente) ; 2: status
        when(userRepository.findById(1L)).thenReturn(Optional.empty());

        DeliveryKeyStatus resp = service.connectKey("acme", 1L, IntegrationProvider.ANTHROPIC, "  sk-ant-abcd  ");

        ArgumentCaptor<Integration> cap = ArgumentCaptor.forClass(Integration.class);
        verify(integrationRepository).save(cap.capture());
        assertThat(cap.getValue().getProvider()).isEqualTo(IntegrationProvider.ANTHROPIC);
        assertThat(cap.getValue().getWorkspace()).isEqualTo(ws);
        assertThat(cap.getValue().getAccessToken()).isEqualTo("sk-ant-abcd"); // trim appliqué
        assertThat(resp.connected()).isTrue();
    }

    @Test
    @DisplayName("status : clé présente → connected + indice des 4 derniers caractères")
    void status_returns_hint() {
        Workspace ws = mock(Workspace.class);
        when(ws.getId()).thenReturn(5L);
        when(access.resolveAndAuthorize("acme", 1L)).thenReturn(ws);
        Integration integ = new Integration();
        integ.setAccessToken("sk-ant-longkey-AB12");
        when(integrationRepository.findByWorkspaceIdAndProvider(5L, IntegrationProvider.ANTHROPIC))
            .thenReturn(Optional.of(integ));

        DeliveryKeyStatus resp = service.keyStatus("acme", 1L, IntegrationProvider.ANTHROPIC);

        assertThat(resp.connected()).isTrue();
        assertThat(resp.keyHint()).isEqualTo("...AB12");
    }

    @Test
    @DisplayName("status : aucune clé → not connected, pas d'indice")
    void status_not_connected() {
        Workspace ws = mock(Workspace.class);
        when(ws.getId()).thenReturn(5L);
        when(access.resolveAndAuthorize("acme", 1L)).thenReturn(ws);
        when(integrationRepository.findByWorkspaceIdAndProvider(5L, IntegrationProvider.ANTHROPIC))
            .thenReturn(Optional.empty());

        DeliveryKeyStatus resp = service.keyStatus("acme", 1L, IntegrationProvider.ANTHROPIC);

        assertThat(resp.connected()).isFalse();
        assertThat(resp.keyHint()).isNull();
    }

    @Test
    @DisplayName("disconnect : exige OWNER/ADMIN et supprime l'intégration ANTHROPIC")
    void disconnect_deletes_key() {
        Workspace ws = mock(Workspace.class);
        when(ws.getId()).thenReturn(5L);
        when(access.resolveAndAuthorizeOwner("acme", 1L)).thenReturn(ws);

        service.disconnectKey("acme", 1L, IntegrationProvider.ANTHROPIC);

        verify(integrationRepository).deleteByWorkspaceIdAndProvider(5L, IntegrationProvider.ANTHROPIC);
    }
}
