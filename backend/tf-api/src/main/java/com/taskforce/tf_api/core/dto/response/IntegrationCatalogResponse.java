package com.taskforce.tf_api.core.dto.response;

import java.util.List;

/**
 * Le catalogue d'intégrations d'un workspace, tel qu'une personne le voit, groupé par catégorie, avec pour chaque
 * outil l'état de la connexion qu'elle utilise (la sienne, ou celle que l'espace partage).
 */
public record IntegrationCatalogResponse(
    int total,
    int connected,
    List<CategoryGroup> categories
) {
    public record CategoryGroup(String category, String label, List<ConnectorView> tools) {}

    /** L'étape de l'administrateur d'un outil : la phrase à lui envoyer, le lien de sa page. */
    public record AdminStep(String text, String link, boolean required) {}

    /** La clé guidée d'un outil : où la créer. */
    public record KeyGuide(String hint, String link) {}

    /**
     * Un outil du catalogue enrichi de l'état de la connexion de la personne (séance n°22, R154).
     *
     * @param state       {@code CONNECTED}, {@code NEEDS_RECONNECT}, {@code WAITING_FOR_ADMIN} ou {@code NOT_CONNECTED}
     * @param accountLabel le compte chez l'éditeur (« Connected as ... ») ; nul quand l'éditeur ne le dit pas
     * @param scope       {@code PERSONAL} (sa connexion) ou {@code WORKSPACE} (partagée) ; nul sans connexion
     * @param connection  le chemin de connexion du préréglage ; nul pour une native
     * @param companyApp  l'application de l'entreprise est saisie pour cet outil
     * @param writeChoice l'éditeur sépare la lecture de l'écriture : la personne peut n'accorder que la lecture
     * @param blocked     pourquoi l'éditeur ferme la porte aujourd'hui ; nul sinon
     * @param tried       l'outil a été essayé de bout en bout (faux sur une instance d'essai qui montre les autres)
     */
    public record ConnectorView(
        String key,
        String name,
        String category,
        String authType,
        boolean connected,
        List<ConnectorField> fields,
        List<String> capabilities,
        String description,
        String docsUrl,
        String setupHint,
        String websiteUrl,
        /** URL du serveur MCP hébergé officiel, préremplie (modifiable) dans le dialogue de connexion. */
        String mcpSuggestedUrl,
        String state,
        String accountLabel,
        String scope,
        String connection,
        AdminStep admin,
        KeyGuide apiKey,
        boolean companyApp,
        boolean writeChoice,
        String blocked,
        boolean tried
    ) {
        /** Une fiche sans connexion MCP (natives, essais) : non connectée, sans chemin. */
        public ConnectorView(String key, String name, String category, String authType, boolean connected,
                             List<ConnectorField> fields, List<String> capabilities, String description,
                             String docsUrl, String setupHint, String websiteUrl, String mcpSuggestedUrl) {
            this(key, name, category, authType, connected, fields, capabilities, description, docsUrl, setupHint,
                websiteUrl, mcpSuggestedUrl, connected ? "CONNECTED" : "NOT_CONNECTED", null, null, null, null, null,
                false, false, null, true);
        }
    }
}
