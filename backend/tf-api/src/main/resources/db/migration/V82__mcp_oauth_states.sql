-- ============================================================
-- V82 -- mcp_oauth_states : etat ephemere du flux OAuth 2.1 des serveurs MCP (TF-MCP-02)
-- ============================================================
-- Depend de : V13 (workspaces), V1 (users).
--
-- Objectif : connecter un serveur MCP en 1 clic via OAuth 2.1 (decouverte + Dynamic Client
-- Registration + PKCE), sans que l'utilisateur colle un token. Cette table porte l'etat qui doit
-- survivre entre le clic (start) et le retour du fournisseur (callback) : verifier PKCE, endpoints
-- decouverts, client DCR, redirect_uri, resource. Le `state` (anti-CSRF, aleatoire) resout le
-- workspace au callback (jamais un slug devinable dans l'URL), puis la ligne est supprimee.
--
-- Les secrets (code_verifier PKCE, client_secret DCR) sont chiffres au repos via
-- EncryptedStringConverter. Lignes ephemeres (expires_at = now() + ~10 min), purgees.

CREATE TABLE mcp_oauth_states (
    state           VARCHAR(64)  PRIMARY KEY,          -- token aleatoire URL-safe (anti-CSRF)
    workspace_id    BIGINT       NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id         BIGINT       REFERENCES users(id) ON DELETE SET NULL,  -- qui a initie
    connector_key   VARCHAR(64)  NOT NULL,             -- connecteur du catalogue (ex. linear)
    mcp_url         TEXT         NOT NULL,              -- serveur MCP vise (= resource RFC 8707)
    code_verifier   TEXT         NOT NULL,              -- PKCE (chiffre au repos)
    token_endpoint  TEXT         NOT NULL,              -- endpoint d'echange du code (decouvert)
    client_id       VARCHAR(255) NOT NULL,             -- client DCR (ou pre-enregistre)
    client_secret   TEXT,                               -- DCR (chiffre au repos) ; null = client public
    redirect_uri    TEXT         NOT NULL,              -- doit correspondre a l'echange
    scope           TEXT,
    issuer          TEXT,                               -- issuer du serveur d'auth (stocke sur la connexion)
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMP    NOT NULL
);

-- Purge des states expires (balayage opportuniste).
CREATE INDEX idx_mcp_oauth_states_expires_at ON mcp_oauth_states(expires_at);
