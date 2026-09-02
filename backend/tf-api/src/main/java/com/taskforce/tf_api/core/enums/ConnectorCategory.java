package com.taskforce.tf_api.core.enums;

/**
 * Catégories du catalogue d'intégrations (regroupement du « pool » d'outils branchables sur le Brain OS).
 * Le {@code label} est l'intitulé affiché (EN).
 */
public enum ConnectorCategory {
    PROJECT_MANAGEMENT("Project management"),
    DEV_CICD("Dev & CI/CD"),
    HOSTING_INFRA("Hosting & Infra"),
    DATABASE("Databases"),
    ADS("Advertising"),
    ANALYTICS("Analytics & Product"),
    PAYMENTS("Payments & Finance"),
    CRM_SALES("CRM & Sales"),
    COMMUNICATION("Communication & Email"),
    IDENTITY_AUTH("Identity & Auth"),
    SECURITY("Security & Secrets"),
    PRODUCTIVITY("Productivity & Docs"),
    DESIGN_MEDIA("Design & Media"),
    UI_COMPONENTS("UI & Components"),
    ECOMMERCE("E-commerce"),
    AUTOMATION("Automation"),
    AI_MODELS("AI Models");

    private final String label;

    ConnectorCategory(String label) {
        this.label = label;
    }

    public String getLabel() {
        return label;
    }
}
