package com.taskforce.tf_api.core.service.agent;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;

import com.fasterxml.jackson.databind.JsonNode;
import com.taskforce.tf_api.core.service.agent.CortexRecordService.Act;

/**
 * Ce qui entoure la question d'un cas de la banque (R204, R118) : les tours d'avant de la conversation, tels qu'ils
 * étaient, avec ce que chaque réponse a fait ; les outils connectés que la personne avait ce jour-là ; et les issues dont
 * la question parle, telles que TaskForce les a lues. Un défaut qui ne se voit qu'au tour suivant (« tu l'as créé où ? »,
 * après un projet créé sur une carte), qu'avec les outils d'un connecteur (« crée un projet dans Linear »), ou qu'avec
 * une issue jointe (« T'en ai a ou sur cette tache ? »), se rejoue ainsi : le modèle reçoit tout cela comme dans une
 * conversation, par le même code. Vide pour un cas d'une seule question.
 */
public record ReplayContext(List<Turn> history, List<FrozenTool> external, List<FrozenIssue> attached) {

    public static final ReplayContext NONE = new ReplayContext(List.of(), List.of(), List.of());

    public ReplayContext {
        history = history == null ? List.of() : List.copyOf(history);
        external = external == null ? List.of() : List.copyOf(external);
        attached = attached == null ? List.of() : List.copyOf(attached);
    }

    /** Un cas avec ses tours d'avant, sans outil connecté ni issue jointe. */
    public ReplayContext(List<Turn> history) {
        this(history, List.of(), List.of());
    }

    /**
     * Un tour d'avant : qui parle ({@code user} ou {@code assistant}), ce qui a été écrit ; pour une réponse, ce que son
     * dossier garde de ses gestes, dans l'ordre, accords et réponses donnés sur ses cartes compris ; pour une demande, les
     * clés des issues dont elle parlait.
     */
    public record Turn(String role, String content, List<Act> acts, List<String> subjects) {
        public Turn {
            acts = acts == null ? List.of() : List.copyOf(acts);
            subjects = subjects == null ? List.of() : List.copyOf(subjects);
        }

        /** Un tour sans issue jointe. */
        public Turn(String role, String content, List<Act> acts) {
            this(role, content, acts, List.of());
        }
    }

    /**
     * Un outil d'un serveur MCP connecté, figé dans l'ordre où le serveur le listait : le connecteur ({@code linear}), son
     * nom sur le serveur, ce qu'il dit de lui, son schéma, et sa classe selon TaskForce (une lecture, ou une écriture qui
     * demande). Au rejeu, une lecture est servie par la cassette, une écriture est proposée : rien n'est jamais envoyé.
     */
    public record FrozenTool(String connector, String name, String description, JsonNode inputSchema, boolean readOnly) {
    }

    /**
     * Une issue dont parle la question, telle que TaskForce l'a lue ({@code material}, son bloc sans titre) : jointe à la
     * question, ou reprise d'une demande d'avant ({@code earlier}) quand la question la désigne sans la joindre.
     */
    public record FrozenIssue(String key, String material, boolean earlier) {
    }

    /**
     * Ce qui a été fait dans ces tours et reste fait, que la réponse ne peut pas nier (R204) : les gestes de la dernière
     * réponse, et ceux des plus anciennes, qui ne comptent que pour la phrase qui les désigne (relecture R159).
     */
    public List<ActionClaimCheck.Done> done(Function<String, String> where) {
        int last = -1;
        for (int i = 0; i < history.size(); i++) {
            if ("assistant".equals(history.get(i).role())) last = i;
        }
        List<ActionClaimCheck.Done> done = new ArrayList<>();
        for (int i = 0; i < history.size(); i++) done.addAll(ThreadActs.done(history.get(i).acts(), where, i == last));
        return done;
    }
}
