package com.taskforce.tf_api.core.service.agent;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;

import com.fasterxml.jackson.databind.JsonNode;
import com.taskforce.tf_api.core.service.agent.CortexRecordService.Act;

/**
 * Ce qui entoure la question d'un cas de la banque (R204, R118) : les tours d'avant de la conversation, tels qu'ils
 * étaient, avec ce que chaque réponse a fait, et les outils connectés que la personne avait ce jour-là. Un défaut qui ne
 * se voit qu'au tour suivant (« tu l'as créé où ? », après un projet créé sur une carte), ou qu'avec les outils d'un
 * connecteur (« crée un projet dans Linear »), se rejoue ainsi : le modèle reçoit cet historique et ces outils comme dans
 * une conversation, par le même code. Vide pour un cas d'une seule question.
 */
public record ReplayContext(List<Turn> history, List<FrozenTool> external) {

    public static final ReplayContext NONE = new ReplayContext(List.of(), List.of());

    public ReplayContext {
        history = history == null ? List.of() : List.copyOf(history);
        external = external == null ? List.of() : List.copyOf(external);
    }

    /** Un cas avec ses tours d'avant, sans outil connecté. */
    public ReplayContext(List<Turn> history) {
        this(history, List.of());
    }

    /**
     * Un tour d'avant : qui parle ({@code user} ou {@code assistant}), ce qui a été écrit, et pour une réponse ce que son
     * dossier garde de ses gestes, dans l'ordre, accords et réponses donnés sur ses cartes compris.
     */
    public record Turn(String role, String content, List<Act> acts) {
        public Turn {
            acts = acts == null ? List.of() : List.copyOf(acts);
        }
    }

    /**
     * Un outil d'un serveur MCP connecté, figé dans l'ordre où le serveur le listait : le connecteur ({@code linear}), son
     * nom sur le serveur, ce qu'il dit de lui, son schéma, et sa classe selon TaskForce (une lecture, ou une écriture qui
     * demande). Au rejeu, une lecture est servie par la cassette, une écriture est proposée : rien n'est jamais envoyé.
     */
    public record FrozenTool(String connector, String name, String description, JsonNode inputSchema, boolean readOnly) {
    }

    /** Ce qui a été fait dans ces tours et reste fait, que la réponse ne peut pas nier (R204). */
    public List<ActionClaimCheck.Done> done(Function<String, String> where) {
        List<ActionClaimCheck.Done> done = new ArrayList<>();
        for (Turn turn : history) done.addAll(ThreadActs.done(turn.acts(), where));
        return done;
    }
}
