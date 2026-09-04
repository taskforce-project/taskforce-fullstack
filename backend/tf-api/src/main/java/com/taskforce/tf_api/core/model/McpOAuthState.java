package com.taskforce.tf_api.core.model;

import java.time.LocalDateTime;

import org.hibernate.annotations.CreationTimestamp;

import com.taskforce.tf_api.shared.security.EncryptedStringConverter;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Etat ephemere du flux <b>OAuth 2.1</b> d'un serveur MCP (TF-MCP-02), entre le clic (start) et le
 * retour du fournisseur (callback). Le {@code state} (aleatoire, anti-CSRF) resout le workspace au
 * callback plutot qu'un slug devinable dans l'URL, puis la ligne est supprimee. Les secrets
 * ({@code codeVerifier} PKCE, {@code clientSecret} DCR) sont chiffres au repos.
 *
 * <p>Ligne courte duree ({@code expiresAt} ~ now + 10 min), purgee.
 */
@Entity
@Table(name = "mcp_oauth_states")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class McpOAuthState {

    /** Token aleatoire URL-safe (anti-CSRF), renvoye dans l'URL d'autorisation. */
    @Id
    @Column(length = 64)
    private String state;

    @Column(name = "workspace_id", nullable = false)
    private Long workspaceId;

    /** Utilisateur qui a initie le flux (null si le compte est supprime entre-temps). */
    @Column(name = "user_id")
    private Long userId;

    @Column(name = "connector_key", nullable = false, length = 64)
    private String connectorKey;

    /** Serveur MCP vise (= parametre {@code resource}, RFC 8707). */
    @Column(name = "mcp_url", nullable = false, columnDefinition = "TEXT")
    private String mcpUrl;

    /** Verifier PKCE (chiffre au repos). */
    @Convert(converter = EncryptedStringConverter.class)
    @Column(name = "code_verifier", nullable = false, columnDefinition = "TEXT")
    private String codeVerifier;

    /** Endpoint d'echange du code (decouvert via la metadata du serveur d'auth). */
    @Column(name = "token_endpoint", nullable = false, columnDefinition = "TEXT")
    private String tokenEndpoint;

    @Column(name = "client_id", nullable = false, length = 255)
    private String clientId;

    /** Secret client DCR (chiffre au repos) ; null pour un client public (PKCE seul). */
    @Convert(converter = EncryptedStringConverter.class)
    @Column(name = "client_secret", columnDefinition = "TEXT")
    private String clientSecret;

    @Column(name = "redirect_uri", nullable = false, columnDefinition = "TEXT")
    private String redirectUri;

    @Column(columnDefinition = "TEXT")
    private String scope;

    /** Issuer du serveur d'auth, reporte sur la connexion pour le refresh ulterieur. */
    @Column(columnDefinition = "TEXT")
    private String issuer;

    /** Chemin applicatif RELATIF de retour apres le callback (null = page Settings par defaut). */
    @Column(name = "return_to", length = 500)
    private String returnTo;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;
}
