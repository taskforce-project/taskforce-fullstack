package com.taskforce.tf_api.core.enums;

/**
 * Catégories du catalogue d'intégrations. Le {@code label} est l'intitulé affiché.
 */
public enum ConnectorCategory {
    PROJECT_MANAGEMENT("Project management"),
    DEV_CICD("Dev & CI/CD"),
    HOSTING_INFRA("Hosting & Infra"),
    DATABASE("Databases"),
    PAYMENTS("Payments & Finance"),
    CRM_SALES("CRM & Sales"),
    COMMUNICATION("Communication"),
    PRODUCTIVITY("Productivity & Docs"),
    DESIGN_MEDIA("Design & Media"),
    AUTOMATION("Automation");

    private final String label;

    ConnectorCategory(String label) {
        this.label = label;
    }

    public String getLabel() {
        return label;
    }
}
