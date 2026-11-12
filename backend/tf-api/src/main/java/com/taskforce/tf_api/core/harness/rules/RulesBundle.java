package com.taskforce.tf_api.core.harness.rules;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Paquet de règles {@code taskforce-rules/1} (contracts/rules/taskforce-rules-1.schema.json) : ce que l'agent fait
 * seul, ce qui lui est interdit, ce qui demande une décision, avec qui l'a décidé, pourquoi et quand le revoir.
 *
 * <p>Les règles sans {@code layer} sont la table de TaskForce ; celles qui en ont un viennent des couches de
 * l'entreprise (R157) : l'organisation, le projet, le processus, le rôle ou la personne. {@code layers} dit quelle
 * version de chaque couche le paquet porte, pour le dossier. Le socle, lui, n'est pas dans le paquet : il est dans le
 * moteur ({@link RulesFloor}).</p>
 */
public record RulesBundle(
    String format,
    String workspace,
    Long project,
    int version,
    String digest,
    String issuedAt,
    List<Rule> rules,
    String process,
    List<Layer> layers
) {

    public static final String FORMAT = "taskforce-rules/1";

    @JsonCreator
    public RulesBundle {
    }

    /** Un paquet sans couche de l'entreprise : la table de TaskForce, ou un paquet d'avant les couches. */
    public RulesBundle(String format, String workspace, Long project, int version, String digest, String issuedAt,
                       List<Rule> rules) {
        this(format, workspace, project, version, digest, issuedAt, rules, null, null);
    }

    /** Une couche de l'entreprise que porte le paquet : sa portée, ce qu'elle vise, sa version et son empreinte. */
    public record Layer(String scope, String ref, int version, String digest) {
    }

    public record Rule(
        String id,
        Condition when,
        @JsonProperty("class") String actionClass,
        String effect,
        String inverse,
        String owner,
        String reason,
        String review,
        String layer,
        String text,
        Require require
    ) {

        @JsonCreator
        public Rule {
        }

        /** Une règle de la table de TaskForce, sans couche ni obligation. */
        public Rule(String id, Condition when, String actionClass, String effect, String inverse, String owner,
                    String reason, String review) {
            this(id, when, actionClass, effect, inverse, owner, reason, review, null, null, null);
        }
    }

    /**
     * Ce qu'une règle qui demande ajoute (R98) : qui peut accorder ({@code person:<id>}, {@code role:owner},
     * {@code role:admin}, {@code project-lead} ; un seul suffit), combien de personnes distinctes signent, et si celle qui
     * a préparé l'action est exclue des signataires. Nuls : personne de désigné, une signature, pas de séparation.
     */
    public record Require(List<String> approvers, Integer signatures, Boolean separate) {
    }

    /** Conditions d'une règle : toutes doivent tenir. Un champ nul ne pose pas de condition. */
    public record Condition(
        String action,
        String tool,
        String command,
        String path,
        String branch,
        String repoVisibility,
        String server,
        String sensitivity,
        String actor,
        Threshold over
    ) {

        @JsonCreator
        public Condition {
        }

        public Condition(String action, String tool, String command, String path, String branch, String repoVisibility,
                         String server, String sensitivity) {
            this(action, tool, command, path, branch, repoVisibility, server, sensitivity, null, null);
        }
    }

    /** Un seuil sur un fait chiffré (« au-delà de 5 000 ») : la condition tient quand le fait est un nombre plus grand. */
    public record Threshold(String fact, long value) {
    }
}
