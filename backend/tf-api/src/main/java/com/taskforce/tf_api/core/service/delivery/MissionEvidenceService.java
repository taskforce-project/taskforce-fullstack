package com.taskforce.tf_api.core.service.delivery;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.taskforce.tf_api.core.harness.evidence.CanonicalJson;
import com.taskforce.tf_api.core.harness.evidence.EvidenceChain;
import com.taskforce.tf_api.core.model.DeliveryRun;
import com.taskforce.tf_api.core.model.DeliveryRunEvidence;
import com.taskforce.tf_api.core.repository.DeliveryRunEvidenceRepository;
import com.taskforce.tf_api.core.repository.DeliveryRunRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Le dossier de preuve d'une mission (spécification de la v2, §9 ; {@code contracts/evidence/}) : un journal chaîné,
 * calculé ici, à la réception, dans l'ordre. Chaque ajout verrouille le run : deux ajouts ne se croisent jamais, et
 * le runner ne peut pas réécrire l'histoire.
 *
 * <p>Jackson 2, comme {@link EvidenceChain} : le dossier sort en texte, jamais comme arbre rendu par un contrôleur.</p>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class MissionEvidenceService {

    public static final String FORMAT = "taskforce-evidence/1";
    /** Plafond du dossier d'un run, bien au-delà de la chronologie affichée : atteint, un dernier événement le dit. */
    static final int MAX_EVENTS = 10_000;
    static final String LIMIT_REACHED = "limit.reached";

    private static final ObjectMapper JSON = new ObjectMapper();

    private final DeliveryRunEvidenceRepository repository;
    private final DeliveryRunRepository runRepository;

    /** Qui agit : {@code agent}, {@code person}, {@code rule}, {@code runner} ou {@code server}, et son identifiant. */
    public record Actor(String kind, String id) {
        public static final Actor SERVER = new Actor("server", "taskforce");
    }

    /**
     * Ajoute un événement à la suite du dossier et rend son empreinte. Le dossier plein, l'avant-dernière place reste
     * au constat {@code limit.reached} et rien d'autre n'est gardé : la troncature se lit dans le dossier.
     */
    @Transactional
    public Optional<String> append(DeliveryRun run, String type, Actor actor, Map<String, ?> data) {
        runRepository.findByIdForUpdate(run.getId());
        Optional<DeliveryRunEvidence> last = repository.findTopByRunIdOrderBySeqDesc(run.getId());
        int seq = last.map(DeliveryRunEvidence::getSeq).orElse(0) + 1;
        if (seq > MAX_EVENTS) {
            return Optional.empty();
        }
        if (seq == MAX_EVENTS && !LIMIT_REACHED.equals(type)) {
            log.warn("Run {} : dossier de preuve plein ({} événements)", run.getId(), MAX_EVENTS);
            type = LIMIT_REACHED;
            actor = Actor.SERVER;
            data = Map.of("max", MAX_EVENTS, "text", "The evidence of this mission is full: later events are not kept.");
        }
        String prev = last.map(DeliveryRunEvidence::getHash).orElse(EvidenceChain.ZERO_HASH);
        String at = EvidenceChain.AT.format(Instant.now());
        ObjectNode content = JSON.valueToTree(data);
        String hash = EvidenceChain.link(prev, EvidenceChain.event(seq, at, type, actor.kind(), actor.id(), content)).get("hash").asText();
        repository.save(DeliveryRunEvidence.builder()
            .run(run).seq(seq).at(at).type(type).actorKind(actor.kind()).actorId(actor.id())
            .data(CanonicalJson.of(content)).prev(prev).hash(hash)
            .build());
        return Optional.of(hash);
    }

    /**
     * Fin de mission : l'événement qui la clôt, puis l'empreinte racine posée sur le run, qui scelle le dossier. Rien
     * pour un run sans dossier (autres fournisseurs, runs de la v1).
     */
    @Transactional
    public void end(DeliveryRun run, DeliveryPoll poll) {
        if (repository.findTopByRunIdOrderBySeqDesc(run.getId()).isEmpty()) {
            return;
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("status", poll.status().name());
        data.put("summary", clip(poll.summary()));
        data.put("resultUrl", poll.resultUrl());
        data.put("error", clip(poll.error()));
        String root = append(run, "mission.ended", Actor.SERVER, data)
            .or(() -> repository.findTopByRunIdOrderBySeqDesc(run.getId()).map(DeliveryRunEvidence::getHash))
            .orElse(null);
        run.setEvidenceRoot(root);
    }

    private static String clip(String text) {
        return text == null || text.length() <= 2000 ? text : text.substring(0, 1997) + "...";
    }

    /** Les événements du dossier tels qu'un export les montre : avec {@code prev} et {@code hash}. */
    @Transactional(readOnly = true)
    public List<ObjectNode> events(Long runId) {
        List<ObjectNode> events = new ArrayList<>();
        for (DeliveryRunEvidence e : repository.findByRunIdOrderBySeqAsc(runId)) {
            ObjectNode node = EvidenceChain.event(e.getSeq(), e.getAt(), e.getType(), e.getActorKind(), e.getActorId(), parse(e.getData()));
            node.put("prev", e.getPrev());
            node.put("hash", e.getHash());
            events.add(node);
        }
        return events;
    }

    /** Le dossier au format {@code taskforce-evidence/1}, ou vide si la mission n'a pas d'événement (run de la v1). */
    @Transactional(readOnly = true)
    public Optional<String> dossierJson(DeliveryRun run) {
        List<ObjectNode> events = events(run.getId());
        if (events.isEmpty()) {
            return Optional.empty();
        }
        ObjectNode file = JSON.createObjectNode();
        file.put("format", FORMAT);
        file.set("mission", mission(run));
        ArrayNode list = file.putArray("events");
        events.forEach(list::add);
        file.put("root", events.getLast().get("hash").asText());
        try {
            return Optional.of(JSON.writerWithDefaultPrettyPrinter().writeValueAsString(file));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Evidence file could not be written", e);
        }
    }

    /** Le même dossier, lisible par une personne, avec le résultat du recalcul de la chaîne au moment de l'export. */
    @Transactional(readOnly = true)
    public Optional<String> dossierMarkdown(DeliveryRun run) {
        List<ObjectNode> events = events(run.getId());
        if (events.isEmpty()) {
            return Optional.empty();
        }
        ObjectNode mission = mission(run);
        int broken = EvidenceChain.firstBrokenLink(events);
        StringBuilder md = new StringBuilder();
        md.append("# Evidence of mission ").append(run.getId());
        if (!mission.path("issue").isNull()) md.append(": ").append(mission.path("issue").asText());
        md.append("\n\n");
        md.append("- Workspace: ").append(mission.path("workspace").asText()).append('\n');
        md.append("- Requested by: ").append(mission.path("requestedBy").asText()).append('\n');
        md.append("- Agent: ").append(mission.path("agent").path("kind").asText());
        if (!mission.path("agent").path("model").isNull()) md.append(", model ").append(mission.path("agent").path("model").asText());
        md.append('\n');
        md.append("- Rules: version ").append(mission.path("rules").path("version").asText())
            .append(", `").append(mission.path("rules").path("digest").asText()).append("`\n");
        md.append("- Root: `").append(events.getLast().get("hash").asText()).append("` (").append(events.size()).append(" events)\n");
        md.append("- Durations: ").append(durations(events)).append('\n');
        md.append("- Chain: ").append(broken < 0
            ? "checked when exported, every hash holds."
            : "BROKEN at event " + events.get(broken).get("seq").asInt() + ": this file was changed after it was written.").append("\n\n");
        md.append("| # | At (UTC) | Type | Actor | What |\n| --- | --- | --- | --- | --- |\n");
        for (ObjectNode e : events) {
            md.append("| ").append(e.get("seq").asInt())
                .append(" | ").append(e.get("at").asText().replace('T', ' ').replace("Z", ""))
                .append(" | ").append(e.get("type").asText())
                .append(" | ").append(cell(e.get("actor").get("kind").asText() + " " + e.get("actor").get("id").asText()))
                .append(" | ").append(cell(describe(e.get("data"))))
                .append(" |\n");
        }
        md.append("\nTo check this file without TaskForce: each `hash` is the SHA-256 of `prev`, a line feed, then the ")
            .append("canonical JSON of the event without its `hash` (contracts/README.md). The last one is the root.\n");
        return Optional.of(md.toString());
    }

    // ---------------------------------------------------------------------

    private ObjectNode mission(DeliveryRun run) {
        var issue = run.getIssue();
        var project = issue.getProject();
        ObjectNode mission = JSON.createObjectNode();
        mission.put("id", run.getId());
        mission.put("workspace", project.getWorkspace().getSlug());
        mission.put("project", project.getId());
        mission.put("issue", project.getIdentifier() + "-" + issue.getSequenceNumber());
        mission.put("requestedBy", run.getStartedBy() != null ? run.getStartedBy().getEmail() : "unknown");
        ObjectNode agent = mission.putObject("agent");
        agent.put("kind", run.getProviderKey());
        agent.putNull("version");
        agent.put("model", run.getModel());
        ObjectNode rules = mission.putObject("rules");
        rules.put("version", run.getRulesVersion());
        rules.put("digest", run.getRulesDigest());
        mission.put("runner", run.getClaimedBy());
        mission.putNull("taskforce");
        return mission;
    }

    private static JsonNode parse(String json) {
        try {
            return JSON.readTree(json);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Stored evidence is not JSON", e);
        }
    }

    /**
     * Le temps de cycle, tel que la chaîne le donne : la mission, de la réclamation à sa fin, et l'attente d'une
     * personne, de chaque demande à sa réponse (ou à son expiration).
     */
    static String durations(List<ObjectNode> events) {
        Instant start = null;
        Instant end = null;
        Map<Long, Instant> asked = new HashMap<>();
        Duration waiting = Duration.ZERO;
        int requests = 0;
        for (ObjectNode e : events) {
            Instant at = Instant.parse(e.get("at").asText());
            String type = e.get("type").asText();
            JsonNode data = e.get("data");
            if ("mission.started".equals(type)) start = at;
            if ("mission.ended".equals(type)) end = at;
            if (data.has("approval")) {
                long id = data.get("approval").asLong();
                if ("ask".equals(data.path("effect").asText())) {
                    asked.put(id, at);
                    requests++;
                } else if (asked.containsKey(id)) {
                    waiting = waiting.plus(Duration.between(asked.remove(id), at));
                }
            }
        }
        String mission = start != null && end != null ? readable(Duration.between(start, end)) : "not ended";
        return "mission " + mission + "; waiting for a person " + readable(waiting)
            + " (" + requests + (requests == 1 ? " request)" : " requests)");
    }

    private static String readable(Duration d) {
        long s = d.toSeconds();
        if (s < 60) return s + " s";
        if (s < 3600) return (s / 60) + " min " + (s % 60) + " s";
        return (s / 3600) + " h " + ((s % 3600) / 60) + " min";
    }

    /** Le contenu d'un événement en une ligne : ses champs, dans l'ordre où ils sont rangés. */
    private static String describe(JsonNode data) {
        Map<String, String> fields = new LinkedHashMap<>();
        data.properties().forEach(entry -> fields.put(entry.getKey(), entry.getValue().isTextual() ? entry.getValue().asText() : entry.getValue().toString()));
        StringBuilder out = new StringBuilder();
        fields.forEach((key, value) -> out.append(out.isEmpty() ? "" : ", ").append(key).append(": ").append(value));
        return out.length() > 300 ? out.substring(0, 297) + "..." : out.toString();
    }

    private static String cell(String text) {
        return text.replace("\\", "\\\\").replace("|", "\\|").replace("\r", " ").replace("\n", " ");
    }
}
