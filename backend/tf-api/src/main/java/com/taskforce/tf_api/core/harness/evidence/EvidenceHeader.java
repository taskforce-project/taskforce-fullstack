package com.taskforce.tf_api.core.harness.evidence;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * L'en-tête d'un dossier exporté ({@code mission}), tiré de la chaîne elle-même (contracts/README.md, « The header comes
 * from the chain ») : l'événement {@code mission.started} porte la mission, l'espace, le projet, l'issue, la personne qui
 * a délégué, l'agent, les règles et le runner ; la dernière note {@code agent} (le modèle réellement lancé, la version de
 * l'agent) les complète. Un en-tête changé après coup ne correspond plus à sa chaîne : le vérificateur le refait de la
 * même façon et compare. Écrit une seconde fois en TypeScript pour le runner ({@code taskforce-runner/src/harness/dossier.ts}) ;
 * l'exemple de {@code contracts/evidence/} tient les deux ensemble.
 */
public final class EvidenceHeader {

    /** Les champs de l'en-tête, dans l'ordre du schéma. */
    public static final List<String> FIELDS = List.of("id", "workspace", "project", "issue", "requestedBy", "agent", "rules",
        "runner", "runnerFacts", "taskforce");

    private EvidenceHeader() {
    }

    /**
     * L'en-tête tel que la chaîne le donne, et les champs qu'elle couvre. Un dossier ouvert avant que la chaîne porte tout
     * l'en-tête (avant la 1.18) n'en couvre qu'une partie : le reste vient d'ailleurs, et le vérificateur le dit.
     */
    public record Projection(ObjectNode header, Set<String> covered) {
    }

    public static Projection of(List<? extends JsonNode> events) {
        ObjectNode header = JsonNodeFactory.instance.objectNode();
        Set<String> covered = new LinkedHashSet<>();
        JsonNode started = null;
        JsonNode agentNote = null;
        for (JsonNode event : events) {
            String type = event.path("type").asText("");
            if (started == null && "mission.started".equals(type)) {
                started = event.path("data");
            }
            if ("note".equals(type) && "agent".equals(event.path("data").path("kind").asText(""))) {
                agentNote = event.path("data");
            }
        }
        if (started == null) {
            return new Projection(header, covered);
        }
        copy(started, "mission", header, "id", covered);
        copy(started, "workspace", header, "workspace", covered);
        copy(started, "project", header, "project", covered);
        copy(started, "issue", header, "issue", covered);
        copy(started, "requestedBy", header, "requestedBy", covered);
        if (started.path("agent").isObject()) {
            ObjectNode agent = header.putObject("agent");
            agent.set("kind", orNull(started.path("agent").get("kind")));
            JsonNode model = agentNote != null && agentNote.hasNonNull("model") ? agentNote.get("model") : started.path("agent").get("model");
            agent.set("model", orNull(model));
            agent.set("version", orNull(agentNote == null ? null : agentNote.get("version")));
            covered.add("agent");
        }
        if (started.path("rules").isObject()) {
            ObjectNode rules = header.putObject("rules");
            rules.set("version", orNull(started.path("rules").get("version")));
            rules.set("digest", orNull(started.path("rules").get("digest")));
            covered.add("rules");
        }
        copy(started, "runner", header, "runner", covered);
        // D'où viennent les faits du runner (R159, M5) : du poste de l'agent. Absent d'une mission sans runner.
        copy(started, "runnerFacts", header, "runnerFacts", covered);
        copy(started, "taskforce", header, "taskforce", covered);
        return new Projection(header, covered);
    }

    private static void copy(JsonNode from, String field, ObjectNode to, String as, Set<String> covered) {
        if (from.has(field)) {
            to.set(as, orNull(from.get(field)));
            covered.add(as);
        }
    }

    private static JsonNode orNull(JsonNode node) {
        return node == null || node.isMissingNode() ? JsonNodeFactory.instance.nullNode() : node.deepCopy();
    }
}
