package com.taskforce.tf_api.modules.harness.rules;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Paquet de règles {@code taskforce-rules/1} (contracts/rules/taskforce-rules-1.schema.json) : ce que l'agent fait
 * seul, ce qui lui est interdit, ce qui demande une décision, avec qui l'a décidé, pourquoi et quand le revoir.
 */
public record RulesBundle(
    String format,
    String workspace,
    Long project,
    int version,
    String digest,
    String issuedAt,
    List<Rule> rules
) {

    public static final String FORMAT = "taskforce-rules/1";

    public record Rule(
        String id,
        Condition when,
        @JsonProperty("class") String actionClass,
        String effect,
        String inverse,
        String owner,
        String reason,
        String review
    ) {
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
        String sensitivity
    ) {
    }
}
