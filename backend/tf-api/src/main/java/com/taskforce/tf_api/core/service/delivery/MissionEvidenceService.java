package com.taskforce.tf_api.core.service.delivery;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
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
import com.taskforce.tf_api.core.harness.rules.RulesBundle;
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
     * Plafond des événements du runner, de l'agent et des règles, bien au-delà de la chronologie affichée : atteint, un
     * événement le dit, et ce qu'ils envoient ensuite n'est plus gardé.
     */
    static final int MAX_EVENTS = 10_000;
    /**
     * Au-delà du plafond, une réserve pour ce que le serveur et les personnes écrivent : la fin, les gestes et leur
     * raison, le témoin, un effacement (R159, M4). Un agent qui épuise le plafond n'efface pas la décision de fin.
     */
    static final int RESERVE = 1_000;
    /** Les acteurs que le plafond borne : ce qui vient du poste de l'agent. */
    private static final Set<String> CAPPED = Set.of("agent", "rule", "runner");
    /** Les faits que le runner rapporte viennent du poste de l'agent, quelle que soit la garde de la clé (R159, M5). */
    static final String AGENT_MACHINE = "agent-machine";
    static final String LIMIT_REACHED = "limit.reached";
    /** Ce qu'un événement garde d'un texte en clair (une commande, une erreur), et d'un fait jugé. */
    static final int MAX_TEXT = 2_000;
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
        MissionDossier dossier = dossiers.findById(run.getId()).orElse(null);
        String bundle = rules == null ? null : json(rules);
        if (dossier == null) {
            // Écrite tout de suite : les textes et les événements, insérés aussitôt, la désignent.
            dossiers.saveAndFlush(newDossier(run, bundle));
        } else if (dossier.getRulesBundle() == null && bundle != null) {
            dossier.setRulesBundle(bundle);
            dossiers.saveAndFlush(dossier);
        }
        // Les personnes entrent par leur identifiant opaque dans cet espace ; leur courriel et leur nom, à côté, dans des
        // notes qui suivent l'ouverture (R159, M6 ; second tour, L-a).
        Long workspaceId = project.getWorkspace().getId();
        List<User> named = new ArrayList<>();
        String delegator = personIdOf(workspaceId, run.getStartedBy(), named);
        Map<String, Object> request = new LinkedHashMap<>();
        request.put("title", ref(run.getId(), "title", issue.getTitle()));
        request.put("description", ref(run.getId(), "description", blankToNull(issue.getDescription())));
        request.put("reporter", personIdOf(workspaceId, issue.getReporter(), named));
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
        started.put("rules", rules == null ? null : rulesData(rules, workspaceId, named));
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

    /** Les règles de la mission telles que le dossier les garde : version, empreinte, et chaque couche avec son auteur. */
    private Map<String, Object> rulesData(RulesBundle rules, Long workspaceId, List<User> named) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("version", rules.version());
        data.put("digest", rules.digest());
        List<Map<String, Object>> layers = new ArrayList<>();
        if (rules.layers() != null) {
            for (RulesBundle.Layer layer : rules.layers()) {
                Map<String, Object> entry = new LinkedHashMap<>();
                entry.put("scope", layer.scope());
                entry.put("ref", layer.ref());
                entry.put("version", layer.version());
                entry.put("digest", layer.digest());
                entry.put("author", ruleSets.findByWorkspaceIdAndVersion(workspaceId, layer.version())
                    .map(set -> personIdOf(workspaceId, set.getCreatedBy(), named)).orElse(null));
                layers.add(entry);
            }
        }
        data.put("layers", layers);
        return data;
    }

    // --------------------------------------------------------------------- ajouter

    /**
     * Ajoute un événement à la suite du dossier et rend son empreinte. Le dossier plein, l'avant-dernière place reste
     * au constat {@code limit.reached} et rien d'autre n'est gardé : la troncature se lit dans le dossier.
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
        // Le plafond borne ce qui vient du poste de l'agent ; la réserve garde la fin, les gestes, le témoin (R159, M4).
        if (CAPPED.contains(actor.kind()) && seq >= MAX_EVENTS) {
            if (seq > MAX_EVENTS && repository.existsByRunIdAndType(runId, LIMIT_REACHED)) {
                return Optional.empty();
            }
            log.warn("Run {} : dossier de preuve plein ({} événements du poste de l'agent)", runId, MAX_EVENTS);
            type = LIMIT_REACHED;
            actor = Actor.SERVER;
            data = Map.of("max", MAX_EVENTS, "text", "The evidence of this mission reached its cap: later events from the "
                + "agent's computer are not kept. What the server and the people write still is.");
        }
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
        append(run, RUNNER_TYPE.getOrDefault(event.kind(), "note"), actorOf(run, event), dataOf(run.getId(), event));
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
     * Ce que le dossier garde d'un événement du runner. Ce que l'agent raconte, et le brief, n'y entrent que par leur
     * empreinte ; une décision garde les faits jugés et l'empreinte de l'action exacte ; les tests, leur résultat et
     * l'empreinte de leur sortie.
     */
    private Map<String, Object> dataOf(Long runId, RunnerEventsRequest.Event event) {
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
            // La branche a changé ce qui dit comment ses tests tournent : le résultat ne vaut que pour sa version (R159, M5).
            if (test.definitionChanged() != null && !test.definitionChanged().isEmpty()) {
                data.put("definitionChanged", test.definitionChanged().stream().filter(p -> p != null && !p.isBlank())
                    .map(p -> EvidenceIntake.clip(p.strip(), 300)).toList());
            }
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
                    if (k != null && v != null) clean.put(k, EvidenceIntake.clip(v, MAX_TEXT));
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
        String hash = person != null ? null
            : texts.findFirstByRunIdAndKindAndBody(runId, kind, clean).map(MissionDossierText::getHash).orElse(null);
        if (hash == null) {
            String salt = salt();
            hash = EvidenceChain.sha256(salt + clean);
            texts.save(MissionDossierText.builder().runId(runId).hash(hash).kind(kind).salt(salt).body(clean).person(person).build());
        }
        Map<String, Object> ref = new LinkedHashMap<>();
        ref.put("sha256", hash);
        ref.put("chars", clean.codePointCount(0, clean.length()));
        return ref;
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
            .orElseGet(() -> people.saveAndFlush(MissionPerson.builder().workspaceId(workspaceId).userId(user.getId())
                .person(MissionPerson.PREFIX + salt()).createdAt(LocalDateTime.now()).build()).getPerson());
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
        log.info("Compte {} oublié des dossiers : {} dossier(s) touché(s)", userId, byDossier.size());
        return byDossier.size();
    }

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
    public void appendAfterEnd(DeliveryRun run, String type, Actor actor, Map<String, ?> data) {
        Optional<String> hash = append(run, type, actor, data);
        if (run.getEvidenceRoot() != null && hash.isPresent()) {
            run.setEvidenceRoot(hash.get());
            seal(run.getId(), false);
        }
    }

    /** La même chose sur un dossier dont la mission peut ne plus exister (un texte effacé, le témoin). */
    @Transactional
    public void appendToDossier(Long runId, String type, Actor actor, Map<String, ?> data) {
        DeliveryRun run = runRepository.findByIdForUpdate(runId).orElse(null);
        if (run != null) {
            appendAfterEnd(run, type, actor, data);
            return;
        }
        Optional<String> hash = appendTo(runId, type, actor, data);
        if (hash.isPresent() && seals.findTopByRunIdOrderBySeqDesc(runId).isPresent()) {
            seal(runId, false);
        }
    }

    /**
     * Scelle le dossier à sa tête : l'énoncé in-toto (l'en-tête, la tête, son rang, l'heure, la clé et sa garde) signé
     * en Ed25519 sous une enveloppe DSSE. Un sceau par rang, jamais réécrit. Celui de la fin annonce la mission scellée :
     * sa tête s'écrit chez un témoin.
     */
    void seal(Long runId, boolean atEnd) {
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
        String at = EvidenceChain.AT.format(Instant.now());
        ObjectNode statement = EvidenceSeal.statement(header(dossier, events), root, seq, at, signer.key());
        byte[] payload = EvidenceSeal.payload(statement);
        byte[] signature = signer.sign(EvidenceSeal.pae(EvidenceSeal.PAYLOAD_TYPE, payload));
        ObjectNode envelope = EvidenceSeal.envelope(payload, signer.key().id(), signature);
        seals.save(MissionDossierSeal.builder().runId(runId).seq(seq).root(root).sealedAt(at).keyId(signer.key().id())
            .envelope(envelope.toString()).build());
        if (atEnd) {
            publisher.publishEvent(new MissionSealed(runId, root, seq));
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
            JsonNode changed = e.get("data").path("definitionChanged");
            if ("test.result".equals(e.get("type").asText()) && changed.isArray() && !changed.isEmpty()) {
                List<String> paths = new ArrayList<>();
                changed.forEach(p -> paths.add("`" + p.asText() + "`"));
                md.append("- Not checked: the branch changed ").append(String.join(", ", paths))
                    .append(", which defines how its tests run, so the tests' result only says that the agent's version of ")
                    .append("the tests passes (event ").append(e.get("seq").asInt()).append(").\n");
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
        return Optional.of(EvidenceIntake.text(md.toString()));
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
