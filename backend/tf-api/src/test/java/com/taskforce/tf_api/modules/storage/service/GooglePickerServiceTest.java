package com.taskforce.tf_api.modules.storage.service;

import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import com.taskforce.tf_api.core.model.ConnectorConnection;
import com.taskforce.tf_api.core.service.mcp.CompanyConnections;
import com.taskforce.tf_api.core.service.mcp.McpTokenService;
import com.taskforce.tf_api.shared.exception.BusinessException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@DisplayName("Ce qu'il faut au sélecteur de Google Drive")
class GooglePickerServiceTest {

    private final CompanyConnections connections = Mockito.mock(CompanyConnections.class);
    private final McpTokenService tokens = Mockito.mock(McpTokenService.class);
    private final ConnectorConnection conn = ConnectorConnection.builder().id(3L).connectorKey("google-drive").build();

    @Test
    @DisplayName("la clé du navigateur, le projet, et le jeton de la connexion de la personne elle-même")
    void config() {
        when(connections.own(1L, 7L, "google-drive"))
            .thenReturn(Optional.of(new CompanyConnections.Usable(conn, "https://g", false, Set.of())));
        when(tokens.validAccessToken(conn)).thenReturn("short-token");
        GooglePickerService.PickerConfig config = new GooglePickerService(connections, tokens, " key ", "123").config(1L, 7L);
        assertThat(config).isEqualTo(new GooglePickerService.PickerConfig("key", "123", "short-token"));
    }

    @Test
    @DisplayName("sans clé sur l'instance, sans connexion à soi, ou un jeton refusé : une phrase qui dit quoi faire")
    void refusals() {
        assertThatThrownBy(() -> new GooglePickerService(connections, tokens, "", "123").config(1L, 7L))
            .isInstanceOf(BusinessException.class).hasMessageContaining("isn't set up");
        when(connections.own(1L, 8L, "google-drive")).thenReturn(Optional.empty());
        assertThatThrownBy(() -> new GooglePickerService(connections, tokens, "key", "123").config(1L, 8L))
            .isInstanceOf(BusinessException.class).hasMessageContaining("your own account");
        when(connections.own(1L, 7L, "google-drive"))
            .thenReturn(Optional.of(new CompanyConnections.Usable(conn, "https://g", false, Set.of())));
        when(tokens.validAccessToken(conn)).thenReturn(null);
        assertThatThrownBy(() -> new GooglePickerService(connections, tokens, "key", "123").config(1L, 7L))
            .isInstanceOf(BusinessException.class).hasMessageContaining("reconnect");
    }
}
