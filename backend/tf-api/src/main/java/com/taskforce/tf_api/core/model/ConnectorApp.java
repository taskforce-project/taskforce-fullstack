package com.taskforce.tf_api.core.model;

import com.taskforce.tf_api.shared.audit.AuditableEntity;
import com.taskforce.tf_api.shared.security.EncryptedStringConverter;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * L'application de l'entreprise chez un éditeur (chemin C, séance n°22, R154) : son administrateur la crée ou
 * l'approuve dans son propre tenant, puis saisit une fois son identifiant et son secret dans les réglages de TaskForce.
 * Chaque personne de l'espace se connecte ensuite par elle, avec son propre compte. Le secret est chiffré au repos et
 * ne ressort jamais de l'API.
 */
@Entity
@Table(name = "connector_app")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ConnectorApp extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "workspace_id", nullable = false)
    private Workspace workspace;

    @Column(name = "connector_key", nullable = false, length = 64)
    private String connectorKey;

    @Column(name = "client_id", nullable = false, length = 512)
    private String clientId;

    /** Secret du client, chiffré au repos ; nul pour un client public (PKCE seul). */
    @Convert(converter = EncryptedStringConverter.class)
    @Column(name = "client_secret", columnDefinition = "TEXT")
    private String clientSecret;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "saved_by")
    private User savedBy;
}
