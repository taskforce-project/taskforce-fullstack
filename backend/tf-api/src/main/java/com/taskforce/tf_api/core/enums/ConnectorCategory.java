package com.taskforce.tf_api.core.enums;

/**
 * Catégories du catalogue d'intégrations (regroupement du « pool » d'outils branchables sur le Brain OS).
 * Le {@code label} est l'intitulé affiché (FR).
 */
public enum ConnectorCategory {
    PROJECT_MANAGEMENT("Gestion de projet"),
    DEV_CICD("Dev & CI/CD"),
    HOSTING_INFRA("Hébergement & Infra"),
    DATABASE("Bases de données"),
    ADS("Publicité"),
    ANALYTICS("Analytics & Produit"),
    PAYMENTS("Paiements & Finance"),
    CRM_SALES("CRM & Ventes"),
    COMMUNICATION("Communication & Email"),
    IDENTITY_AUTH("Identité & Auth"),
    SECURITY("Sécurité & Secrets"),
    PRODUCTIVITY("Productivité & Docs"),
    DESIGN_MEDIA("Design & Média"),
    ECOMMERCE("E-commerce"),
    AUTOMATION("Automatisation"),
    AI_MODELS("Modèles IA");

    private final String label;

    ConnectorCategory(String label) {
        this.label = label;
    }

    public String getLabel() {
        return label;
    }
}
