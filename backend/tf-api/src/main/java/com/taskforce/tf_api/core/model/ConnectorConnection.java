package com.taskforce.tf_api.core.model;

import java.time.LocalDateTime;

import com.taskforce.tf_api.core.enums.ConnectionScope;
import com.taskforce.tf_api.core.enums.ConnectionState;
import com.taskforce.tf_api.shared.audit.AuditableEntity;
import com.taskforce.tf_api.shared.security.EncryptedStringConverter;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
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
 * Une connexion à un outil du catalogue, sur un workspace : stockage <b>générique</b>, découplé de l'enum
 * {@code IntegrationProvider} (réservé à GitHub/Slack/Plane, qui ont un comportement dédié).
 *
 * <p>Depuis V124 (séance n°22, R154), une connexion appartient à une personne ({@link ConnectionScope#PERSONAL},
 * {@code owner}) : Cortex et chaque geste fait pour elle passent par sa connexion, et personne d'autre ne s'en sert.
 * Une connexion d'espace ({@link ConnectionScope#WORKSPACE}, sans {@code owner}) n'existe que pour une source
 * partagée. L'unicité : une connexion d'espace par outil, une connexion personnelle par outil et par personne.</p>
 *
 * <p>{@code config} porte les champs de connexion (clés, jetons, endpoints) sérialisés en JSON et
 * <b>chiffrés au repos</b> via {@link EncryptedStringConverter} : jamais de secret en clair en base.</p>
 */
@Entity
@Table(name = "connector_connection")
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

    /** Clé du connecteur dans le catalogue (ex. {@code notion}, {@code stripe}), ou {@code custom-<slug>}. */
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

    /** La personne à qui appartient la connexion ; nulle pour une connexion d'espace. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id")
    private User owner;

    /** Personnelle ou partagée avec l'espace ; les lignes d'avant V124 sont des connexions d'espace. */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    @Builder.Default
    private ConnectionScope scope = ConnectionScope.WORKSPACE;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 24)
    @Builder.Default
    private ConnectionState state = ConnectionState.CONNECTED;

    /** Le compte chez l'éditeur, pour « Connected as ... » ; nul quand l'éditeur ne le dit pas. */
    @Column(name = "account_label", length = 255)
    private String accountLabel;

    /** La liste des outils figée à la connexion : nom d'origine et empreinte de chaque outil, en JSON (R158). */
    @Column(name = "tools_pin", columnDefinition = "TEXT")
    private String toolsPin;

    @Column(name = "pinned_at")
    private LocalDateTime pinnedAt;

    /** La connexion appartient-elle à cette personne ? Toujours faux pour une connexion d'espace. */
    public boolean isOwnedBy(Long userId) {
        return scope == ConnectionScope.PERSONAL && owner != null && owner.getId() != null
            && owner.getId().equals(userId);
    }

    /** Une source partagée avec l'espace ? */
    public boolean isShared() {
        return scope == ConnectionScope.WORKSPACE;
    }
}
