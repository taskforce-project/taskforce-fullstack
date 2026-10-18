package com.taskforce.tf_api.core.service.delivery;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.keycloak.representations.idm.ClientRepresentation;
import org.keycloak.representations.idm.ProtocolMapperRepresentation;

/**
 * Frontière de sécurité du provisioning en libre-service (ADR-013) : on vérifie la forme du client et du
 * mapper, indépendamment de Keycloak. Un client de runner ne doit accepter QUE client_credentials, et le
 * propriétaire signé doit être exactement l'e-mail passé (jamais autre chose).
 */
class RunnerProvisioningServiceTest {

    @Test
    void clientIdDeterministeEtUniqueParUtilisateur() {
        assertThat(RunnerProvisioningService.runnerClientId("tf-runner-", 29L)).isEqualTo("tf-runner-u29");
        assertThat(RunnerProvisioningService.runnerClientId("tf-runner-", 1L)).isEqualTo("tf-runner-u1");
    }

    @Test
    void leClientEstReduitAuGrantClientCredentials() {
        ClientRepresentation rep = RunnerProvisioningService.buildClientRep("tf-runner-u29", "pierre@example.com");

        assertThat(rep.getClientId()).isEqualTo("tf-runner-u29");
        assertThat(rep.isServiceAccountsEnabled()).isTrue();     // client_credentials activé
        assertThat(rep.isPublicClient()).isFalse();              // client confidentiel (a un secret)
        assertThat(rep.isStandardFlowEnabled()).isFalse();       // aucun flux navigateur
        assertThat(rep.isImplicitFlowEnabled()).isFalse();
        assertThat(rep.isDirectAccessGrantsEnabled()).isFalse(); // aucun password grant
        assertThat(rep.isEnabled()).isTrue();
    }

    @Test
    void leMapperSigneLeProprietaireDansLAccessTokenSeulement() {
        ProtocolMapperRepresentation mapper =
            RunnerProvisioningService.buildOwnerMapper("tf_runner_owner", "pierre@example.com");

        assertThat(mapper.getName()).isEqualTo(RunnerProvisioningService.OWNER_MAPPER_NAME);
        assertThat(mapper.getProtocolMapper()).isEqualTo("oidc-hardcoded-claim-mapper");
        assertThat(mapper.getConfig())
            .containsEntry("claim.name", "tf_runner_owner")
            .containsEntry("claim.value", "pierre@example.com")
            .containsEntry("jsonType.label", "String")
            .containsEntry("access.token.claim", "true")
            .containsEntry("id.token.claim", "false")
            .containsEntry("userinfo.token.claim", "false");
    }

    // ── présence d'un runner (lot 5, OSS-5.7) ───────────────────────────────

    private static RunnerProvisioningService service(org.keycloak.admin.client.Keycloak keycloak) {
        return new RunnerProvisioningService(keycloak,
            new LocalRunnerSettings(true, "delivery-runner", "tf-runner-", "tf_runner_owner", 120, 10, 15), "taskforce");
    }

    @Test
    void laPresenceDUnRunnerEstLueUneFoisParMinute() {
        org.keycloak.admin.client.Keycloak keycloak = org.mockito.Mockito.mock(org.keycloak.admin.client.Keycloak.class,
            org.mockito.Mockito.RETURNS_DEEP_STUBS);
        org.mockito.Mockito.when(keycloak.realm("taskforce").clients().findByClientId("tf-runner-u7"))
            .thenReturn(java.util.List.of(new ClientRepresentation()));
        org.mockito.Mockito.when(keycloak.realm("taskforce").clients().findByClientId("tf-runner-u8"))
            .thenReturn(java.util.List.of());
        RunnerProvisioningService service = service(keycloak);

        assertThat(service.hasRunner(7L)).isTrue();
        assertThat(service.hasRunner(7L)).isTrue();
        assertThat(service.hasRunner(8L)).isFalse();

        org.mockito.Mockito.verify(keycloak.realm("taskforce").clients(), org.mockito.Mockito.times(1)).findByClientId("tf-runner-u7");
    }

    @Test
    void keycloakInjoignableNeBloquePasUneDelegation() {
        org.keycloak.admin.client.Keycloak keycloak = org.mockito.Mockito.mock(org.keycloak.admin.client.Keycloak.class,
            org.mockito.Mockito.RETURNS_DEEP_STUBS);
        org.mockito.Mockito.when(keycloak.realm("taskforce").clients().findByClientId("tf-runner-u7"))
            .thenThrow(new jakarta.ws.rs.ProcessingException("connection refused"));

        assertThat(service(keycloak).hasRunner(7L)).isTrue();
    }
}
