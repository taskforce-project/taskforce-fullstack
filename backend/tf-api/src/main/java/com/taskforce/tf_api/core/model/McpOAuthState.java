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

    /** Nom d'un serveur MCP personnalise (V97) ; null pour un prereglage du catalogue. */
    @Column(name = "mcp_name", length = 60)
    private String mcpName;

    /** Chemin applicatif RELATIF de retour apres le callback (null = page Settings par defaut). */
    @Column(name = "return_to", length = 500)
    private String returnTo;

    /**
     * La connexion sera-t-elle partagee avec l'espace (V126) ? Faux par defaut : elle appartient a qui l'a lancee
     * ({@link #userId}).
     */
    @Column(nullable = false)
    @Builder.Default
    private boolean shared = false;

    /** L'ecriture a-t-elle ete accordee ? Sinon, les seules portees et l'adresse de la lecture (R158). */
    @Column(name = "allow_writes", nullable = false)
    @Builder.Default
    private boolean allowWrites = false;

    /** L'identifiant du serveur MCP envoye en {@code resource} (RFC 8707), tel que sa PRM le declare. */
    @Column(columnDefinition = "TEXT")
    private String resource;

    /** Revocation du jeton chez l'editeur a la deconnexion (RFC 7009), quand il en offre une. */
    @Column(name = "revocation_endpoint", columnDefinition = "TEXT")
    private String revocationEndpoint;

    /** D'ou vient le client : company, ours, cimd ou dcr (pour le dire, et pour la deconnexion). */
    @Column(name = "client_source", length = 16)
    private String clientSource;

    /** Le serveur d'autorisation annonce-t-il {@code iss} au retour (RFC 9207) ? Alors il est exige. */
    @Column(name = "iss_required", nullable = false)
    @Builder.Default
    private boolean issRequired = false;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;
}
