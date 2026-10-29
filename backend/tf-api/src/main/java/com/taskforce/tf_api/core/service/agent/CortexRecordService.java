package com.taskforce.tf_api.core.service.agent;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.taskforce.tf_api.core.harness.evidence.CanonicalJson;
import com.taskforce.tf_api.core.harness.evidence.EvidenceChain;
import com.taskforce.tf_api.core.model.CortexRecord;
import com.taskforce.tf_api.core.model.CortexRecordEvent;
import com.taskforce.tf_api.core.repository.CortexRecordEventRepository;
import com.taskforce.tf_api.core.repository.CortexRecordRepository;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;
import com.taskforce.tf_api.shared.util.LogSafe;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Le dossier d'une réponse de Cortex (V107) : la mission de l'agent interne, chaînée comme celle d'un agent délégué
 * (contracts/evidence). Il s'ouvre au premier outil que Cortex veut lancer, garde chaque demande, chaque décision des
 * règles et chaque résultat, puis l'accord de la personne quand une action lui a été proposée.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class CortexRecordService {

    /** Qui agit dans un dossier de Cortex, dans les mots du contrat de preuve. */
    public record Actor(String kind, String id) {
        public static final Actor CORTEX = new Actor("agent", "cortex");
        public static final Actor SERVER = new Actor("server", "taskforce");

        /** La règle qui a décidé ; sans règle, l'action était inconnue, donc demandée. */
        public static Actor rule(String ruleId) {
            return new Actor("rule", ruleId == null ? "no-rule" : ruleId);
        }

        /** La personne, par un identifiant qui ne dit pas qui elle est. */
        public static Actor person(Long userId) {
            return new Actor("person", "user-" + userId);
        }
    }

    /** Une réponse fait cinq tours d'outils au plus, l'accord en ajoute peu : au-delà, rien n'est plus gardé. */
    static final int MAX_EVENTS = 200;
    /** Ce qu'un événement garde d'un texte (question, arguments, résultat) : de quoi relire, pas tout recopier. */
    static final int MAX_TEXT = 2000;

    private static final ObjectMapper JSON = new ObjectMapper();

    private final CortexRecordRepository records;
    private final CortexRecordEventRepository eventRepository;

    /**
     * Ouvre le dossier d'une réponse, sur la question telle que la personne l'a posée, et ce qui y a répondu : le
     * modèle, le tier, les notes servies. Une valeur nulle de l'origine n'entre pas au dossier.
     */
    @Transactional
    public UUID open(AgentContext ctx, String question, Map<String, ?> origin) {
        UUID id = UUID.randomUUID();
        records.save(CortexRecord.builder().id(id).workspaceId(ctx.workspaceId()).userId(ctx.userId())
            .createdAt(LocalDateTime.now()).build());
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("agent", "internal");
        data.put("question", shorten(question));
        if (origin != null) {
            origin.forEach((key, value) -> { if (value != null) data.putIfAbsent(key, value); });
        }
        append(id, "mission.started", Actor.person(ctx.userId()), data);
        return id;
    }

    /** Ajoute un événement à la suite du dossier et rend son empreinte ; vide quand le dossier est plein. */
    @Transactional
    public Optional<String> append(UUID recordId, String type, Actor actor, Map<String, ?> data) {
        CortexRecord record = records.findByIdForUpdate(recordId)
            .orElseThrow(() -> new ResourceNotFoundException("Cortex record not found"));
        Optional<CortexRecordEvent> last = eventRepository.findTopByRecordIdOrderBySeqDesc(recordId);
        int seq = last.map(CortexRecordEvent::getSeq).orElse(0) + 1;
        if (seq > MAX_EVENTS) {
            log.warn("Dossier de Cortex {} plein ({} événements)", LogSafe.of(recordId), MAX_EVENTS);
            return Optional.empty();
        }
        String prev = last.map(CortexRecordEvent::getHash).orElse(EvidenceChain.ZERO_HASH);
        String at = EvidenceChain.AT.format(Instant.now());
        ObjectNode content = JSON.valueToTree(data);
        String hash = EvidenceChain.link(prev, EvidenceChain.event(seq, at, type, actor.kind(), actor.id(), content))
            .get("hash").asText();
        eventRepository.save(CortexRecordEvent.builder()
            .recordId(recordId).seq(seq).at(at).type(type).actorKind(actor.kind()).actorId(actor.id())
            .data(CanonicalJson.of(content)).prev(prev).hash(hash)
            .build());
        record.setRoot(hash);
        return Optional.of(hash);
    }

    /**
     * Garde l'accord de la personne si le dossier attend encore cette action : une proposition de Cortex (un résultat
     * {@code pending}) que personne n'a accordée. Un accord ne vaut donc jamais pour une action que Cortex n'a pas
     * proposée, ni deux fois pour la même : le verrou du dossier sépare deux clics. Faux sinon, ou si le dossier est plein.
     */
    @Transactional
    public boolean approve(UUID recordId, String tool, Long userId, String arguments) {
        records.findByIdForUpdate(recordId).orElseThrow(() -> new ResourceNotFoundException("Cortex record not found"));
        int waiting = 0;
        for (CortexRecordEvent event : eventRepository.findByRecordIdOrderBySeqAsc(recordId)) {
            JsonNode data = parse(event.getData());
            if (!tool.equals(data.path("tool").asText())) continue;
            if ("action.result".equals(event.getType()) && "pending".equals(data.path("status").asText())) waiting++;
            if ("human.decision".equals(event.getType())) waiting--;
        }
        return waiting > 0 && append(recordId, "human.decision", Actor.person(userId),
            Map.of("tool", tool, "decision", "approved", "arguments", shorten(arguments))).isPresent();
    }

    /** Vrai si le dossier est celui de cette personne, dans cet espace : un autre ne se prolonge pas. */
    @Transactional(readOnly = true)
    public boolean owns(UUID recordId, AgentContext ctx) {
        return records.findByIdAndWorkspaceIdAndUserId(recordId, ctx.workspaceId(), ctx.userId()).isPresent();
    }

    /** Les événements du dossier, chaînés, tels qu'un export les relit et les vérifie. */
    @Transactional(readOnly = true)
    public List<ObjectNode> events(UUID recordId) {
        return eventRepository.findByRecordIdOrderBySeqAsc(recordId).stream().map(e -> {
            ObjectNode event = EvidenceChain.event(e.getSeq(), e.getAt(), e.getType(), e.getActorKind(), e.getActorId(),
                parse(e.getData()));
            event.put("prev", e.getPrev());
            event.put("hash", e.getHash());
            return event;
        }).toList();
    }

    /** Un texte gardé au dossier, coupé à {@link #MAX_TEXT} caractères. */
    static String shorten(String text) {
        if (text == null) return "";
        return text.length() <= MAX_TEXT ? text : text.substring(0, MAX_TEXT) + "...";
    }

    private static ObjectNode parse(String json) {
        try {
            return (ObjectNode) JSON.readTree(json);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Unreadable Cortex record event", e);
        }
    }
}
