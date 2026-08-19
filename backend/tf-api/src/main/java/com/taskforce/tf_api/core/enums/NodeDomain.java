package com.taskforce.tf_api.core.enums;

/**
 * Les 16 domaines d'un Brain OS (inspirés du vault Obsidian Brain OS).
 * Le {@code code} numérique sert au tri et à l'affichage (01-projet, 02-produit…).
 */
public enum NodeDomain {
    PROJET("01"),
    PRODUIT("02"),
    ARCHITECTURE("03"),
    ENGINEERING("04"),
    API("05"),
    INFRA("06"),
    SECURITE("07"),
    OPERATIONS("08"),
    AUDITS("09"),
    RUNBOOKS("10"),
    PCA_PRA("11"),
    DECISIONS("12"),
    ROADMAP("13"),
    DESIGN("14"),
    UTILISATEUR("15"),
    HISTORIQUE("16"),
    ARCHIVE("20");

    private final String code;

    NodeDomain(String code) {
        this.code = code;
    }

    public String getCode() {
        return code;
    }
}
