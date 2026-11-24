package com.taskforce.tf_api.core.service.delivery;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.taskforce.tf_api.core.dto.request.RunnerEventsRequest;
import com.taskforce.tf_api.core.dto.request.RunnerResultRequest;
import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.harness.evidence.CanonicalJson;
import com.taskforce.tf_api.core.harness.evidence.EvidenceChain;
import com.taskforce.tf_api.core.harness.evidence.EvidenceHeader;
import com.taskforce.tf_api.core.harness.evidence.EvidenceIntake;
import com.taskforce.tf_api.core.harness.evidence.EvidenceSeal;
import com.taskforce.tf_api.core.harness.evidence.EvidenceSigner;
import com.taskforce.tf_api.core.harness.rules.HarnessRulesService;
import com.taskforce.tf_api.core.harness.rules.RulesBundle;
import com.taskforce.tf_api.core.harness.rules.RulesDigest;
import com.taskforce.tf_api.core.model.DeliveryRun;
import com.taskforce.tf_api.core.model.DeliveryRunEvidence;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.IssueChecklistItem;
import com.taskforce.tf_api.core.model.MissionDossier;
import com.taskforce.tf_api.core.model.MissionDossierSeal;
import com.taskforce.tf_api.core.model.MissionDossierText;
import com.taskforce.tf_api.core.model.MissionPerson;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.DeliveryRunEvidenceRepository;
import com.taskforce.tf_api.core.repository.DeliveryRunRepository;
import com.taskforce.tf_api.core.repository.HarnessRuleSetRepository;
import com.taskforce.tf_api.core.repository.IssueChecklistItemRepository;
import com.taskforce.tf_api.core.repository.MissionDossierRepository;
import com.taskforce.tf_api.core.repository.MissionDossierSealRepository;
import com.taskforce.tf_api.core.repository.MissionDossierTextRepository;
import com.taskforce.tf_api.core.repository.MissionPersonRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Le dossier de preuve d'une mission (spécification de la v2, §9 ; {@code contracts/evidence/} ; TF-J2-7) : un journal
 * chaîné, calculé ici, à la réception, dans l'ordre. Chaque ajout verrouille la mission et son dossier : deux ajouts ne
 * se croisent jamais, et le runner ne peut pas réécrire l'histoire.
 *
 * <p>Ce que le dossier garde (R198, R198 amendée, R212) : la demande telle qu'elle était au départ, le modèle réellement
 * lancé, la règle de chaque action et sa version, chaque accord sur l'action exacte, les vérifications, les gestes de la
 * personne sur le résultat, et le résultat. Il pend à sa propre ligne ({@link MissionDossier}) : supprimer l'issue ne
 * l'efface pas, et la base refuse de le modifier (V135). Un texte sensible (la demande, ce que l'agent raconte, son
 * résumé) n'y entre que par son empreinte ; il vit à côté, et s'efface sans casser la chaîne. Un lot d'événements perdu
 * en route laisse une marque. Chaque fin, et chaque geste après elle, pose un sceau : l'en-tête et la tête de la chaîne,
 * signés ({@link EvidenceSeal}). L'en-tête d'un export se tire de la chaîne ({@link EvidenceHeader}).</p>
 *
 * <p>Jackson 2, comme {@link EvidenceChain} : le dossier sort en texte, jamais comme arbre rendu par un contrôleur.</p>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class MissionEvidenceService {

    public static final String FORMAT = EvidenceSeal.FORMAT;
    /**
     * Plafond de ce que la mission fait naître, bien au-delà de la chronologie affichée et loin d'une mission ordinaire (25
     * événements pour l'exemple de contracts/evidence ; 60 tours de l'agent par défaut) : ce qui vient du poste de l'agent,
     * et ce que le serveur écrit à cause de lui (un trou, une demande d'accord, son expiration). Atteint, la mission
     * s'arrête : un événement le dit, et rien de ce qu'elle envoie ensuite n'est gardé.
     */
    static final int MAX_EVENTS = 10_000;
    /**
     * Au-delà du plafond, une réserve pour ce que seuls le serveur et les personnes écrivent, et rien d'autre (R159, M4 ;
     * second tour, N2) : la fin, les gestes des personnes, le témoin, la purge, le sceau tardif et le plafond lui-même.
     * Rien de ce que l'agent fait ne la remplit : la décision de fin et le témoin y ont toujours leur place.
     */
    static final int RESERVE = 1_000;
    /** Ce que la réserve garde, quand le serveur ou une personne l'écrit : la fin, les gestes, le plafond. */
    private static final Set<String> RESERVED_TYPES = Set.of("mission.ended", "human.decision", "limit.reached");
    /** Les notes du serveur que la réserve garde : les personnes, la liste de la fin, le témoin, la purge, le sceau tardif. */
    private static final Set<String> RESERVED_NOTES = Set.of("person", "checklist", "witness", "erased", "late-seal");
    /** Les faits que le runner rapporte viennent du poste de l'agent, quelle que soit la garde de la clé (R159, M5). */
    static final String AGENT_MACHINE = "agent-machine";
    static final String LIMIT_REACHED = "limit.reached";
    /** Ce qu'un événement garde d'un texte en clair (une commande, une erreur). */
    static final int MAX_TEXT = 2_000;
    /**
     * Ce qu'il garde d'un fait jugé : ce que l'entrée admet. Au-delà, le runner le coupe d'une coupe marquée, et le
     * vérificateur ne rejuge pas une décision prise sur un fait coupé (R159, second tour, N2).
     */
    static final int MAX_FACT = 4_000;
    /** Ce que le dossier garde du résumé de l'agent, à côté de la chaîne. */
    static final int MAX_SUMMARY = 8_000;

    private static final ObjectMapper JSON = new ObjectMapper();

    /** Type de l'événement du dossier pour chaque sorte d'événement du runner. */
    private static final Map<String, String> RUNNER_TYPE = Map.ofEntries(
        Map.entry("start", "note"), Map.entry("text", "note"), Map.entry("tool", "action.requested"),
        Map.entry("error", "action.result"), Map.entry("denied", "action.decided"), Map.entry("decision", "action.decided"),
        Map.entry("exit", "exit.result"), Map.entry("limit", "limit.reached"), Map.entry("test", "test.result"),
        Map.entry("brief", "note"), Map.entry("agent", "note"));

    private final DeliveryRunEvidenceRepository repository;
    private final DeliveryRunRepository runRepository;
    private final MissionDossierRepository dossiers;
    private final MissionDossierSealRepository seals;
    private final MissionDossierTextRepository texts;
    private final HarnessRuleSetRepository ruleSets;
    private final IssueChecklistItemRepository checklist;
    private final MissionPersonRepository people;
    private final EvidenceSigner signer;
    private final ApplicationEventPublisher publisher;
    /** Les personnes que le paquet de règles nomme, pour la copie qu'en garde le dossier (R159, second tour, N3). */
    private final UserRepository users;

    private static final SecureRandom RANDOM = new SecureRandom();

    /** Qui agit : {@code agent}, {@code person}, {@code rule}, {@code runner} ou {@code server}, et son identifiant. */
    public record Actor(String kind, String id) {
        public static final Actor SERVER = new Actor("server", "taskforce");
    }

    // --------------------------------------------------------------------- ouvrir

    /**
     * Ouvre le dossier d'une mission qui part : sa ligne, avec le paquet de règles tel qu'il part avec elle, puis
     * {@code mission.started}, qui porte tout l'en-tête et la demande telle qu'elle est au départ (R198) : le titre et la
     * description par leur empreinte (leur texte à côté), qui a écrit la demande et quand, d'où vient la mission, la
     * personne qui a délégué et qui en répond, l'agent et le modèle choisis, les règles avec l'auteur de chaque couche.
     *
     * @param extras ce qu'une reprise ajoute (la mission qu'elle continue, ses commentaires), ou vide
     */
    @Transactional
    public void open(DeliveryRun run, RulesBundle rules, String runner, Map<String, Object> extras) {
        Issue issue = run.getIssue();
        Project project = issue.getProject();
        // Les personnes entrent par leur identifiant opaque dans cet espace ; leur courriel et leur nom, à côté, dans des
        // notes qui suivent l'ouverture (R159, M6 ; second tour, L-a). La copie du paquet de règles aussi (N3).
        Long workspaceId = project.getWorkspace().getId();
        List<User> named = new ArrayList<>();
        String delegator = personIdOf(workspaceId, run.getStartedBy(), named);
        String reporter = personIdOf(workspaceId, issue.getReporter(), named);
        ObjectNode copy = rules == null ? null : recordCopy(rules, workspaceId, named);
        String bundle = copy == null ? null : json(copy);
        MissionDossier dossier = dossiers.findById(run.getId()).orElse(null);
        if (dossier == null) {
            // Écrite tout de suite : les textes et les événements, insérés aussitôt, la désignent.
            dossiers.saveAndFlush(newDossier(run, bundle));
        } else if (dossier.getRulesBundle() == null && bundle != null) {
            dossier.setRulesBundle(bundle);
            dossiers.saveAndFlush(dossier);
        }
        Map<String, Object> request = new LinkedHashMap<>();
        request.put("title", ref(run.getId(), "title", issue.getTitle()));
        request.put("description", ref(run.getId(), "description", blankToNull(issue.getDescription())));
        request.put("reporter", reporter);
        request.put("createdAt", utc(issue.getCreatedAt()));
        request.put("importedFrom", issue.getImportedFrom());
        Map<String, Object> origin = new LinkedHashMap<>();
        origin.put("channel", run.getOrigin());
        origin.put("run", run.getOriginRunId());
        Map<String, Object> agent = new LinkedHashMap<>();
        agent.put("kind", run.getProviderKey());
        agent.put("model", run.getModel());
        Map<String, Object> started = new LinkedHashMap<>();
        started.put("mission", run.getId());
        started.put("workspace", project.getWorkspace().getSlug());
        started.put("project", project.getId());
        started.put("issue", key(issue));
        started.put("request", request);
        started.put("requestedBy", delegator);
        // Seule la personne qui a délégué tranche le résultat : c'est elle qui répond de la mission.
        started.put("accountable", delegator);
        started.put("delegatedAt", utc(run.getCreatedAt()));
        started.put("origin", origin);
        started.put("agent", agent);
        started.put("rules", copy == null ? null : rulesData(copy, workspaceId, named));
        started.put("runner", runner);
        if (runner != null) {
            // Ce que le runner rapportera (ses tests, l'agent et son modèle, les numéros de ses événements) vient du poste de
            // l'agent : le sceau dit où vit la clé, pas ce que valent ces faits (R159, M5).
            started.put("runnerFacts", AGENT_MACHINE);
        }
        started.put("taskforce", null);
        if (extras != null) {
            started.putAll(extras);
        }
        append(run, "mission.started", Actor.SERVER, started);
        for (User user : named) {
            personNote(run.getId(), workspaceId, user);
        }
    }

    /** L'identifiant opaque d'une personne dans cet espace, gardée pour sa note ; null sans personne. */
    private String personIdOf(Long workspaceId, User user, List<User> named) {
        if (user == null) return null;
        if (named.stream().noneMatch(u -> Objects.equals(u.getId(), user.getId()))) named.add(user);
        return personId(workspaceId, user);
    }

    /**
     * Les règles de la mission telles que le dossier les garde : version, empreinte, et chaque couche avec son auteur, lues
     * dans la copie du paquet qu'il garde ({@link #recordCopy}).
     */
    private Map<String, Object> rulesData(ObjectNode copy, Long workspaceId, List<User> named) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("version", copy.path("version").asInt());
        data.put("digest", copy.path("digest").asText(null));
        List<Map<String, Object>> layers = new ArrayList<>();
        for (JsonNode layer : copy.path("layers")) {
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("scope", layer.path("scope").asText(null));
            entry.put("ref", layer.path("ref").asText(null));
            entry.put("version", layer.path("version").asInt());
            entry.put("digest", layer.path("digest").asText(null));
            entry.put("author", ruleSets.findByWorkspaceIdAndVersion(workspaceId, layer.path("version").asInt())
                .map(set -> personIdOf(workspaceId, set.getCreatedBy(), named)).orElse(null));
            layers.add(entry);
        }
        data.put("layers", layers);
        return data;
    }

    /** Une personne que les règles nomment et que TaskForce ne connaît plus : le dossier ne la nomme pas. */
    static final String UNKNOWN_PERSON = MissionPerson.PREFIX + "unknown";

    /**
     * La copie du paquet de règles que le dossier garde (R159, second tour, N3) : chaque personne qu'il nomme l'est par
     * son identifiant opaque dans l'espace, son courriel et son nom à côté de la chaîne, effaçables comme les autres.
     * Le paquet nomme déjà ainsi le propriétaire de chaque règle ({@code HarnessRulesService}) : la copie le présente,
     * et nomme de même ce que les règles vivantes désignent par le compte, les approbateurs ({@code person:<id>}) et la
     * couche d'une personne. Sans eux, la copie est le paquet que le runner a reçu, membre pour membre, et son
     * empreinte celle qu'il a vérifiée ; avec eux, l'empreinte du paquet se calcule sur cette copie, et celle de chaque
     * couche sur ses règles nommées de même : aucune ne confirme un courriel ou un compte une fois effacé. Chaque règle
     * reste celle d'une personne nommée tant que son nom n'est pas effacé ; effacé, le dossier dit quand (la note
     * {@code erased}).
     */
    ObjectNode recordCopy(RulesBundle rules, Long workspaceId, List<User> named) {
        ObjectNode copy = JSON.valueToTree(rules);
        // La table de TaskForce nomme trente fois le même propriétaire : chaque identifiant n'est cherché qu'une fois.
        Set<String> presented = new HashSet<>();
        for (JsonNode rule : copy.path("rules")) {
            if (rule instanceof ObjectNode object) pseudonymize(object, workspaceId, named, presented);
        }
        for (JsonNode layer : copy.path("layers")) {
            if (!(layer instanceof ObjectNode object)) continue;
            if ("person".equals(object.path("scope").asText()) && object.hasNonNull("ref")) {
                object.put("ref", userById(object.get("ref").asText()).map(user -> personIdOf(workspaceId, user, named))
                    .orElse(UNKNOWN_PERSON));
            }
            // Ses règles telles que la couche les garde, nommées comme le dossier les nomme ; ces personnes-là n'y sont pas
            // présentées : la copie ne les nomme que par cette empreinte.
            int version = object.path("version").asInt();
            ruleSets.findByWorkspaceIdAndVersion(workspaceId, version).ifPresent(set -> {
                JsonNode stored = JSON.valueToTree(set.getRules() == null ? List.of() : set.getRules());
                for (JsonNode rule : stored) {
                    if (rule instanceof ObjectNode one) pseudonymize(one, workspaceId, new ArrayList<>(), null);
                }
                object.put("digest", RulesDigest.of(stored));
            });
        }
        copy.put("digest", RulesDigest.of(copy));
        return copy;
    }

    /**
     * Une règle nommée comme le dossier nomme les personnes : son propriétaire et ses approbateurs par leur
     * identifiant. Le propriétaire se lit comme le paquet le lit : son identifiant reste, présenté par sa note quand
     * {@code presented} n'est pas nul ; le repère {@code workspace-owner} reste ; un courriel d'avant la 1.18 devient
     * l'identifiant de son compte ; tout autre texte ne nomme personne.
     */
    private void pseudonymize(ObjectNode rule, Long workspaceId, List<User> named, Set<String> presented) {
        String owner = rule.path("owner").asText(null);
        if (owner != null && owner.startsWith(MissionPerson.PREFIX)) {
            if (presented != null && presented.add(owner)) {
                people.findByWorkspaceIdAndPerson(workspaceId, owner)
                    .flatMap(person -> users.findById(person.getUserId()))
                    .ifPresent(user -> personIdOf(workspaceId, user, named));
            }
        } else if (owner != null && owner.contains("@")) {
            rule.put("owner", users.findByEmail(owner.strip()).map(user -> personIdOf(workspaceId, user, named)).orElse(UNKNOWN_PERSON));
        } else if (!HarnessRulesService.OWNER_PLACEHOLDER.equals(owner)) {
            rule.put("owner", UNKNOWN_PERSON);
        }
        JsonNode approvers = rule.path("require").path("approvers");
        if (approvers.isArray() && rule.get("require") instanceof ObjectNode require) {
            ArrayNode mapped = JSON.createArrayNode();
            approvers.forEach(ref -> mapped.add(approverId(ref.asText(), workspaceId, named)));
            require.set("approvers", mapped);
        }
    }

    /** {@code person:<id>} des règles, par l'identifiant opaque de la personne ; un rôle reste un rôle. */
    private String approverId(String ref, Long workspaceId, List<User> named) {
        if (!ref.startsWith("person:")) return ref;
        return userById(ref.substring("person:".length())).map(user -> personIdOf(workspaceId, user, named)).orElse(UNKNOWN_PERSON);
    }

    private Optional<User> userById(String id) {
        try {
            return users.findById(Long.valueOf(id.strip()));
        } catch (NumberFormatException e) {
            return Optional.empty();
        }
    }

    /**
     * Ceux qui peuvent accorder une demande, tels que la chaîne les nomme (R159, second tour, N3) : chaque personne par son
     * identifiant opaque, présentée dans le dossier ; {@code role:} et {@code project-lead} restent ce qu'ils sont.
     */
    @Transactional
    public List<List<String>> approvers(DeliveryRun run, List<List<String>> approvers) {
        if (approvers == null) return List.of();
        List<List<String>> out = new ArrayList<>();
        for (List<String> set : approvers) {
            List<String> mapped = new ArrayList<>();
            for (String ref : set == null ? List.<String>of() : set) {
                mapped.add(ref != null && ref.startsWith("person:")
                    ? userById(ref.substring("person:".length())).map(user -> person(run, user).id()).orElse(UNKNOWN_PERSON)
                    : ref);
            }
            out.add(mapped);
        }
        return out;
    }

    // --------------------------------------------------------------------- ajouter

    /**
     * Ajoute un événement à la suite du dossier et rend son empreinte, ou rien quand il n'est pas gardé. Le plafond
     * atteint, le constat {@code limit.reached} prend la place de l'événement, la mission s'arrête, et seule la réserve
     * garde encore ce qu'elle garde : l'arrêt se lit dans le dossier.
     */
    @Transactional
    public Optional<String> append(DeliveryRun run, String type, Actor actor, Map<String, ?> data) {
        runRepository.findByIdForUpdate(run.getId());
        ensureDossier(run);
        return appendTo(run.getId(), type, actor, data);
    }

    /** L'ajout lui-même, sur le dossier verrouillé : la mission peut ne plus exister. */
    private Optional<String> appendTo(Long runId, String type, Actor actor, Map<String, ?> data) {
        dossiers.findByIdForUpdate(runId);
        Optional<DeliveryRunEvidence> last = repository.findTopByRunIdOrderBySeqDesc(runId);
        int seq = last.map(DeliveryRunEvidence::getSeq).orElse(0) + 1;
        if (seq > MAX_EVENTS + RESERVE) {
            log.warn("Run {} : réserve du dossier de preuve épuisée, {} non gardé", runId, type);
            return Optional.empty();
        }
        // Le plafond borne tout ce que la mission fait naître, ce que l'agent envoie comme ce que le serveur écrit à cause de
        // lui ; la réserve ne garde que ce qu'elle garde (R159, M4 ; second tour, N2).
        if (seq >= MAX_EVENTS && !reserved(type, actor, data)) {
            if (repository.existsByRunIdAndTypeAndActorKind(runId, LIMIT_REACHED, Actor.SERVER.kind())) {
                return Optional.empty();
            }
            boolean working = runRepository.findById(runId)
                .map(r -> r.getStatus() == DeliveryRunStatus.RUNNING || r.getStatus() == DeliveryRunStatus.QUEUED).orElse(false);
            log.warn("Run {} : dossier de preuve plein ({} événements){}", runId, MAX_EVENTS, working ? " : la mission s'arrête" : "");
            type = LIMIT_REACHED;
            actor = Actor.SERVER;
            data = Map.of("max", MAX_EVENTS, "stopped", working, "text", "The evidence of this mission reached its cap of "
                + MAX_EVENTS + " events" + (working ? ": TaskForce stopped the mission, so that nothing goes on without being "
                + "written" : "") + ". Later events are not kept, except the end, the people's gestures and the witness.");
            // Rien ne continue sans être écrit : la mission s'arrête par le chemin de toujours, une fois ce constat validé.
            if (working) publisher.publishEvent(new EvidenceCapped(runId));
        }
        // Les textes que l'événement nomme pour la première fois se gardent avec lui, jamais sans lui (R159, second tour, N1).
        keepTexts(data);
        String prev = last.map(DeliveryRunEvidence::getHash).orElse(EvidenceChain.ZERO_HASH);
        String at = EvidenceChain.AT.format(Instant.now());
        // Ce qui entre dans l'empreinte est du I-JSON : la RFC 8785 et tout outil JCS y retrouvent la même chaîne.
        JsonNode content = EvidenceIntake.of(JSON.valueToTree(data == null ? Map.of() : data));
        String actorId = EvidenceIntake.clip(EvidenceIntake.text(actor.id()), 255);
        String hash = EvidenceChain.link(prev, EvidenceChain.event(seq, at, type, actor.kind(), actorId, content)).get("hash").asText();
        repository.save(DeliveryRunEvidence.builder()
            .runId(runId).seq(seq).at(at).type(type).actorKind(actor.kind()).actorId(actorId)
            .data(CanonicalJson.of(content)).prev(prev).hash(hash)
            .build());
        return Optional.of(hash);
    }

    /**
     * Ce que la réserve garde au-delà du plafond, et rien d'autre (R159, second tour, N2) : ce que le serveur ou une personne
     * écrit pour la fin de la mission, un geste d'une personne, le plafond lui-même, et les notes des personnes, de la liste
     * de la fin, du témoin, de la purge et du sceau tardif. Le trou d'un runner perdu, dit à la fin ({@link #lost}), sans
     * fin connue. Rien de ce que l'agent ou le runner envoie, quel que soit le nom qu'ils lui donnent.
     */
    static boolean reserved(String type, Actor actor, Map<String, ?> data) {
        if (!Actor.SERVER.kind().equals(actor.kind()) && !"person".equals(actor.kind())) {
            return false;
        }
        if (RESERVED_TYPES.contains(type)) {
            return true;
        }
        if (!"note".equals(type) || data == null) {
            return false;
        }
        Object kind = data.get("kind");
        if ("gap".equals(kind)) {
            return data.containsKey("to") && data.get("to") == null;
        }
        return kind instanceof String name && RESERVED_NOTES.contains(name);
    }

    /**
     * Un événement du runner (TF-J2-7) : numéroté chez lui, il dit s'il en manque. Un numéro déjà reçu (un lot renvoyé
     * après une réponse perdue) n'est gardé ni au dossier ni à la chronologie ; un numéro qui saute laisse d'abord au
     * dossier la marque des événements qui ne sont jamais arrivés. Rend faux pour un doublon.
     */
    @Transactional
    public boolean runnerEvent(DeliveryRun run, RunnerEventsRequest.Event event) {
        ensureDossier(run);
        Integer n = event.n();
        if (n != null) {
            int last = run.getEvidenceRunnerSeq();
            if (n <= last) {
                return false;
            }
            if (n > last + 1) {
                gap(run, last + 1, n - 1);
            }
            run.setEvidenceRunnerSeq(n);
        }
        append(run, RUNNER_TYPE.getOrDefault(event.kind(), "note"), actorOf(run, event),
            dataOf(run.getId(), event, event.test() == null ? null : testCommandOf(run)));
        return true;
    }

    /** Ce que le runner dit à la fin : combien d'événements il a numérotés, la session brute de l'agent, son dernier commit. */
    @Transactional
    public void runnerReport(DeliveryRun run, RunnerResultRequest result) {
        if (repository.findTopByRunIdOrderBySeqDesc(run.getId()).isEmpty()) {
            return;
        }
        Integer sent = result.events();
        int received = run.getEvidenceRunnerSeq();
        if (sent != null && sent > received) {
            gap(run, received + 1, sent);
            run.setEvidenceRunnerSeq(sent);
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("kind", "runner");
        data.put("sent", sent);
        data.put("received", received);
        if (result.session() != null) {
            Map<String, Object> session = new LinkedHashMap<>();
            session.put("id", result.session().id());
            session.put("sha256", result.session().sha256());
            session.put("bytes", result.session().bytes());
            session.put("kept", "runner");
            data.put("session", session);
        }
        data.put("head", result.head());
        append(run, "note", runnerActor(run), data);
    }

    /**
     * Le runner s'est tu (R159, L6) : ce qu'il a peut-être envoyé après son dernier événement reçu n'est jamais arrivé, et
     * il ne dira pas combien. La marque le dit, sans fin connue ({@code to} nul).
     */
    private void lost(DeliveryRun run) {
        int last = run.getEvidenceRunnerSeq();
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("kind", "gap");
        data.put("from", last + 1);
        data.put("to", null);
        data.put("text", last == 0
            ? "The runner stopped answering before its first event: whatever it did, if anything, never arrived."
            : "The runner stopped answering after its event " + last + ": any event after it never arrived.");
        append(run, "note", Actor.SERVER, data);
    }

    /** La marque d'un trou : les numéros du runner qui ne sont jamais arrivés. */
    private void gap(DeliveryRun run, int from, int to) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("kind", "gap");
        data.put("from", from);
        data.put("to", to);
        data.put("text", to == from
            ? "Event " + from + " from the runner never arrived."
            : "Events " + from + " to " + to + " from the runner never arrived.");
        log.warn("Run {} : événements {} à {} du runner jamais reçus", run.getId(), from, to);
        append(run, "note", Actor.SERVER, data);
    }

    /** Qui agit : la règle pour ses décisions, le runner pour les sorties, les tests, le brief et le plafond, l'agent pour le reste. */
    private static Actor actorOf(DeliveryRun run, RunnerEventsRequest.Event event) {
        return switch (event.kind()) {
            case "decision" -> new Actor("rule", event.rule() == null || event.rule().isBlank() ? "none" : event.rule().strip());
            case "exit", "limit", "test", "brief" -> runnerActor(run);
            default -> new Actor("agent", run.getProviderKey());
        };
    }

    /**
     * Ce que {@code definitionChanged} porte quand la commande de test du projet, dans TaskForce, n'est plus celle que le
     * runner a lancée : le réglage a changé pendant la mission (R159, second tour, L-b).
     */
    static final String TEST_SETTING = "taskforce:test-command";

    /** Des chemins tels que le runner les envoie, nettoyés et bornés. */
    private static List<String> paths(List<String> paths) {
        return paths == null ? List.of() : paths.stream().filter(p -> p != null && !p.isBlank())
            .map(p -> EvidenceIntake.clip(p.strip(), 300)).toList();
    }

    /** La commande de test du projet de la mission, telle que TaskForce la garde aujourd'hui ; null sans projet. */
    private static String testCommandOf(DeliveryRun run) {
        Issue issue = run.getIssue();
        Project project = issue == null ? null : issue.getProject();
        return project == null ? null : project.getTestCommand();
    }

    /**
     * Ce que le dossier garde d'un événement du runner. Ce que l'agent raconte, et le brief, n'y entrent que par leur
     * empreinte ; une décision garde les faits jugés et l'empreinte de l'action exacte ; les tests, leur résultat et
     * l'empreinte de leur sortie.
     */
    private Map<String, Object> dataOf(Long runId, RunnerEventsRequest.Event event, String testCommand) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("kind", event.kind());
        switch (event.kind()) {
            case "text" -> data.put("text", ref(runId, "text", event.text()));
            case "brief" -> data.put("brief", ref(runId, "brief", event.body() != null ? event.body() : event.text()));
            case "agent" -> {
                RunnerEventsRequest.Agent agent = event.agent();
                data.put("version", agent == null ? null : blankToNull(agent.version()));
                data.put("model", agent == null ? null : blankToNull(agent.model()));
                data.put("session", agent == null ? null : blankToNull(agent.session()));
                data.put("provider", agent == null ? null : blankToNull(agent.provider()));
                // Le modèle de la configuration, et ceux que les réponses ont nommés (R159, L5) ; absents d'un runner plus ancien.
                if (agent != null && agent.configured() != null) data.put("configured", blankToNull(agent.configured()));
                if (agent != null && agent.served() != null) {
                    data.put("served", agent.served().stream().filter(m -> m != null && !m.isBlank())
                        .map(m -> EvidenceIntake.clip(m.strip(), 120)).toList());
                }
                // D'où le runner a lu le fournisseur : la configuration du lancement (R159, second tour, L-c).
                if (agent != null && agent.providerFrom() != null) data.put("providerFrom", blankToNull(agent.providerFrom()));
                // Anthropic ne donne pas d'empreinte du modèle servi : la version datée du modèle en tient lieu.
                data.put("fingerprint", null);
                data.put("text", EvidenceIntake.clip(event.text(), MAX_TEXT));
            }
            default -> {
                data.put("tool", blankToNull(event.tool()));
                data.put("text", EvidenceIntake.clip(event.text() == null ? "" : event.text().strip(), MAX_TEXT));
            }
        }
        if (event.effect() != null) data.put("effect", event.effect());
        // La règle d'une sortie (git push, la pull request) : celle d'une décision est son acteur.
        if (event.rule() != null && !event.rule().isBlank() && !"decision".equals(event.kind())) data.put("rule", event.rule().strip());
        if ("denied".equals(event.kind())) data.put("effect", "deny");
        if ("error".equals(event.kind())) data.put("ok", false);
        if (event.facts() != null && !event.facts().isEmpty()) data.put("facts", facts(event.facts()));
        if (event.input() != null) data.put("input", event.input());
        if (event.written() != null) data.put("written", written(event.written()));
        if (event.test() != null) {
            RunnerEventsRequest.Test test = event.test();
            data.put("command", EvidenceIntake.clip(test.command(), 500));
            // Aucune commande de test pour le projet : rien n'a été testé, et la page le dit (R212, rubrique 5).
            data.put("configured", !Boolean.FALSE.equals(test.configured()));
            data.put("ran", test.ran());
            data.put("passed", test.passed());
            data.put("passedCount", test.passedCount());
            data.put("total", test.total());
            if (test.output() != null) {
                Map<String, Object> output = new LinkedHashMap<>();
                output.put("sha256", test.output());
                output.put("bytes", test.outputBytes());
                output.put("kept", "runner");
                data.put("output", output);
            }
            // La branche a changé ce qui dit comment ses tests tournent : le résultat ne vaut que pour sa version (R159, M5). Le
            // réglage de test du projet dans TaskForce aussi : changé pendant la mission, il ne nomme plus la commande lancée
            // (second tour, L-b).
            List<String> changed = new ArrayList<>(paths(test.definitionChanged()));
            if (testCommand != null && !testCommand.strip().equals(test.command() == null ? "" : test.command().strip())) {
                changed.add(TEST_SETTING);
            }
            if (!changed.isEmpty()) data.put("definitionChanged", changed);
            // La liste que le runner a regardée : « aucun de ces fichiers n'a changé », pas « les tests sont les mêmes ».
            if (test.definitions() != null && !test.definitions().isEmpty()) data.put("definitions", paths(test.definitions()));
        }
        return data;
    }

    /** Les faits jugés, bornés : de quoi rejuger l'action avec le paquet exporté. */
    static List<Map<String, String>> facts(List<Map<String, String>> facts) {
        List<Map<String, String>> out = new ArrayList<>();
        for (Map<String, String> part : facts) {
            Map<String, String> clean = new LinkedHashMap<>();
            if (part != null) {
                part.forEach((k, v) -> {
                    if (k != null && v != null) clean.put(k, EvidenceIntake.clip(v, MAX_FACT));
                });
            }
            out.add(clean);
        }
        return out;
    }

    static Map<String, Object> written(RunnerEventsRequest.Written written) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("path", written.path());
        data.put("sha256", written.sha256());
        data.put("bytes", written.bytes());
        return data;
    }

    /**
     * Un texte gardé à côté de la chaîne : la chaîne n'en porte que l'empreinte et la longueur. Un texte vide ou absent
     * n'a pas de référence.
     */
    Map<String, Object> ref(Long runId, String kind, String text) {
        return ref(runId, kind, text, null);
    }

    /** Un texte gardé à côté de la chaîne d'une mission, dont le dossier s'ouvre au besoin. */
    @Transactional
    public Map<String, Object> text(DeliveryRun run, String kind, String text) {
        ensureDossier(run);
        return ref(run.getId(), kind, text);
    }

    /**
     * Un texte gardé à côté de la chaîne, son empreinte salée (R159, M6) : le SHA-256 d'un sel tiré pour lui (32 chiffres
     * hexadécimaux) suivi du texte. Le sel s'efface avec le texte : l'empreinte restée ne confirme plus une supposition
     * sur un texte court. Le même texte, déjà gardé dans ce dossier, garde son sel et son empreinte. {@code person} : la
     * personne que ce texte décrit, pour l'effacer avec son compte ; le sien ne se partage pas avec une autre personne
     * de même nom, qui ne s'effacerait pas avec lui.
     */
    Map<String, Object> ref(Long runId, String kind, String text, String person) {
        if (text == null) {
            return null;
        }
        String clean = EvidenceIntake.text(text);
        int chars = clean.codePointCount(0, clean.length());
        String kept = person != null ? null
            : texts.findFirstByRunIdAndKindAndBody(runId, kind, clean).map(MissionDossierText::getHash).orElse(null);
        if (kept != null) {
            Map<String, Object> ref = new LinkedHashMap<>();
            ref.put("sha256", kept);
            ref.put("chars", chars);
            return ref;
        }
        String salt = salt();
        return new Pending(MissionDossierText.builder().runId(runId).hash(EvidenceChain.sha256(salt + clean)).kind(kind).salt(salt)
            .body(clean).person(person).build(), chars);
    }

    /**
     * La référence d'un texte que la chaîne va nommer, et le texte, pas encore gardé (R159, second tour, N1) : l'événement
     * porte la référence ({@code sha256}, {@code chars}), et le texte n'est gardé qu'avec lui. Un événement que le plafond
     * écarte ne laisse ainsi aucun texte à côté de la chaîne, qu'un vérificateur dirait ajouté après coup.
     */
    static final class Pending extends LinkedHashMap<String, Object> {
        private static final long serialVersionUID = 1L;
        private final transient MissionDossierText text;

        Pending(MissionDossierText text, int chars) {
            this.text = text;
            put("sha256", text.getHash());
            put("chars", chars);
        }
    }

    /** Garde les textes que ces données nomment pour la première fois, où qu'elles les portent. */
    private void keepTexts(Object value) {
        if (value instanceof Pending pending) {
            texts.save(pending.text);
        } else if (value instanceof Map<?, ?> map) {
            map.values().forEach(this::keepTexts);
        } else if (value instanceof Collection<?> list) {
            list.forEach(this::keepTexts);
        }
    }

    /** Un sel neuf : 128 bits, en 32 chiffres hexadécimaux. */
    private static String salt() {
        byte[] bytes = new byte[16];
        RANDOM.nextBytes(bytes);
        return HexFormat.of().formatHex(bytes);
    }

    // --------------------------------------------------------------------- les personnes

    /**
     * L'identifiant opaque d'une personne dans les dossiers d'un espace (R159, M6) : {@code who:} et 32 chiffres
     * hexadécimaux tirés la première fois, jamais son courriel. Un par espace (second tour, L-a) : rien ne relie les
     * dossiers d'une même personne d'un espace à l'autre. Null sans personne.
     */
    String personId(Long workspaceId, User user) {
        if (user == null || user.getId() == null || workspaceId == null) {
            return null;
        }
        return people.findByWorkspaceIdAndUserId(workspaceId, user.getId()).map(MissionPerson::getPerson)
            .orElseGet(() -> people.saveAndFlush(MissionPerson.draw(workspaceId, user.getId())).getPerson());
    }

    /** L'espace d'un dossier : celui dont ses personnes portent l'identifiant. */
    private Long workspaceOf(Long runId) {
        return dossiers.findById(runId).map(MissionDossier::getWorkspace).map(workspace -> workspace.getId()).orElse(null);
    }

    /**
     * La personne qui agit, telle que la chaîne la nomme : son identifiant opaque ; la première fois dans ce dossier, une
     * note dit son courriel et son nom, gardés à côté de la chaîne et effaçables.
     */
    @Transactional
    public Actor person(DeliveryRun run, User user) {
        if (user == null) {
            return new Actor("person", "unknown");
        }
        // La mission d'abord, puis son dossier : l'ordre de chaque ajout, sans quoi deux ajouts s'attendraient l'un l'autre.
        runRepository.findByIdForUpdate(run.getId());
        ensureDossier(run);
        Long workspaceId = workspaceOf(run.getId());
        personNote(run.getId(), workspaceId, user);
        return new Actor("person", personId(workspaceId, user));
    }

    /** La note qui présente une personne dans ce dossier, une fois : son identifiant, son courriel et son nom à côté. */
    private void personNote(Long runId, Long workspaceId, User user) {
        String id = personId(workspaceId, user);
        if (id == null || texts.existsByRunIdAndPersonAndKind(runId, id, "email")) {
            return;
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("kind", "person");
        data.put("person", id);
        data.put("email", ref(runId, "email", blankToNull(user.getEmail()), id));
        data.put("name", ref(runId, "name", blankToNull(user.getDisplayName()), id));
        appendTo(runId, "note", Actor.SERVER, data);
    }

    /**
     * Le compte d'une personne est purgé (GdprService) : ce que les dossiers gardent d'elle s'efface, son courriel et son
     * nom, avec leur sel ; chaque dossier touché le dit à la suite de sa chaîne et se scelle de nouveau. Ses identifiants
     * opaques, un par espace, restent dans les chaînes, et plus rien ne les relie à elle. Rend le nombre de dossiers touchés.
     */
    @Transactional
    public int forgetPerson(Long userId) {
        List<MissionPerson> mappings = userId == null ? List.of() : people.findByUserId(userId);
        Map<Long, List<String>> byDossier = new LinkedHashMap<>();
        Map<Long, String> personOf = new HashMap<>();
        for (MissionPerson mapping : mappings) {
            for (MissionDossierText text : texts.findByPersonAndBodyIsNotNull(mapping.getPerson())) {
                text.setBody(null);
                text.setSalt(null);
                text.setErasedAt(LocalDateTime.now());
                texts.save(text);
                byDossier.computeIfAbsent(text.getRunId(), id -> new ArrayList<>()).add(text.getHash());
                personOf.put(text.getRunId(), mapping.getPerson());
            }
        }
        byDossier.forEach((runId, hashes) -> {
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("kind", "erased");
            data.put("person", personOf.get(runId));
            data.put("texts", hashes);
            data.put("reason", "account-deleted");
            appendToDossier(runId, "note", Actor.SERVER, data);
        });
        people.deleteAll(mappings);
        int legacy = forgetInLegacyChains(userId);
        log.info("Compte {} oublié des dossiers : {} dossier(s) touché(s), dont {} d'avant la 1.18", userId, byDossier.size() + legacy, legacy);
        return byDossier.size() + legacy;
    }

    /**
     * Une chaîne écrite avant la 1.18 nomme les personnes par leur courriel (R159, second tour, N4) : celui qui a délégué,
     * à qui l'on a demandé, l'acteur de chaque geste. Ces événements ne changent pas sans casser la chaîne. À la purge, chaque
     * dossier ancien qui nomme ce courriel le dit à la suite de sa chaîne, dans une note du serveur qui ne nomme personne : la
     * date, et que le courriel reste dans ces événements. Puis un sceau tardif le couvre. TaskForce masque ces courriels
     * quand il montre le dossier ({@link #dossierMarkdown}, la page), et n'en ouvre le JSON qu'aux responsables de l'espace.
     */
    private int forgetInLegacyChains(Long userId) {
        String email = userId == null ? null : users.findById(userId).map(User::getEmail).map(String::strip)
            .filter(e -> !e.isEmpty()).orElse(null);
        if (email == null) {
            return 0;
        }
        String pattern = "%\"" + email.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "\"%";
        int touched = 0;
        for (Long runId : repository.findLegacyRunsNaming(email, pattern)) {
            DeliveryRun run = runRepository.findByIdForUpdate(runId).orElse(null);
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("kind", "erased");
            data.put("legacy", true);
            data.put("events", repository.findSeqsNaming(runId, email, pattern));
            data.put("reason", "account-deleted");
            data.put("text", "A person's account was deleted on " + EvidenceChain.AT.format(Instant.now()) + ". Their email stays in "
                + "the events listed here, written before TaskForce 1.18, which cannot change without breaking the chain: "
                + "TaskForce hides it when it shows this record.");
            Optional<String> hash = appendTo(runId, "note", Actor.SERVER, data);
            if (hash.isEmpty()) {
                continue;
            }
            if (run != null && run.getEvidenceRoot() != null) run.setEvidenceRoot(hash.get());
            seal(runId, false, true);
            touched++;
        }
        return touched;
    }

    /**
     * Ce dossier vient-il d'avant la 1.18 (R159, second tour, N4) ? Sa chaîne nomme alors les personnes par leur courriel :
     * son {@code mission.started} n'a pas de {@code accountable}, ou il n'en a pas.
     */
    @Transactional(readOnly = true)
    public boolean legacy(Long runId) {
        return repository.findFirstByRunIdAndTypeOrderBySeqAsc(runId, "mission.started")
            .map(started -> !parse(started.getData()).has("accountable")).orElse(true);
    }

    /** Un courriel, où qu'il soit dans un texte. */
    private static final java.util.regex.Pattern EMAIL = java.util.regex.Pattern.compile("[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\\.[A-Za-z0-9-]+)+");

    /** Ce que TaskForce écrit à la place d'un courriel qu'une chaîne d'avant la 1.18 garde (R159, second tour, N4). */
    static final String HIDDEN_EMAIL = "(email hidden)";

    // --------------------------------------------------------------------- finir, sceller

    /**
     * Fin de mission : l'état de la liste de l'issue, l'événement qui la clôt, puis l'empreinte racine posée sur le run et
     * le sceau. Rien pour un run sans dossier (autres fournisseurs, runs de la v1).
     */
    @Transactional
    public void end(DeliveryRun run, DeliveryPoll poll) {
        if (repository.findTopByRunIdOrderBySeqDesc(run.getId()).isEmpty()) {
            return;
        }
        checklistAtEnd(run);
        if (poll.status() == DeliveryRunStatus.FAILED && poll.error() != null && poll.error().startsWith(ClaudeCodeProvider.RUNNER_LOST)) {
            lost(run);
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("status", poll.status().name());
        // Le seul texte de l'agent que la page montre (R212, rubrique 2), gardé à côté de la chaîne.
        data.put("summary", ref(run.getId(), "summary", EvidenceIntake.clip(blankToNull(poll.summary()), MAX_SUMMARY)));
        data.put("resultUrl", poll.resultUrl());
        data.put("error", EvidenceIntake.clip(poll.error(), MAX_TEXT));
        data.put("branch", run.getBranch());
        data.put("commits", run.getCommits());
        String root = append(run, "mission.ended", Actor.SERVER, data)
            .or(() -> repository.findTopByRunIdOrderBySeqDesc(run.getId()).map(DeliveryRunEvidence::getHash))
            .orElse(null);
        run.setEvidenceRoot(root);
        seal(run.getId(), true);
    }

    /**
     * La liste de l'issue à la fin de la mission : chaque ligne, cochée ou non, son texte par son empreinte. Avec les
     * coches que l'agent a faites pendant la mission (au dossier, {@link #checked}), la page distingue ce que l'agent
     * déclare de ce qu'une personne a coché.
     */
    private void checklistAtEnd(DeliveryRun run) {
        Issue issue = run.getIssue();
        if (issue == null || issue.getId() == null) {
            return;
        }
        List<IssueChecklistItem> items = checklist.findByIssueIdOrderByPositionAscIdAsc(issue.getId());
        if (items == null || items.isEmpty()) {
            return;
        }
        List<Map<String, Object>> list = new ArrayList<>();
        for (IssueChecklistItem item : items) {
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("id", item.getId());
            entry.put("text", ref(run.getId(), "checklist", item.getContent()));
            entry.put("done", item.isDone());
            list.add(entry);
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("kind", "checklist");
        data.put("items", list);
        append(run, "note", Actor.SERVER, data);
    }

    /** L'agent d'une mission vient de cocher, ou de décocher, une ligne de la liste de son issue : il le déclare. */
    @Transactional
    public void checked(DeliveryRun run, IssueChecklistItem item) {
        if (repository.findTopByRunIdOrderBySeqDesc(run.getId()).isEmpty()) {
            return;
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("kind", "checklist.checked");
        data.put("item", item.getId());
        data.put("text", ref(run.getId(), "checklist", item.getContent()));
        data.put("done", item.isDone());
        append(run, "note", new Actor("agent", run.getProviderKey()), data);
    }

    /**
     * Un geste qui vient après la fin de la mission (R139 : un fichier remis, des changements demandés ; TF-J2-7 : Apply,
     * Discard, Try again, Mark as done, le témoin) : il s'ajoute à la suite de la chaîne, le sceau passe à ce dernier
     * maillon, et un nouveau sceau le couvre. Une copie exportée avant reste un début exact du dossier : rien n'est
     * réécrit, chaque empreinte tient toujours.
     */
    @Transactional
    public Optional<String> appendAfterEnd(DeliveryRun run, String type, Actor actor, Map<String, ?> data) {
        Optional<String> hash = append(run, type, actor, data);
        if (run.getEvidenceRoot() != null && hash.isPresent()) {
            run.setEvidenceRoot(hash.get());
            seal(run.getId(), false);
        }
        return hash;
    }

    /**
     * La même chose sur un dossier dont la mission peut ne plus exister (un texte effacé, le témoin). Rend l'empreinte de
     * l'événement, ou rien quand il n'est pas gardé.
     */
    @Transactional
    public Optional<String> appendToDossier(Long runId, String type, Actor actor, Map<String, ?> data) {
        DeliveryRun run = runRepository.findByIdForUpdate(runId).orElse(null);
        if (run != null) {
            return appendAfterEnd(run, type, actor, data);
        }
        Optional<String> hash = appendTo(runId, type, actor, data);
        if (hash.isPresent() && seals.findTopByRunIdOrderBySeqDesc(runId).isPresent()) {
            seal(runId, false);
        }
        return hash;
    }

    /**
     * Ce que porte le lien du témoin vers la page du dossier (R159, second tour, M-b) : un identifiant du dossier, opaque et
     * tiré au hasard (128 bits), sans l'espace ni le numéro de la mission, posé la première fois qu'il sert. La page qu'il
     * ouvre garde ses contrôles d'accès.
     */
    @Transactional
    public String linkId(Long runId) {
        String current = dossiers.findLinkId(runId);
        if (current != null) {
            return current;
        }
        dossiers.setLinkId(runId, salt());
        return dossiers.findLinkId(runId);
    }

    /** Le témoin a fini d'essayer pour ce dossier, écrit ou non : le passage régulier ne le relance plus (N2). */
    @Transactional
    public void witnessed(Long runId) {
        dossiers.markWitnessed(runId);
    }

    /** La sorte de la note d'un sceau tardif (R159, second tour, N5). */
    static final String LATE_SEAL = "late-seal";

    /**
     * Scelle tard un dossier fini avant que TaskForce ne scelle (R159, second tour, N5) : une note le dit à la suite de sa
     * chaîne, avec la date, puis un sceau qui le dit aussi ({@code late}). Il prouve la chaîne telle qu'elle est ce jour-là,
     * rien de ce qui précède. Rien pour un dossier qui a déjà un sceau. Rend vrai s'il l'a scellé.
     */
    @Transactional
    public boolean sealLate(Long runId) {
        DeliveryRun run = runRepository.findByIdForUpdate(runId).orElse(null);
        if (seals.findTopByRunIdOrderBySeqDesc(runId).isPresent()) {
            return false;
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("kind", LATE_SEAL);
        data.put("text", "TaskForce sealed this record late, on " + EvidenceChain.AT.format(Instant.now()) + ", after its mission "
            + "had ended: the seal proves the chain as it was on that date, not what happened before.");
        Optional<String> hash = appendTo(runId, "note", Actor.SERVER, data);
        if (hash.isEmpty()) {
            return false;
        }
        if (run != null && run.getEvidenceRoot() != null) run.setEvidenceRoot(hash.get());
        seal(runId, false, true);
        return true;
    }

    /**
     * Scelle le dossier à sa tête : l'énoncé in-toto (l'en-tête, la tête, son rang, l'heure, la clé et sa garde) signé
     * en Ed25519 sous une enveloppe DSSE. Un sceau par rang, jamais réécrit. Celui de la fin annonce la mission scellée :
     * sa tête s'écrit chez un témoin.
     */
    void seal(Long runId, boolean atEnd) {
        seal(runId, atEnd, false);
    }

    /**
     * Le sceau, tardif ou non. Un dossier scellé tard l'est pour de bon : un sceau qui le suit ne prouve rien de plus ancien
     * que le premier, et le dit aussi (R159, second tour, N5).
     */
    private void seal(Long runId, boolean atEnd, boolean late) {
        MissionDossier dossier = dossiers.findById(runId).orElse(null);
        List<ObjectNode> events = events(runId);
        if (dossier == null || events.isEmpty()) {
            return;
        }
        ObjectNode last = events.getLast();
        int seq = last.get("seq").asInt();
        String root = last.get("hash").asText();
        if (seals.existsByRunIdAndSeq(runId, seq)) {
            return;
        }
        boolean lateSeal = late || seals.existsByRunIdAndLateTrue(runId);
        String at = EvidenceChain.AT.format(Instant.now());
        ObjectNode statement = EvidenceSeal.statement(header(dossier, events), root, seq, at, signer.key(), lateSeal);
        byte[] payload = EvidenceSeal.payload(statement);
        byte[] signature = signer.sign(EvidenceSeal.pae(EvidenceSeal.PAYLOAD_TYPE, payload));
        ObjectNode envelope = EvidenceSeal.envelope(payload, signer.key().id(), signature);
        seals.save(MissionDossierSeal.builder().runId(runId).seq(seq).root(root).sealedAt(at).keyId(signer.key().id())
            .envelope(envelope.toString()).late(lateSeal).build());
        if (atEnd && !lateSeal) {
            publisher.publishEvent(new MissionSealed(runId, root, seq, signer.key().id()));
        }
    }

    // --------------------------------------------------------------------- lire, exporter

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

    /** Le dossier d'une mission, s'il en a un : il peut survivre à la mission. */
    @Transactional(readOnly = true)
    public Optional<MissionDossier> dossier(Long runId) {
        return dossiers.findById(runId);
    }

    /**
     * Le dossier au format {@code taskforce-evidence/1}, ou vide si la mission n'en a pas (run de la v1) : l'en-tête tiré
     * de la chaîne, les événements, la racine, le paquet de règles de la mission, les textes gardés à côté (sauf ceux qu'on
     * a effacés), et le dernier sceau. Rien n'y est lu de la mission ni de son issue : il s'exporte encore après elles.
     */
    @Transactional(readOnly = true)
    public Optional<String> dossierJson(Long runId) {
        MissionDossier dossier = dossiers.findById(runId).orElse(null);
        List<ObjectNode> events = events(runId);
        if (dossier == null || events.isEmpty()) {
            return Optional.empty();
        }
        ObjectNode file = JSON.createObjectNode();
        file.put("format", FORMAT);
        file.set("mission", header(dossier, events));
        ArrayNode list = file.putArray("events");
        events.forEach(list::add);
        file.put("root", events.getLast().get("hash").asText());
        if (dossier.getRulesBundle() != null) {
            file.set("rules", parse(dossier.getRulesBundle()));
        }
        // Chaque texte avec son sel : l'empreinte que la chaîne porte est le SHA-256 du sel suivi du texte (R159, M6).
        ObjectNode kept = JSON.createObjectNode();
        for (MissionDossierText text : texts.findByRunIdOrderByIdAsc(runId)) {
            if (text.getBody() != null && text.getSalt() != null) {
                kept.putObject(text.getHash()).put("salt", text.getSalt()).put("text", text.getBody());
            }
        }
        file.set("texts", kept);
        seals.findTopByRunIdOrderBySeqDesc(runId).ifPresent(seal -> file.set("seal", parse(seal.getEnvelope())));
        return Optional.of(write(file));
    }

    /** Le dernier sceau du dossier, seul : l'enveloppe DSSE de l'énoncé in-toto, que les outils standard lisent. */
    @Transactional(readOnly = true)
    public Optional<String> envelope(Long runId) {
        return seals.findTopByRunIdOrderBySeqDesc(runId).map(MissionDossierSeal::getEnvelope)
            .map(envelope -> write(parse(envelope)));
    }

    /** Le même dossier, lisible par une personne, avec le résultat du recalcul de la chaîne au moment de l'export. */
    @Transactional(readOnly = true)
    public Optional<String> dossierMarkdown(Long runId) {
        MissionDossier dossier = dossiers.findById(runId).orElse(null);
        List<ObjectNode> events = events(runId);
        if (dossier == null || events.isEmpty()) {
            return Optional.empty();
        }
        ObjectNode mission = header(dossier, events);
        int broken = EvidenceChain.firstBrokenLink(events);
        Optional<MissionDossierSeal> seal = seals.findTopByRunIdOrderBySeqDesc(runId);
        Map<String, String> names = names(runId, events);
        StringBuilder md = new StringBuilder();
        md.append("# Evidence of mission ").append(runId);
        if (!mission.path("issue").isNull()) md.append(": ").append(mission.path("issue").asText());
        md.append("\n\n");
        md.append("- Workspace: ").append(mission.path("workspace").asText()).append('\n');
        md.append("- Requested by: ").append(mission.path("requestedBy").isTextual() ? named(mission.path("requestedBy").asText(), names)
            : "not in the chain (a mission written before TaskForce 1.18)").append('\n');
        md.append("- Agent: ").append(mission.path("agent").path("kind").asText());
        if (!mission.path("agent").path("model").isNull()) md.append(", model ").append(mission.path("agent").path("model").asText());
        if (!mission.path("agent").path("version").isNull()) md.append(", version ").append(mission.path("agent").path("version").asText());
        md.append('\n');
        md.append("- Rules: version ").append(mission.path("rules").path("version").asText())
            .append(", `").append(mission.path("rules").path("digest").asText()).append("`\n");
        md.append("- Root: `").append(events.getLast().get("hash").asText()).append("` (").append(events.size()).append(" events)\n");
        md.append("- Durations: ").append(durations(events)).append('\n');
        md.append("- Chain: ").append(broken < 0
            ? "checked when exported, every hash holds."
            : "BROKEN at event " + events.get(broken).get("seq").asInt() + ": this file was changed after it was written.").append('\n');
        md.append("- Seal: ").append(seal.map(s -> "event " + s.getSeq() + ", signed by key `" + s.getKeyId() + "` at "
            + s.getSealedAt() + " (" + custodyWords(s) + ")").orElse("none yet: the mission has not ended.")).append('\n');
        // Ce que le runner rapporte vient du poste de l'agent, quelle que soit la garde de la clé (R159, M5).
        if (AGENT_MACHINE.equals(mission.path("runnerFacts").asText(null))) {
            md.append("- The runner's facts (its tests, the agent and its model, the numbers of its events) come from the ")
                .append("computer where the agent works: they are worth what that computer is worth, whatever the custody ")
                .append("of the key. The seal only says where the key lives.\n");
        }
        for (ObjectNode e : events) {
            if (!"test.result".equals(e.get("type").asText())) continue;
            JsonNode changed = e.get("data").path("definitionChanged");
            JsonNode looked = e.get("data").path("definitions");
            if (changed.isArray() && !changed.isEmpty()) {
                List<String> what = new ArrayList<>();
                changed.forEach(p -> what.add(TEST_SETTING.equals(p.asText()) ? "the project's test command in TaskForce" : "`" + p.asText() + "`"));
                md.append("- Not checked: what defines how the tests run changed during the mission (").append(String.join(", ", what))
                    .append("), so the tests' result only says that the agent's version of the tests passes (event ")
                    .append(e.get("seq").asInt()).append(").\n");
            } else if (looked.isArray() && !looked.isEmpty()) {
                // Une liste de ce que TaskForce cherche, pas la preuve que les tests sont les mêmes (R159, second tour, L-b).
                List<String> paths = new ArrayList<>();
                looked.forEach(p -> paths.add("`" + p.asText() + "`"));
                md.append("- None of these files, which define how the tests run, changed: ").append(String.join(", ", paths))
                    .append(" (event ").append(e.get("seq").asInt()).append("). It is the list TaskForce looks for, not a proof ")
                    .append("that the tests are the same.\n");
            }
        }
        md.append('\n');
        md.append("| # | At (UTC) | Type | Actor | What |\n| --- | --- | --- | --- | --- |\n");
        for (ObjectNode e : events) {
            String actor = e.get("actor").get("kind").asText() + " " + e.get("actor").get("id").asText();
            md.append("| ").append(e.get("seq").asInt())
                .append(" | ").append(e.get("at").asText().replace('T', ' ').replace("Z", ""))
                .append(" | ").append(e.get("type").asText())
                .append(" | ").append(cell(named(actor, names)))
                .append(" | ").append(cell(describe(e.get("data"))))
                .append(" |\n");
        }
        md.append("\nTo check this file without TaskForce: each `hash` is the SHA-256 of `prev`, a line feed, then the ")
            .append("canonical JSON of the event without its `hash` (contracts/README.md). The last one is the root. ")
            .append("The JSON export carries the signed seal: `npm run verify -- evidence-run-").append(runId)
            .append(".json --key <the key id the operator publishes>` in taskforce-runner checks both.\n");
        // Une chaîne d'avant la 1.18 nomme les personnes par leur courriel : l'export lisible les masque tous (R159, N4).
        boolean legacy = events.stream().filter(e -> "mission.started".equals(e.get("type").asText())).findFirst()
            .map(e -> !e.get("data").has("accountable")).orElse(true);
        String text = legacy ? EMAIL.matcher(md.toString()).replaceAll(HIDDEN_EMAIL) : md.toString();
        return Optional.of(EvidenceIntake.text(text));
    }

    /** Ce que le sceau dit de sa clé, lu dans son énoncé et non dans la clé d'aujourd'hui (R159, M2). */
    private static String custodyWords(MissionDossierSeal seal) {
        EvidenceSeal.Opened opened = EvidenceSeal.open(parse(seal.getEnvelope()));
        JsonNode key = opened.statement() == null ? null : opened.statement().path("predicate").path("key");
        String custody = key == null ? EvidenceSeal.SAME_MACHINE : key.path("custody").asText(EvidenceSeal.SAME_MACHINE);
        String words = EvidenceSeal.SEPARATE_MACHINE.equals(custody)
            ? "the operator declared, when it sealed, that the key is kept where no agent runs"
            : "the key was on the same machine as the agent";
        return key != null && !key.path("kept").asBoolean(true) ? words + "; the key was drawn at the server's start and is not kept" : words;
    }

    /**
     * Les personnes que ce dossier nomme : leur identifiant opaque, et ce que leur note dit d'elles, lu dans les textes à
     * côté de la chaîne (leur courriel) ; effacé, le nom le dit.
     */
    private Map<String, String> names(Long runId, List<ObjectNode> events) {
        Map<String, String> kept = new HashMap<>();
        for (MissionDossierText text : texts.findByRunIdOrderByIdAsc(runId)) {
            if (text.getBody() != null) kept.put(text.getHash(), text.getBody());
        }
        Map<String, String> names = new HashMap<>();
        for (ObjectNode e : events) {
            JsonNode data = e.get("data");
            if ("note".equals(e.get("type").asText()) && "person".equals(data.path("kind").asText())) {
                String email = kept.get(data.path("email").path("sha256").asText(""));
                names.put(data.path("person").asText(), email != null ? email : "a person whose details were erased");
            }
        }
        return names;
    }

    /** Un acteur ou un identifiant, avec la personne qu'il nomme quand ce dossier la connaît. */
    private static String named(String text, Map<String, String> names) {
        for (Map.Entry<String, String> name : names.entrySet()) {
            if (text.endsWith(name.getKey())) {
                return text + " (" + name.getValue() + ")";
            }
        }
        return text;
    }

    /**
     * L'en-tête de l'export : ce que la chaîne en dit ({@link EvidenceHeader}), et pour un dossier ouvert avant la 1.18,
     * ce qu'elle ne couvre pas, tiré de sa ligne.
     */
    ObjectNode header(MissionDossier dossier, List<ObjectNode> events) {
        EvidenceHeader.Projection projection = EvidenceHeader.of(events);
        ObjectNode from = projection.header();
        ObjectNode header = JSON.createObjectNode();
        header.set("id", projection.covered().contains("id") ? from.get("id") : JsonNodeFactory.instance.numberNode(dossier.getRunId()));
        header.set("workspace", projection.covered().contains("workspace") ? from.get("workspace")
            : JsonNodeFactory.instance.textNode(dossier.getWorkspace().getSlug()));
        header.set("project", projection.covered().contains("project") ? from.get("project")
            : dossier.getProjectId() == null ? JsonNodeFactory.instance.nullNode() : JsonNodeFactory.instance.numberNode(dossier.getProjectId()));
        header.set("issue", projection.covered().contains("issue") ? from.get("issue")
            : dossier.getIssueKey() == null ? JsonNodeFactory.instance.nullNode() : JsonNodeFactory.instance.textNode(dossier.getIssueKey()));
        // Avant la 1.18, la chaîne ne dit pas qui a délégué, et l'en-tête non plus : un courriel lu dans la ligne de la
        // personne changerait avec elle (une nouvelle adresse, la purge de son compte), et le sceau ne tiendrait plus (R159, M6).
        header.set("requestedBy", projection.covered().contains("requestedBy") ? from.get("requestedBy") : JsonNodeFactory.instance.nullNode());
        header.set("agent", projection.covered().contains("agent") ? from.get("agent") : JSON.createObjectNode().putNull("kind"));
        header.set("rules", projection.covered().contains("rules") ? from.get("rules") : JSON.createObjectNode());
        header.set("runner", projection.covered().contains("runner") ? from.get("runner") : JsonNodeFactory.instance.nullNode());
        if (projection.covered().contains("runnerFacts")) {
            header.set("runnerFacts", from.get("runnerFacts"));
        }
        header.set("taskforce", projection.covered().contains("taskforce") ? from.get("taskforce") : JsonNodeFactory.instance.nullNode());
        return header;
    }

    // --------------------------------------------------------------------- effacer un texte

    /**
     * Efface un texte gardé à côté de la chaîne (R198 amendée, précision 4) : son empreinte reste dans la chaîne, qui
     * tient toujours, et l'effacement s'y ajoute, avec qui et quand. Un texte déjà effacé ne change plus.
     */
    @Transactional
    public void eraseText(Long runId, String hash, User by) {
        // La mission d'abord (elle peut ne plus exister), puis le dossier, que la note de la personne verrouille.
        runRepository.findByIdForUpdate(runId);
        MissionDossierText text = texts.findByRunIdAndHash(runId, hash)
            .orElseThrow(() -> new ResourceNotFoundException("This text is not in the mission's evidence."));
        if (text.getBody() == null) {
            throw new BusinessException("This text was already erased.");
        }
        text.setBody(null);
        text.setSalt(null);
        text.setErasedAt(LocalDateTime.now());
        text.setErasedBy(by);
        texts.save(text);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("kind", "erased");
        data.put("text", hash);
        data.put("what", text.getKind());
        Long workspaceId = workspaceOf(runId);
        personNote(runId, workspaceId, by);
        appendToDossier(runId, "human.decision", new Actor("person", personId(workspaceId, by)), data);
    }

    // ---------------------------------------------------------------------

    private void ensureDossier(DeliveryRun run) {
        if (!dossiers.existsById(run.getId())) {
            dossiers.saveAndFlush(newDossier(run, null));
        }
    }

    private static MissionDossier newDossier(DeliveryRun run, String rulesBundle) {
        Issue issue = run.getIssue();
        Project project = issue.getProject();
        return MissionDossier.builder()
            .runId(run.getId())
            .workspace(project.getWorkspace())
            .projectId(project.getId())
            .issueId(issue.getId())
            .issueKey(key(issue))
            .delegatedBy(run.getStartedBy())
            .rulesBundle(rulesBundle)
            .createdAt(LocalDateTime.now())
            .build();
    }

    private static String key(Issue issue) {
        Project project = issue.getProject();
        return project == null || issue.getSequenceNumber() == null ? null : project.getIdentifier() + "-" + issue.getSequenceNumber();
    }

    private static Actor runnerActor(DeliveryRun run) {
        return new Actor("runner", run.getClaimedBy() == null ? "runner" : run.getClaimedBy());
    }

    /** Une date du serveur (UTC sans fuseau, comme l'API) au format de la chaîne. */
    private static String utc(LocalDateTime at) {
        return at == null ? null : EvidenceChain.AT.format(at.toInstant(ZoneOffset.UTC));
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    private static String json(Object value) {
        try {
            return JSON.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Evidence value could not be written", e);
        }
    }

    /**
     * Le fichier exporté. Un dossier d'avant ce lot peut garder une moitié de paire de substitution (l'ancienne coupe d'un
     * texte au milieu d'un emoji) : écrite telle quelle, l'UTF-8 en ferait « ? » et la chaîne ne tiendrait plus. Elle sort
     * échappée, comme le JSON canonique l'empreinte (R159, M7).
     */
    private static String write(JsonNode file) {
        try {
            return EvidenceIntake.escapeLoneSurrogates(JSON.writerWithDefaultPrettyPrinter().writeValueAsString(file));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Evidence file could not be written", e);
        }
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

    /**
     * Le contenu d'un événement en une ligne : ses champs, dans l'ordre où ils sont rangés, coupés à 300 caractères. La
     * raison d'une décision passe d'abord, entière (elle est bornée à 500 caractères à l'entrée) : la coupe ne la mange
     * jamais.
     */
    static String describe(JsonNode data) {
        String reason = data.hasNonNull("reason") ? "reason: " + text(data.get("reason")) : null;
        Map<String, String> fields = new LinkedHashMap<>();
        data.properties().forEach(entry -> {
            if (!"reason".equals(entry.getKey())) fields.put(entry.getKey(), text(entry.getValue()));
        });
        StringBuilder out = new StringBuilder();
        fields.forEach((key, value) -> out.append(out.isEmpty() ? "" : ", ").append(key).append(": ").append(value));
        String rest = out.length() > 300 ? out.substring(0, 297) + "..." : out.toString();
        if (reason == null) return rest;
        return rest.isEmpty() ? reason : reason + ", " + rest;
    }

    private static String text(JsonNode value) {
        return value.isTextual() ? value.asText() : value.toString();
    }

    private static String cell(String text) {
        return text.replace("\\", "\\\\").replace("|", "\\|").replace("\r", " ").replace("\n", " ");
    }
}
