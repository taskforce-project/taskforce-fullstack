package com.taskforce.tf_api.core.service.delivery;

import java.util.List;
import java.util.Map;

import org.keycloak.admin.client.Keycloak;
import org.keycloak.admin.client.resource.ClientResource;
import org.keycloak.admin.client.resource.ProtocolMappersResource;
import org.keycloak.admin.client.resource.RealmResource;
import org.keycloak.representations.idm.ClientRepresentation;
import org.keycloak.representations.idm.ProtocolMapperRepresentation;
import org.keycloak.representations.idm.RoleRepresentation;
import org.keycloak.representations.idm.UserRepresentation;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import com.taskforce.tf_api.core.dto.response.RunnerProvisionResponse;
import com.taskforce.tf_api.core.dto.response.RunnerStatusResponse;
import com.taskforce.tf_api.core.model.User;

import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.core.Response;
import lombok.extern.slf4j.Slf4j;

/**
 * Provisionne, dans Keycloak, l'identité machine d'un runner local (ADR-013) pour un utilisateur, en
 * libre-service : équivalent Java des scripts {@code scripts/keycloak-runner.ps1} / {@code ops/kc-runner.sh},
 * mais borné au compte de l'appelant.
 *
 * <p>Crée de façon idempotente : le rôle de realm {@link LocalRunnerSettings#runnerRole()} ; un client
 * confidentiel {@code <prefix>u<id>} réduit au grant {@code client_credentials} ; ce rôle porté par son compte
 * de service ; un mapper « hardcoded claim » qui signe le propriétaire ({@link LocalRunnerSettings#ownerClaim()}
 * = e-mail). Le secret n'est lu qu'au retour (régénéré à chaque appel), jamais stocké côté TaskForce.</p>
 *
 * <p><b>Sécurité :</b> le propriétaire est TOUJOURS l'e-mail de l'utilisateur authentifié (jamais une valeur
 * venue du client). Un runner provisionné ici ne peut donc agir qu'au nom de la personne qui l'a demandé.</p>
 */
@Service
@ConditionalOnProperty(name = LocalRunnerSettings.ENABLED_PROPERTY, havingValue = "true")
@Slf4j
public class RunnerProvisioningService {

    static final String OWNER_MAPPER_NAME = "tf-runner-owner";
    private static final String HARDCODED_CLAIM_MAPPER = "oidc-hardcoded-claim-mapper";

    private final Keycloak keycloak;
    private final LocalRunnerSettings settings;
    private final String realm;

    public RunnerProvisioningService(
        Keycloak keycloakAdminClient,
        LocalRunnerSettings settings,
        @Value("${keycloak.realm}") String realm
    ) {
        this.keycloak = keycloakAdminClient;
        this.settings = settings;
        this.realm = realm;
    }

    /** Un runner est-il déjà provisionné pour {@code owner} ? Ne renvoie jamais de secret. */
    public RunnerStatusResponse status(User owner) {
        String clientId = runnerClientId(settings.clientPrefix(), owner.getId());
        boolean exists = !keycloak.realm(realm).clients().findByClientId(clientId).isEmpty();
        return new RunnerStatusResponse(exists, clientId, owner.getEmail().toLowerCase());
    }

    /** Provisionne (ou re-provisionne, en régénérant le secret) le runner de {@code owner}. */
    public RunnerProvisionResponse provision(User owner) {
        String ownerEmail = owner.getEmail().toLowerCase();
        String clientId = runnerClientId(settings.clientPrefix(), owner.getId());
        RealmResource realmResource = keycloak.realm(realm);

        ensureRole(realmResource, settings.runnerRole());
        ClientResource client = ensureClient(realmResource, clientId, ownerEmail);
        assignRoleToServiceAccount(realmResource, client, settings.runnerRole());
        setOwnerMapper(client, settings.ownerClaim(), ownerEmail);

        String secret = client.generateNewSecret().getValue();
        log.info("Runner provisionné : client {} (propriétaire {})", clientId, ownerEmail);
        return new RunnerProvisionResponse(clientId, secret, ownerEmail);
    }

    /** {@code <prefix>u<id>} : déterministe et unique par utilisateur (un runner par personne, idempotent). */
    static String runnerClientId(String prefix, Long userId) {
        return prefix + "u" + userId;
    }

    private void ensureRole(RealmResource realmResource, String roleName) {
        try {
            realmResource.roles().get(roleName).toRepresentation();
        } catch (NotFoundException e) {
            realmResource.roles().create(new RoleRepresentation(roleName, "Runner local de délégation (ADR-013)", false));
            log.info("Rôle Keycloak '{}' créé", roleName);
        }
    }

    /** Crée ou met à jour le client confidentiel réduit à client_credentials, renvoie sa ressource. */
    private ClientResource ensureClient(RealmResource realmResource, String clientId, String ownerEmail) {
        List<ClientRepresentation> existing = realmResource.clients().findByClientId(clientId);
        ClientRepresentation rep = buildClientRep(clientId, ownerEmail);
        String uuid;
        if (existing.isEmpty()) {
            try (Response response = realmResource.clients().create(rep)) {
                if (response.getStatus() >= 300) {
                    throw new IllegalStateException("Création du client runner refusée (HTTP " + response.getStatus() + ")");
                }
            }
            uuid = realmResource.clients().findByClientId(clientId).get(0).getId();
        } else {
            uuid = existing.get(0).getId();
            rep.setId(uuid);
            realmResource.clients().get(uuid).update(rep);
        }
        return realmResource.clients().get(uuid);
    }

    /** Le rôle runner porté par le compte de service du client (l'ajout d'un rôle déjà présent est sans effet). */
    private void assignRoleToServiceAccount(RealmResource realmResource, ClientResource client, String roleName) {
        UserRepresentation serviceAccount = client.getServiceAccountUser();
        RoleRepresentation role = realmResource.roles().get(roleName).toRepresentation();
        realmResource.users().get(serviceAccount.getId()).roles().realmLevel().add(List.of(role));
    }

    /** (Re)pose le mapper qui signe le propriétaire : on supprime l'ancien puis on recrée, pour suivre l'e-mail. */
    private void setOwnerMapper(ClientResource client, String ownerClaim, String ownerEmail) {
        ProtocolMappersResource mappers = client.getProtocolMappers();
        mappers.getMappers().stream()
            .filter(m -> OWNER_MAPPER_NAME.equals(m.getName()))
            .forEach(m -> mappers.delete(m.getId()));
        try (Response ignored = mappers.createMapper(buildOwnerMapper(ownerClaim, ownerEmail))) {
            // Response fermée d'office (try-with-resources).
        }
    }

    /** Client confidentiel, <b>client_credentials uniquement</b> : aucun flux navigateur ni password grant. */
    static ClientRepresentation buildClientRep(String clientId, String ownerEmail) {
        ClientRepresentation rep = new ClientRepresentation();
        rep.setClientId(clientId);
        rep.setProtocol("openid-connect");
        rep.setEnabled(true);
        rep.setPublicClient(false);
        rep.setServiceAccountsEnabled(true);
        rep.setStandardFlowEnabled(false);
        rep.setImplicitFlowEnabled(false);
        rep.setDirectAccessGrantsEnabled(false);
        rep.setDescription("Runner local (ADR-013) - propriétaire : " + ownerEmail);
        return rep;
    }

    /** Mapper « hardcoded claim » : {@code <ownerClaim> = <ownerEmail>}, dans l'access token seulement. */
    static ProtocolMapperRepresentation buildOwnerMapper(String ownerClaim, String ownerEmail) {
        ProtocolMapperRepresentation mapper = new ProtocolMapperRepresentation();
        mapper.setName(OWNER_MAPPER_NAME);
        mapper.setProtocol("openid-connect");
        mapper.setProtocolMapper(HARDCODED_CLAIM_MAPPER);
        mapper.setConfig(Map.of(
            "claim.name", ownerClaim,
            "claim.value", ownerEmail,
            "jsonType.label", "String",
            "access.token.claim", "true",
            "id.token.claim", "false",
            "userinfo.token.claim", "false"
        ));
        return mapper;
    }
}
