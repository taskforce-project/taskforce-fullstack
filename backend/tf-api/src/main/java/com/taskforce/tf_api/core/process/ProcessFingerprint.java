package com.taskforce.tf_api.core.process;

import java.util.Comparator;
import java.util.List;
import java.util.Objects;

import com.taskforce.tf_api.core.harness.evidence.CanonicalJson;
import com.taskforce.tf_api.core.harness.evidence.EvidenceChain;
import com.taskforce.tf_api.core.process.ProcessModel.AgentSettings;
import com.taskforce.tf_api.core.process.ProcessModel.Flow;
import com.taskforce.tf_api.core.process.ProcessModel.RuleRef;
import com.taskforce.tf_api.core.process.ProcessModel.Step;

/**
 * L'empreinte d'un processus (ADR-027, point 7) : {@code sha256:} et le SHA-256 du JSON canonique de son modèle
 * (contracts/README.md, règle 4), jamais du texte d'un fichier. Ce qui n'a pas d'ordre ne compte pas : les étapes et
 * les chemins se trient par identifiant, les règles et les outils aussi. Un modeleur qui réécrit le fichier, déplace un
 * élément ou ses formes ne change donc pas l'empreinte (E23) ; changer un mot, une étape ou un réglage la change. L'ordre
 * des lignes d'une liste de contrôle, des champs d'une saisie et des documents attendus, lui, compte.
 */
public final class ProcessFingerprint {

    private ProcessFingerprint() {
    }

    public static String of(ProcessModel model) {
        return EvidenceChain.sha256(CanonicalJson.of(ProcessJson.tree(canonical(model))));
    }

    /** Le modèle dans l'ordre où l'empreinte le lit. */
    static ProcessModel canonical(ProcessModel model) {
        return new ProcessModel(model.format(), model.key(), model.name(), model.description(), model.derivedFrom(),
            steps(model.steps()), flows(model.flows()));
    }

    private static List<Step> steps(List<Step> steps) {
        if (steps == null) {
            return null;
        }
        return steps.stream()
            .map(s -> new Step(s.id(), s.type(), s.name(), s.description(), s.answeredBy(), s.lock(), s.terminate(),
                s.attachedTo(), s.duration(), agent(s.agent()), s.human(), s.waitFor(), rules(s.rules()), s.documents(),
                s.issue(), steps(s.steps()), flows(s.flows())))
            .sorted(Comparator.comparing((Step s) -> Objects.toString(s.id(), "")))
            .toList();
    }

    private static List<Flow> flows(List<Flow> flows) {
        if (flows == null) {
            return null;
        }
        return flows.stream().sorted(Comparator.comparing((Flow f) -> Objects.toString(f.id(), ""))).toList();
    }

    private static List<RuleRef> rules(List<RuleRef> rules) {
        if (rules == null) {
            return null;
        }
        return rules.stream()
            .sorted(Comparator.comparing((RuleRef r) -> Objects.toString(r.ref(), ""))
                .thenComparing(r -> r.version() == null ? -1 : r.version()))
            .toList();
    }

    private static AgentSettings agent(AgentSettings agent) {
        if (agent == null || agent.tools() == null) {
            return agent;
        }
        return new AgentSettings(agent.provider(), agent.model(), agent.tools().stream().sorted().toList(),
            agent.attempts(), agent.timeout());
    }
}
