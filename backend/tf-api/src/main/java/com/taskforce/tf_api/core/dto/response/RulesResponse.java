package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * Les règles de l'espace telles que les écrans les lisent (R157, R94) : des données que l'écran dit en phrases. Aucun
 * texte d'interface ici, hors de ce que la personne a écrit elle-même et des raisons des règles de TaskForce.
 */
public final class RulesResponse {

    private RulesResponse() {
    }

    /**
     * Tout ce que la personne peut lire des règles de l'espace.
     *
     * @param floor     les règles du socle, par identifiant (l'écran a leur phrase)
     * @param defaults  la table de TaskForce
     * @param layers    les couches de l'entreprise que la personne voit, chacune dans sa version en vigueur
     * @param versions  toutes les versions écrites, la plus récente d'abord, avec leur auteur, leur date et leur empreinte
     * @param members   les personnes qu'une règle peut désigner, ou viser
     * @param projects  les projets que la personne voit, pour la couche d'un projet
     * @param canEdit   la personne peut écrire les couches de l'organisation, des rôles et des personnes
     */
    public record RulesOverview(
        int version,
        String digest,
        List<String> floor,
        List<DefaultRuleView> defaults,
        List<RuleLayerView> layers,
        List<RuleVersion> versions,
        List<RulePerson> members,
        List<RuleProject> projects,
        boolean canEdit
    ) {}

    /** Une règle de la table de TaskForce. */
    public record DefaultRuleView(String id, String action, Map<String, Object> when, String effect, String reason) {}

    /**
     * Une couche de l'entreprise : sa portée, ce qu'elle vise, et sa version en vigueur.
     *
     * @param name le nom de ce qu'elle vise (le projet, la personne), quand il y en a un
     */
    public record RuleLayerView(String scope, String ref, String name, int version, String author, LocalDateTime at,
                        String digest, boolean canEdit, List<RuleStatement> rules) {}

    /**
     * Une règle de l'entreprise telle que la personne l'a écrite : sa phrase, et ce que TaskForce en a fait (une à
     * quelques règles du contrat), avec qui accorde, qui l'a écrite et quand, et ses cas.
     */
    public record RuleStatement(String group, String text, String effect, List<RulePart> parts, List<RuleApprover> approvers,
                            int signatures, boolean separate, String addedBy, LocalDateTime addedAt,
                            List<RuleCaseView> cases) {}

    /** Une règle du contrat, telle que le moteur la juge. */
    public record RulePart(String id, String action, Map<String, Object> when, String effect, Map<String, Object> raw) {}

    /** Une personne désignée : sa référence, son nom quand c'est une personne, son métier. */
    public record RuleApprover(String ref, String name, String detail) {}

    /**
     * Un cas, rejoué par le moteur : ses faits, ce qu'il attend, ce que le moteur en a décidé, et si c'est pareil.
     *
     * @param text   la phrase du modèle qui le décrit ; null pour un cas que TaskForce a écrit d'après la règle
     * @param source {@code taskforce} ou {@code model}
     */
    public record RuleCaseView(String text, Map<String, String> facts, String expect, List<RuleApprover> expectApprovers,
                           RuleDecision decision, boolean passed, String source) {}

    /**
     * Une décision du moteur, dite en données : l'effet, la règle qui l'a prise (sa phrase quand elle en a une, sinon
     * sa raison), et ce qu'un accord doit réunir.
     *
     * @param layer la couche de la règle ; {@code taskforce} pour la table, {@code floor} pour le socle, null sans règle
     */
    public record RuleDecision(String effect, String rule, String ruleText, String layer, String layerName,
                           List<List<RuleApprover>> approvers, int signatures, boolean separate) {}

    /** Une version écrite d'une couche. */
    public record RuleVersion(int version, String scope, String ref, String name, String author, LocalDateTime at,
                          String digest, int rules) {}

    public record RulePerson(Long id, String name, String jobTitle, String role) {}

    public record RuleProject(Long id, String name, boolean canEdit) {}

    /** Un refus de la validation : son code, que l'écran dit en mots, et ce qu'il nomme. */
    public record RuleProblem(String code, String detail) {}

    /**
     * Une règle en mots, traduite et vérifiée : la traduction, ses cas rejoués, ce qui l'empêche d'entrer. Elle entre
     * quand {@code passed} est vrai.
     *
     * @param approverNeeded les mots de la règle qui nomment qui accorde, quand TaskForce n'a trouvé personne : l'écran
     *                       le demande à la personne
     * @param unclear        ce que la règle demande et que les conditions ne savent pas dire
     * @param broken         les cas d'autres règles de l'espace qu'elle changerait (R98 : rejoués à chaque changement)
     */
    public record RuleDraft(String text, String scope, String ref, List<Map<String, Object>> rules,
                        List<Map<String, Object>> modelCases, List<RuleCaseView> cases, List<RuleCaseView> broken,
                        List<RuleProblem> problems, String approverNeeded, String unclear, boolean passed) {}

    /** « What would happen? » : l'action telle que TaskForce l'a lue, et ce que ses règles en décideraient. */
    public record RuleCheck(Map<String, String> facts, RuleDecision decision, String unclear) {}
}
