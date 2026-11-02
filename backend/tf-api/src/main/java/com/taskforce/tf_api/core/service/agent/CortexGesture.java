package com.taskforce.tf_api.core.service.agent;

import java.util.Map;

/**
 * Un geste du MCP TaskForce que Cortex fait dans la conversation, au nom de la personne (ADR-024, TF-J1-5) : en plus du
 * texte que lit le modèle, l'issue que la conversation montre sous le geste (sa carte, sa mission), et de quoi le
 * défaire d'un geste (R77). Le dossier de la réponse garde de quoi le défaire ; la réponse rend l'issue.
 */
public interface CortexGesture extends AgentTool {

    /** Fait le geste au nom de la personne du contexte. Une erreur de l'agent remonte en exception, comme un outil. */
    Done perform(Map<String, Object> args, AgentContext ctx);

    @Override
    default String execute(Map<String, Object> args, AgentContext ctx) {
        return perform(args, ctx).text();
    }

    /**
     * Ce que montre la carte d'un geste qui se demande, avant que la personne décide (l'issue qu'on supprimerait, ce qui
     * partirait avec elle) : une lecture, rien n'est changé. Null par défaut : la demande suffit.
     */
    default Done preview(Map<String, Object> args, AgentContext ctx) {
        return null;
    }

    /**
     * @param text   ce que lit le modèle, et que la carte de l'outil montre
     * @param target l'issue que touche le geste ({@code issueId}, {@code projectId}, {@code key}, {@code title}, et
     *               {@code runId} de sa mission), que la conversation montre ; null sinon
     * @param undo   de quoi le défaire, gardé au dossier de la réponse ; null quand rien n'est à défaire
     */
    record Done(String text, Map<String, Object> target, Map<String, Object> undo) {}
}
