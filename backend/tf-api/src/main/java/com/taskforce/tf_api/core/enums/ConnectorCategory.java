package com.taskforce.tf_api.core.enums;

/**
 * Catégories du catalogue d'intégrations, alignées sur le Registre des outils (séance n°22, décision de la
 * Présidence : « les separer en categorie c'est top »). Le catalogue se range par ce qu'on fait, pas par le nom des
 * éditeurs ; l'ordre de l'énumération est celui de l'écran. Le {@code label} est l'intitulé affiché.
 * {@link #CUSTOM_MCP} regroupe les serveurs MCP ajoutés à la main par la personne ou l'espace.
 */
public enum ConnectorCategory {
    FILES_STORAGE("Files and storage"),
    KNOWLEDGE("Knowledge"),
    TICKETS_PROJECTS("Tickets and projects"),
    CHAT_MAIL("Chat and mail"),
    CODE("Code"),
    SALES("Sales"),
    SUPPORT("Support"),
    FINANCE_HR("Finance and HR"),
    DESIGN("Design"),
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
