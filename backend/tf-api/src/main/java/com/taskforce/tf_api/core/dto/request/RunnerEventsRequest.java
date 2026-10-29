package com.taskforce.tf_api.core.dto.request;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Lot d'événements d'un run, posté par le runner local : la chronologie en direct (OSS-5.3) et le dossier de preuve
 * (spécification de la v2, §9).
 *
 * @param events 50 au plus par appel ; le texte est tronqué à 2000 caractères au stockage
 */
public record RunnerEventsRequest(
    @NotEmpty @Size(max = 50)
    List<@Valid Event> events
) {

    /**
     * @param kind   {@code start}, {@code text}, {@code tool}, {@code error}, {@code denied} (l'agent), {@code decision}
     *               (une règle, au seul dossier de preuve), {@code exit} (une sortie faite ou non par le runner),
     *               {@code limit} (le plafond d'événements du runner atteint) ou {@code test} (les tests du projet
     *               lancés par le runner après l'agent, S1)
     * @param effect pour {@code decision}, l'effet de la règle ; pour {@code exit}, ce qui s'est passé : {@code allow}
     *               si la sortie est faite, {@code deny} sinon
     * @param rule   pour {@code decision}, la règle qui l'a donnée ; absente quand aucune ne s'applique
     */
    public record Event(
        @NotBlank
        @Pattern(regexp = "start|text|tool|error|denied|decision|exit|limit|test",
            message = "kind must be start, text, tool, error, denied, decision, exit, limit or test")
        String kind,

        @Size(max = 120)
        String tool,

        @NotNull @Size(max = 4000)
        String text,

        @Pattern(regexp = "allow|ask|deny", message = "effect must be allow, ask or deny")
        String effect,

        @Size(max = 80)
        String rule
    ) {

        /** Un événement de la chronologie, sans décision. */
        public Event(String kind, String tool, String text) {
            this(kind, tool, text, null, null);
        }
    }
}
