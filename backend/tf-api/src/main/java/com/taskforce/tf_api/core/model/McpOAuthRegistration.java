package com.taskforce.tf_api.core.model;

import java.time.LocalDateTime;

import org.hibernate.annotations.CreationTimestamp;

import com.taskforce.tf_api.shared.security.EncryptedStringConverter;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Une inscription dynamique (DCR) de TaskForce auprès d'un serveur d'autorisation, gardée par émetteur et par adresse
 * de retour (norme MCP du 28/07/2026 : les identifiants d'un client se rangent par émetteur). Une seule inscription
 * sert toutes les connexions à ce serveur ; elle ne sert jamais à un autre émetteur.
 */
@Entity
@Table(name = "mcp_oauth_client")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class McpOAuthRegistration {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String issuer;

    @Column(name = "redirect_uri", nullable = false, columnDefinition = "TEXT")
    private String redirectUri;

    @Column(name = "client_id", nullable = false, length = 512)
    private String clientId;

    /** Secret rendu par l'inscription, chiffré au repos ; nul pour un client public. */
    @Convert(converter = EncryptedStringConverter.class)
    @Column(name = "client_secret", columnDefinition = "TEXT")
    private String clientSecret;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
