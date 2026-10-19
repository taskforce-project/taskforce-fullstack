package com.taskforce.tf_api.core.config;

import java.net.URI;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Set;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.web.webauthn.api.AuthenticatorSelectionCriteria;
import org.springframework.security.web.webauthn.api.PublicKeyCredentialRpEntity;
import org.springframework.security.web.webauthn.api.ResidentKeyRequirement;
import org.springframework.security.web.webauthn.api.UserVerificationRequirement;
import org.springframework.security.web.webauthn.management.JdbcUserCredentialRepository;
import org.springframework.security.web.webauthn.management.UserCredentialRepository;
import org.springframework.security.web.webauthn.management.WebAuthnRelyingPartyOperations;
import org.springframework.security.web.webauthn.management.Webauthn4JRelyingPartyOperations;

import com.taskforce.tf_api.core.security.PasskeyUserEntities;

/**
 * Passkeys de la webapp. Le site WebAuthn est l'adresse de la webapp ({@code app.frontend-url}) : son nom d'hôte est
 * l'identifiant du site (une passkey ne sert qu'à lui), son origine la seule admise, plus celles de
 * {@code security.passkeys.extra-origins} en développement. Une passkey se crée sur l'appareil, découvrable (la
 * connexion n'a pas besoin de l'adresse), et chaque usage demande le geste de la personne (empreinte, visage, code de
 * l'appareil) : elle vaut alors deux facteurs.
 */
@Configuration
@Profile("!desktop")
public class PasskeyConfig {

    @Bean
    public UserCredentialRepository passkeyCredentials(JdbcTemplate jdbcTemplate) {
        return new JdbcUserCredentialRepository(jdbcTemplate);
    }

    @Bean
    public WebAuthnRelyingPartyOperations passkeyRelyingParty(
        PasskeyUserEntities users,
        UserCredentialRepository passkeyCredentials,
        @Value("${app.frontend-url:http://localhost:3000}") String frontendUrl,
        @Value("${security.passkeys.extra-origins:}") String extraOrigins
    ) {
        URI app = URI.create(frontendUrl.trim());
        Webauthn4JRelyingPartyOperations operations = new Webauthn4JRelyingPartyOperations(users, passkeyCredentials,
            PublicKeyCredentialRpEntity.builder().id(app.getHost()).name("TaskForce").build(),
            origins(app, extraOrigins));
        operations.setCustomizeCreationOptions(options -> options.authenticatorSelection(AuthenticatorSelectionCriteria.builder()
            .residentKey(ResidentKeyRequirement.REQUIRED)
            .userVerification(UserVerificationRequirement.REQUIRED)
            .build()));
        operations.setCustomizeRequestOptions(options -> options.userVerification(UserVerificationRequirement.REQUIRED));
        return operations;
    }

    static Set<String> origins(URI app, String extraOrigins) {
        Set<String> origins = new LinkedHashSet<>();
        origins.add(origin(app));
        Arrays.stream(extraOrigins.split(","))
            .map(String::trim)
            .filter(value -> !value.isEmpty())
            .map(value -> origin(URI.create(value)))
            .forEach(origins::add);
        return origins;
    }

    /** {@code https://app.example.com/x} -> {@code https://app.example.com} (port gardé s'il n'est pas celui par défaut). */
    static String origin(URI url) {
        return url.getScheme() + "://" + url.getHost() + (url.getPort() == -1 ? "" : ":" + url.getPort());
    }
}
