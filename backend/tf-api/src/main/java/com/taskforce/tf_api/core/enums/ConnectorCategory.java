package com.taskforce.tf_api.core.enums;

/**
 * Catégories du catalogue d'intégrations, alignées sur le Registre des outils (séance n°22, décision de la
 * Présidence : « les separer en categorie c'est top »). Le catalogue se range par ce qu'on fait, pas par le nom des
 * éditeurs ; l'ordre de l'énumération est celui de l'écran. Le {@code label} est l'intitulé affiché.
 * {@link #MONITORING}, {@link #DATA} et {@link #SECURITY} viennent des domaines du répertoire des connecteurs de
 * Claude repris au registre le 12/11/2026 (R153 : « on fait la même »).
 * {@link #CUSTOM_MCP} regroupe les serveurs MCP ajoutés à la main par la personne ou l'espace.
 */
public enum ConnectorCategory {
    FILES_STORAGE("Files and storage"),
    KNOWLEDGE("Knowledge"),
    TICKETS_PROJECTS("Tickets and projects"),
    CHAT_MAIL("Chat, mail and meetings"),
    CODE("Code and deploy"),
    MONITORING("Monitoring"),
    DATA("Data and analytics"),
    SALES("Sales and marketing"),
    SUPPORT("Support"),
    FINANCE_HR("Finance and HR"),
    DESIGN("Design"),
    SECURITY("Security and compliance"),
    OTHER("Other"),
    CUSTOM_MCP("Your MCP servers");

    private final String label;

    ConnectorCategory(String label) {
        this.label = label;
    }

    public String getLabel() {
        return label;
    }
}
