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
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Un connecteur du catalogue connecté sur un workspace — stockage <b>générique</b>, découplé de
 * l'enum {@code IntegrationProvider} (réservé à GitHub/Slack/Plane, qui ont un comportement dédié).
 *
 * <p>{@code config} porte les champs de connexion (clés, tokens, endpoints) sérialisés en JSON et
 * <b>chiffrés au repos</b> via {@link EncryptedStringConverter} — jamais de secret en clair en base.
 */
@Entity
@Table(
    name = "connector_connection",
    indexes = { @Index(name = "uq_connector_connection", columnList = "workspace_id, connector_key", unique = true) }
)
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ConnectorConnection extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "workspace_id", nullable = false)
    private Workspace workspace;

    /** Clé du connecteur dans le catalogue (ex. {@code notion}, {@code stripe}). */
    @Column(name = "connector_key", nullable = false, length = 64)
    private String connectorKey;

    /** JSON des champs de connexion, chiffré au repos. */
    @Convert(converter = EncryptedStringConverter.class)
    @Column(nullable = false, columnDefinition = "TEXT")
    @Builder.Default
    private String config = "{}";

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "connected_by")
    private User connectedBy;
}
