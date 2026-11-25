package com.taskforce.tf_api.core.service.delivery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.taskforce.tf_api.core.dto.request.RunnerEventsRequest;
import com.taskforce.tf_api.core.dto.request.RunnerResultRequest;
import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.harness.evidence.CanonicalJson;
import com.taskforce.tf_api.core.harness.evidence.EvidenceChain;
import com.taskforce.tf_api.core.harness.evidence.EvidenceSeal;
import com.taskforce.tf_api.core.harness.evidence.EvidenceSigner;
import com.taskforce.tf_api.core.harness.rules.RulesBundle;
import com.taskforce.tf_api.core.model.DeliveryRun;
import com.taskforce.tf_api.core.model.DeliveryRunEvidence;
import com.taskforce.tf_api.core.model.HarnessRuleSet;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.IssueChecklistItem;
import com.taskforce.tf_api.core.model.MissionDossier;
import com.taskforce.tf_api.core.model.MissionDossierSeal;
import com.taskforce.tf_api.core.model.MissionDossierText;
import com.taskforce.tf_api.core.model.MissionPerson;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
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

/**
 * Dossier de preuve d'une mission (spécification de la v2, §9 ; TF-J2-7) : chaîné à l'ajout, vérifiable par recalcul à
 * l'export, jamais tronqué en silence, scellé à la fin ; la demande telle qu'elle part, le modèle lancé, les trous
 * marqués, les textes sensibles à côté de la chaîne, l'en-tête tiré de la chaîne, et un export qui se passe de la mission.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("Dossier de preuve d'une mission")
class MissionEvidenceServiceTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String DIGEST = "sha256:" + "a".repeat(64);

    @Mock private DeliveryRunEvidenceRepository repository;
    @Mock private DeliveryRunRepository runRepository;
    @Mock private MissionDossierRepository dossiers;
    @Mock private MissionDossierSealRepository sealRepository;
    @Mock private MissionDossierTextRepository textRepository;
    @Mock private HarnessRuleSetRepository ruleSets;
    @Mock private IssueChecklistItemRepository checklist;
    @Mock private MissionPersonRepository people;
    @Mock private ApplicationEventPublisher publisher;
    @Mock private UserRepository users;

    /** Ce que la base garde, dans l'ordre. */
    private final List<DeliveryRunEvidence> stored = new ArrayList<>();
    private final Map<Long, MissionDossier> rows = new HashMap<>();
    private final List<MissionDossierSeal> seals = new ArrayList<>();
    private final List<MissionDossierText> texts = new ArrayList<>();
    private final Map<Long, MissionPerson> persons = new HashMap<>();
    private MissionEvidenceService service;
    private DeliveryRun run;
    private Issue issue;
    private User ada;

    @BeforeEach
    void setUp() {
        service = new MissionEvidenceService(repository, runRepository, dossiers, sealRepository, textRepository, ruleSets,
            checklist, people, new EvidenceSigner("", "", ""), publisher, users);
        ada = User.builder().id(7L).email("ada@taskforce.dev").displayName("Ada Lovelace").build();
        User bob = User.builder().id(8L).email("bob@taskforce.dev").build();
        Workspace workspace = Workspace.builder().id(3L).slug("acme").owner(ada).build();
        Project project = Project.builder().id(12L).identifier("WEB").workspace(workspace).build();
        issue = Issue.builder().id(55L).sequenceNumber(12).title("Fix the footer").description("The links point to the old site.")
            .reporter(bob).createdAt(LocalDateTime.of(2026, 11, 20, 9, 30)).project(project).build();
        run = DeliveryRun.builder().id(100L).issue(issue).providerKey("claude-code").model("claude-sonnet-5")
            .status(DeliveryRunStatus.RUNNING).startedBy(ada).claimedBy("tf-runner-ada").rulesVersion(1).rulesDigest(DIGEST)
            .origin("mcp").build();
        run.setCreatedAt(LocalDateTime.of(2026, 11, 22, 8, 0));
        lenient().when(repository.save(any())).thenAnswer(inv -> {
            stored.add(inv.getArgument(0));
            return inv.getArgument(0);
        });
        lenient().when(repository.findTopByRunIdOrderBySeqDesc(100L))
            .thenAnswer(inv -> stored.isEmpty() ? Optional.empty() : Optional.of(stored.getLast()));
        lenient().when(repository.findByRunIdOrderBySeqAsc(100L)).thenAnswer(inv -> List.copyOf(stored));
        lenient().when(runRepository.findByIdForUpdate(100L)).thenAnswer(inv -> Optional.of(run));
        lenient().when(dossiers.existsById(anyLong())).thenAnswer(inv -> rows.containsKey(inv.<Long>getArgument(0)));
        lenient().when(dossiers.findById(anyLong())).thenAnswer(inv -> Optional.ofNullable(rows.get(inv.<Long>getArgument(0))));
        lenient().when(dossiers.findByIdForUpdate(anyLong())).thenAnswer(inv -> Optional.ofNullable(rows.get(inv.<Long>getArgument(0))));
        lenient().when(dossiers.saveAndFlush(any())).thenAnswer(inv -> {
            MissionDossier row = inv.getArgument(0);
            rows.put(row.getRunId(), row);
            return row;
        });
        lenient().when(sealRepository.save(any())).thenAnswer(inv -> {
            seals.add(inv.getArgument(0));
            return inv.getArgument(0);
        });
        lenient().when(sealRepository.findTopByRunIdOrderBySeqDesc(100L))
            .thenAnswer(inv -> seals.isEmpty() ? Optional.empty() : Optional.of(seals.getLast()));
        lenient().when(sealRepository.existsByRunIdAndSeq(anyLong(), anyInt()))
            .thenAnswer(inv -> seals.stream().anyMatch(s -> s.getSeq().equals(inv.getArgument(1))));
        lenient().when(textRepository.save(any())).thenAnswer(inv -> {
            MissionDossierText text = inv.getArgument(0);
            if (!texts.contains(text)) texts.add(text);
            return text;
        });
        lenient().when(textRepository.existsByRunIdAndHash(anyLong(), anyString()))
            .thenAnswer(inv -> texts.stream().anyMatch(t -> t.getHash().equals(inv.getArgument(1))));
        lenient().when(textRepository.findByRunIdOrderByIdAsc(100L)).thenAnswer(inv -> List.copyOf(texts));
        lenient().when(textRepository.findByRunIdAndHash(anyLong(), anyString()))
            .thenAnswer(inv -> texts.stream().filter(t -> t.getHash().equals(inv.getArgument(1))).findFirst());
        lenient().when(textRepository.findFirstByRunIdAndKindAndBody(anyLong(), anyString(), anyString()))
            .thenAnswer(inv -> texts.stream().filter(t -> t.getRunId().equals(inv.getArgument(0)) && t.getKind().equals(inv.getArgument(1))
                && inv.getArgument(2).equals(t.getBody())).findFirst());
        lenient().when(textRepository.existsByRunIdAndPersonAndKind(anyLong(), anyString(), anyString()))
            .thenAnswer(inv -> texts.stream().anyMatch(t -> t.getRunId().equals(inv.getArgument(0))
                && inv.getArgument(1).equals(t.getPerson()) && t.getKind().equals(inv.getArgument(2))));
        lenient().when(textRepository.findByPersonAndBodyIsNotNull(anyString()))
            .thenAnswer(inv -> texts.stream().filter(t -> inv.getArgument(0).equals(t.getPerson()) && t.getBody() != null).toList());
        lenient().when(repository.existsByRunIdAndTypeAndActorKind(anyLong(), anyString(), anyString()))
            .thenAnswer(inv -> stored.stream().anyMatch(e -> e.getType().equals(inv.getArgument(1))
                && e.getActorKind().equals(inv.getArgument(2))));
        // Un seul espace ici : l'identifiant d'une personne se range par son compte.
        lenient().when(people.findByWorkspaceIdAndUserId(anyLong(), anyLong()))
            .thenAnswer(inv -> Optional.ofNullable(persons.get(inv.<Long>getArgument(1))));
        lenient().when(people.findByUserId(anyLong()))
            .thenAnswer(inv -> Optional.ofNullable(persons.get(inv.<Long>getArgument(0))).stream().toList());
        lenient().when(people.findByWorkspaceIdAndPerson(anyLong(), anyString()))
            .thenAnswer(inv -> persons.values().stream().filter(p -> p.getPerson().equals(inv.getArgument(1))).findFirst());
        lenient().when(people.saveAndFlush(any())).thenAnswer(inv -> {
            MissionPerson person = inv.getArgument(0);
            persons.put(person.getUserId(), person);
            return person;
        });
        // Comme INSERT ... ON CONFLICT DO NOTHING : un identifiant déjà tiré reste (R159 de #551, quatrième tour, d-b).
        lenient().when(people.drawIfAbsent(anyLong(), anyLong(), anyString(), any())).thenAnswer(inv -> persons.putIfAbsent(
            inv.getArgument(1), MissionPerson.builder().workspaceId(inv.getArgument(0)).userId(inv.getArgument(1))
                .person(inv.getArgument(2)).createdAt(inv.getArgument(3)).build()) == null ? 1 : 0);
        lenient().doAnswer(inv -> {
            inv.<List<MissionPerson>>getArgument(0).forEach(p -> persons.remove(p.getUserId()));
            return null;
        }).when(people).deleteAll(any());
    }

    /** Le texte gardé à côté de la chaîne, de cette sorte, et l'empreinte salée que la chaîne en porte. */
    private MissionDossierText text(String kind) {
        return texts.stream().filter(t -> t.getKind().equals(kind)).findFirst().orElseThrow();
    }

    private static final String PERSON = "who:[0-9a-f]{32}";

    private static RulesBundle rules() {
        return new RulesBundle("taskforce-rules/1", "acme", 12L, 3, DIGEST, null, List.of(), null,
            List.of(new RulesBundle.Layer("project", "12", 3, "sha256:" + "b".repeat(64))));
    }

    private JsonNode data(int index) throws Exception {
        return JSON.readTree(stored.get(index).getData());
    }

    private JsonNode file() throws Exception {
        return JSON.readTree(service.dossierJson(100L).orElseThrow());
    }

    private void startAndAct() {
        service.append(run, "mission.started", MissionEvidenceService.Actor.SERVER, Map.of("issue", "WEB-12"));
        service.append(run, "action.decided", new MissionEvidenceService.Actor("rule", "read-files"),
            Map.of("tool", "Read", "effect", "allow", "text", "src/app.ts"));
    }

    private static RunnerEventsRequest.Event numbered(int n, String kind, String text) {
        return new RunnerEventsRequest.Event(kind, null, text, null, null, n, null, null, null, null, null, null);
    }

    @Nested
    @DisplayName("la demande telle qu'elle part")
    class Opening {

        @Test
        @DisplayName("mission.started porte tout l'en-tête, la demande par l'empreinte de ses textes, d'où elle vient et qui en répond")
        void the_start_carries_the_request() throws Exception {
            when_layer_author("carol@taskforce.dev");

            service.open(run, rules(), "tf-runner-ada", Map.of());

            JsonNode started = data(0);
            assertThat(stored.getFirst().getType()).isEqualTo("mission.started");
            assertThat(started.get("mission").asLong()).isEqualTo(100L);
            assertThat(started.get("workspace").asText()).isEqualTo("acme");
            assertThat(started.get("project").asLong()).isEqualTo(12L);
            assertThat(started.get("issue").asText()).isEqualTo("WEB-12");
            // R159, M6 : chaque personne entre par son identifiant opaque, le même partout où elle apparaît.
            String adaId = persons.get(7L).getPerson();
            assertThat(adaId).matches(PERSON);
            assertThat(started.get("requestedBy").asText()).isEqualTo(adaId);
            assertThat(started.get("accountable").asText()).isEqualTo(adaId);
            assertThat(started.get("delegatedAt").asText()).isEqualTo("2026-11-22T08:00:00.000Z");
            assertThat(started.get("origin").get("channel").asText()).isEqualTo("mcp");
            assertThat(started.get("agent").get("model").asText()).isEqualTo("claude-sonnet-5");
            assertThat(started.get("rules").get("layers").get(0).get("author").asText()).isEqualTo(persons.get(9L).getPerson());
            // Les faits que le runner rapportera viennent du poste de l'agent (R159, M5).
            assertThat(started.get("runnerFacts").asText()).isEqualTo("agent-machine");
            JsonNode request = started.get("request");
            assertThat(request.get("reporter").asText()).isEqualTo(persons.get(8L).getPerson());
            assertThat(request.get("createdAt").asText()).isEqualTo("2026-11-20T09:30:00.000Z");
            // Le texte n'entre pas dans la chaîne : son empreinte salée, sa longueur ; il vit à côté, avec son sel.
            MissionDossierText title = text("title");
            assertThat(title.getSalt()).matches("[0-9a-f]{32}");
            assertThat(request.get("title").get("sha256").asText()).isEqualTo(EvidenceChain.sha256(title.getSalt() + "Fix the footer"))
                .isNotEqualTo(EvidenceChain.sha256("Fix the footer"));
            assertThat(request.get("title").get("chars").asInt()).isEqualTo(14);
            assertThat(stored.getFirst().getData()).doesNotContain("Fix the footer").doesNotContain("old site")
                .doesNotContain("@taskforce.dev");
            // Puis une note par personne : son identifiant, son courriel et son nom par leur empreinte, effaçables avec elle.
            assertThat(stored).extracting(DeliveryRunEvidence::getType).containsExactly("mission.started", "note", "note", "note");
            assertThat(data(1).get("kind").asText()).isEqualTo("person");
            assertThat(data(1).get("person").asText()).isEqualTo(adaId);
            assertThat(data(1).get("email").get("sha256").asText()).isEqualTo(EvidenceChain.sha256(text("email").getSalt() + "ada@taskforce.dev"));
            assertThat(data(1).get("name").get("sha256").asText()).isEqualTo(EvidenceChain.sha256(text("name").getSalt() + "Ada Lovelace"));
            assertThat(data(2).get("person").asText()).isEqualTo(persons.get(8L).getPerson());
            assertThat(data(3).get("person").asText()).isEqualTo(persons.get(9L).getPerson());
            assertThat(stored.stream().map(DeliveryRunEvidence::getData).toList()).noneMatch(d -> d.contains("@taskforce.dev"));
            assertThat(texts).extracting(MissionDossierText::getKind).containsExactly("title", "description", "email", "name", "email", "email");
            assertThat(texts).filteredOn(t -> "email".equals(t.getKind())).extracting(MissionDossierText::getPerson)
                .containsExactly(adaId, persons.get(8L).getPerson(), persons.get(9L).getPerson());
            // La copie du paquet que le dossier garde porte son empreinte à elle, celle que la chaîne porte (R159, second tour, N3).
            JsonNode copy = JSON.readTree(rows.get(100L).getRulesBundle());
            assertThat(copy.get("digest").asText()).isEqualTo(com.taskforce.tf_api.core.harness.rules.RulesDigest.of(copy))
                .isEqualTo(started.get("rules").get("digest").asText());
        }

        private void when_layer_author(String email) {
            lenient().when(ruleSets.findByWorkspaceIdAndVersion(3L, 3))
                .thenReturn(Optional.of(HarnessRuleSet.builder().version(3).createdBy(User.builder().id(9L).email(email).build()).build()));
        }

        @Test
        @DisplayName("un paquet qui nomme ses propriétaires par leur identifiant : le dossier le garde tel que le runner l'a reçu, "
            + "empreinte comprise, et présente chaque propriétaire")
        void a_bundle_named_by_ids_is_kept_as_the_runner_received_it() throws Exception {
            lenient().when(users.findById(7L)).thenReturn(Optional.of(ada));
            // Carol n'a ni délégué ni écrit l'issue : elle n'entre au dossier que comme propriétaire d'une règle.
            User carol = User.builder().id(9L).email("carol@taskforce.dev").displayName("Carol").build();
            lenient().when(users.findById(9L)).thenReturn(Optional.of(carol));
            String ada7 = service.personId(3L, ada);
            String carol9 = service.personId(3L, carol);
            // La couche de Carol telle qu'elle est gardée depuis la 1.18 : son propriétaire par son identifiant.
            Map<String, Object> layerRule = new java.util.LinkedHashMap<>();
            layerRule.put("id", "ledger");
            layerRule.put("effect", "ask");
            layerRule.put("owner", carol9);
            layerRule.put("require", Map.of("approvers", List.of("role:admin")));
            String layerDigest = com.taskforce.tf_api.core.harness.rules.HarnessRulesService.digestOf(List.of(layerRule));
            lenient().when(ruleSets.findByWorkspaceIdAndVersion(3L, 3)).thenReturn(Optional.of(HarnessRuleSet.builder().version(3)
                .createdBy(carol).rules(List.of(layerRule)).build()));
            RulesBundle.Rule table = new RulesBundle.Rule("read-files", new RulesBundle.Condition("file.read", null, null, null, null,
                null, null, null), "read", "allow", null, ada7, "Reading changes nothing.", "2027-01-01");
            RulesBundle.Rule ledger = new RulesBundle.Rule("ledger", new RulesBundle.Condition("file.write", null, null, "**/ledger/**",
                null, null, null, null), "reversible-exit", "ask", null, carol9, "Ask Carol first.", "2027-01-01", "workspace",
                "Ask Carol first.", new RulesBundle.Require(List.of("role:admin"), 1, false));
            RulesBundle unsigned = new RulesBundle("taskforce-rules/1", "acme", 12L, 3, null, null, List.of(ledger, table), null,
                List.of(new RulesBundle.Layer("workspace", null, 3, layerDigest)));
            String digest = com.taskforce.tf_api.core.harness.rules.RulesDigest.of(JSON.valueToTree(unsigned));
            RulesBundle live = new RulesBundle("taskforce-rules/1", "acme", 12L, 3, digest, null, List.of(ledger, table), null,
                List.of(new RulesBundle.Layer("workspace", null, 3, layerDigest)));

            service.open(run, live, "tf-runner-ada", Map.of());

            JsonNode copy = JSON.readTree(rows.get(100L).getRulesBundle());
            // Le même paquet, membre pour membre : la copie ne réécrit rien.
            assertThat(CanonicalJson.of(copy)).isEqualTo(CanonicalJson.of(JSON.valueToTree(live)));
            assertThat(copy.get("digest").asText()).isEqualTo(digest).isEqualTo(data(0).get("rules").get("digest").asText());
            // Rien de récrit : une seule empreinte, celle du runner (d-a).
            assertThat(data(0).get("rules").has("issuedDigest")).isFalse();
            assertThat(data(0).get("rules").has("rewritten")).isFalse();
            assertThat(copy.get("layers").get(0).get("digest").asText()).isEqualTo(layerDigest);
            // Ada a délégué, Bob a écrit l'issue, Carol répond d'une règle : chacun est présenté par sa note, une fois.
            assertThat(stored.stream().filter(e -> e.getData().contains("\"kind\":\"person\"")).map(e -> e.getData()))
                .hasSize(3).anySatisfy(note -> assertThat(note).contains(ada7)).anySatisfy(note -> assertThat(note).contains(carol9));
        }

        @Test
        @DisplayName("R159 de #551, quatrième tour, d-a : un paquet d'aujourd'hui dont une règle nomme un approbateur par son compte ; "
            + "le dossier le récrit, garde l'empreinte que le runner a vérifiée, et dit ce qu'il a récrit")
        void a_rewritten_bundle_keeps_the_runner_s_digest() throws Exception {
            User carol = User.builder().id(9L).email("carol@taskforce.dev").displayName("Carol").build();
            lenient().when(users.findById(9L)).thenReturn(Optional.of(carol));
            String carol9 = service.personId(3L, carol);
            RulesBundle.Rule ledger = new RulesBundle.Rule("ledger", new RulesBundle.Condition("file.write", null, null, "**/ledger/**",
                null, null, null, null), "reversible-exit", "ask", null, carol9, "Ask Carol first.", "2027-01-01", "workspace",
                "Ask Carol first.", new RulesBundle.Require(List.of("person:9"), 1, false));
            RulesBundle unsigned = new RulesBundle("taskforce-rules/1", "acme", 12L, 3, null, null, List.of(ledger), null, null);
            String digest = com.taskforce.tf_api.core.harness.rules.RulesDigest.of(JSON.valueToTree(unsigned));
            RulesBundle live = new RulesBundle("taskforce-rules/1", "acme", 12L, 3, digest, null, List.of(ledger), null, null);

            service.open(run, live, "tf-runner-ada", Map.of());

            JsonNode copy = JSON.readTree(rows.get(100L).getRulesBundle());
            JsonNode rules = data(0).get("rules");
            assertThat(copy.get("rules").get(0).get("require").get("approvers")).extracting(JsonNode::asText).containsExactly(carol9);
            assertThat(rules.get("digest").asText()).isEqualTo(copy.get("digest").asText()).isNotEqualTo(digest);
            // L'empreinte que le runner a vérifiée n'était nulle part : elle reste, avec ce qui a été récrit.
            assertThat(rules.get("issuedDigest").asText()).isEqualTo(digest);
            assertThat(rules.get("rewritten")).extracting(JsonNode::asText).containsExactly("approvers");
        }

        @Test
        @DisplayName("R159 second tour, N3 : la copie d'un paquet d'avant la 1.18 nomme chaque personne par son identifiant ; ses "
            + "empreintes se calculent sur elle")
        void the_rules_copy_names_people_by_their_id() throws Exception {
            User bob = User.builder().id(8L).email("bob@taskforce.dev").createdAt(java.time.LocalDateTime.of(2026, 9, 1, 9, 0)).build();
            lenient().when(users.findAllByEmailIgnoreCase("ada@taskforce.dev")).thenReturn(List.of(ada));
            lenient().when(users.findAllByEmailIgnoreCase("bob@taskforce.dev")).thenReturn(List.of(bob));
            lenient().when(users.findById(8L)).thenReturn(Optional.of(bob));
            // La couche de Bob telle qu'elle est gardée : ses règles nomment leur propriétaire par son courriel.
            Map<String, Object> layerRule = new java.util.LinkedHashMap<>();
            layerRule.put("id", "ledger");
            layerRule.put("effect", "ask");
            layerRule.put("owner", "bob@taskforce.dev");
            layerRule.put("require", Map.of("approvers", List.of("person:8")));
            lenient().when(ruleSets.findByWorkspaceIdAndVersion(3L, 3)).thenReturn(Optional.of(HarnessRuleSet.builder().version(3)
                .createdBy(bob).createdAt(java.time.LocalDateTime.of(2026, 10, 1, 9, 0)).rules(List.of(layerRule)).build()));
            RulesBundle.Rule table = new RulesBundle.Rule("read-files", new RulesBundle.Condition("file.read", null, null, null, null,
                null, null, null), "reversible", "allow", null, "ada@taskforce.dev", "Reading changes nothing.", "2027-01-01");
            RulesBundle.Rule ledger = new RulesBundle.Rule("ledger", new RulesBundle.Condition("file.write", null, null, "**/ledger/**",
                null, null, null, null), "reversible", "ask", null, "bob@taskforce.dev", "Ask Bob first.", "2027-01-01", "person",
                "Ask Bob first.", new RulesBundle.Require(List.of("person:8", "role:admin"), 1, false));
            String liveLayerDigest = "sha256:" + "b".repeat(64);
            RulesBundle live = new RulesBundle("taskforce-rules/1", "acme", 12L, 3, DIGEST, null, List.of(table, ledger), null,
                List.of(new RulesBundle.Layer("person", "8", 3, liveLayerDigest)));
            String before = JSON.writeValueAsString(live);

            service.open(run, live, "tf-runner-ada", Map.of());

            JsonNode copy = JSON.readTree(rows.get(100L).getRulesBundle());
            String ada7 = persons.get(7L).getPerson();
            String bob8 = persons.get(8L).getPerson();
            assertThat(copy.toString()).doesNotContain("@").doesNotContain("person:");
            // Un courriel hors de toute version ne nomme personne : rien ne montre que le compte qui le porte l'avait déjà
            // (R159 de #551, quatrième tour, d-c). Celui d'une règle de la couche de Bob, si : son compte est plus ancien.
            assertThat(copy.get("rules").get(0).get("owner").asText()).isEqualTo("who:unknown").isNotEqualTo(ada7);
            assertThat(copy.get("rules").get(1).get("owner").asText()).isEqualTo(bob8);
            assertThat(copy.get("rules").get(1).get("require").get("approvers")).extracting(JsonNode::asText).containsExactly(bob8, "role:admin");
            assertThat(copy.get("layers").get(0).get("ref").asText()).isEqualTo(bob8);
            // L'empreinte du paquet, celle que la chaîne porte, se calcule sur la copie ; celle de la couche aussi, sur ses
            // règles nommées comme le dossier les nomme : aucune ne confirme un courriel une fois effacé.
            assertThat(copy.get("digest").asText()).isEqualTo(com.taskforce.tf_api.core.harness.rules.RulesDigest.of(copy))
                .isNotEqualTo(DIGEST).isEqualTo(data(0).get("rules").get("digest").asText());
            // L'empreinte que le runner a vérifiée reste dans la chaîne, avec ce qui a été récrit (R159 de #551, d-a).
            assertThat(data(0).get("rules").get("issuedDigest").asText()).isEqualTo(DIGEST);
            assertThat(data(0).get("rules").get("rewritten")).extracting(JsonNode::asText)
                .containsExactly("approvers", "owners", "person-layer");
            String layerDigest = copy.get("layers").get(0).get("digest").asText();
            assertThat(layerDigest).isNotEqualTo(liveLayerDigest).isEqualTo(data(0).get("rules").get("layers").get(0).get("digest").asText());
            assertThat(data(0).get("rules").get("layers").get(0).get("ref").asText()).isEqualTo(bob8);
            // Chaque personne que la copie nomme est présentée au dossier ; les règles vivantes gardent leur forme.
            assertThat(stored.stream().filter(e -> e.getData().contains("\"kind\":\"person\""))).hasSize(2);
            assertThat(JSON.writeValueAsString(live)).isEqualTo(before);
        }

        @Test
        @DisplayName("sans runner, rien ne dit d'où viennent ses faits : il n'en rapporte pas")
        void without_a_runner_there_are_no_runner_facts() throws Exception {
            service.open(run, rules(), null, Map.of());

            assertThat(data(0).has("runnerFacts")).isFalse();
        }

        @Test
        @DisplayName("une reprise garde la mission qu'elle continue")
        void a_follow_up_names_what_it_continues() throws Exception {
            service.open(run, rules(), "tf-runner-ada", Map.of("followUpOf", 99L, "comments", 2));

            assertThat(data(0).get("followUpOf").asLong()).isEqualTo(99L);
        }
    }

    @Nested
    @DisplayName("un trou se voit")
    class Gaps {

        @Test
        @DisplayName("un numéro déjà reçu n'est gardé ni au dossier ni à la chronologie ; un numéro qui saute laisse sa marque")
        void a_lost_batch_leaves_a_mark() throws Exception {
            assertThat(service.runnerEvent(run, numbered(1, "tool", "Read src/a.ts"))).isTrue();
            assertThat(service.runnerEvent(run, numbered(2, "tool", "Read src/b.ts"))).isTrue();
            // Le lot 1-2 renvoyé après une réponse perdue.
            assertThat(service.runnerEvent(run, numbered(2, "tool", "Read src/b.ts"))).isFalse();
            // Les événements 3 et 4 ne sont jamais arrivés.
            assertThat(service.runnerEvent(run, numbered(5, "tool", "Edit src/c.ts"))).isTrue();

            assertThat(stored).hasSize(4);
            JsonNode gap = data(2);
            assertThat(stored.get(2).getType()).isEqualTo("note");
            assertThat(stored.get(2).getActorKind()).isEqualTo("server");
            assertThat(gap.get("kind").asText()).isEqualTo("gap");
            assertThat(gap.get("from").asInt()).isEqualTo(3);
            assertThat(gap.get("to").asInt()).isEqualTo(4);
            assertThat(gap.get("text").asText()).isEqualTo("Events 3 to 4 from the runner never arrived.");
            assertThat(run.getEvidenceRunnerSeq()).isEqualTo(5);
        }

        @Test
        @DisplayName("à la fin, les événements que le runner a numérotés et qui ne sont pas arrivés se marquent aussi")
        void the_last_lost_events_are_marked_at_the_end() throws Exception {
            service.runnerEvent(run, numbered(1, "tool", "Read src/a.ts"));

            service.runnerReport(run, new RunnerResultRequest("DONE", "done", null, null, null, null, null, null, null, 4,
                new RunnerResultRequest.Session("1b2c3d4e-0000-4000-8000-000000000001", "sha256:" + "d".repeat(64), 1200L), null));

            assertThat(data(1).get("kind").asText()).isEqualTo("gap");
            assertThat(data(1).get("text").asText()).isEqualTo("Events 2 to 4 from the runner never arrived.");
            JsonNode report = data(2);
            assertThat(report.get("kind").asText()).isEqualTo("runner");
            assertThat(report.get("sent").asInt()).isEqualTo(4);
            assertThat(report.get("received").asInt()).isEqualTo(1);
            assertThat(report.get("session").get("sha256").asText()).isEqualTo("sha256:" + "d".repeat(64));
        }

        @Test
        @DisplayName("un runner d'avant la 1.18 ne numérote pas : rien n'est compté")
        void an_older_runner_counts_nothing() {
            assertThat(service.runnerEvent(run, new RunnerEventsRequest.Event("tool", "Read", "src/a.ts"))).isTrue();
            assertThat(service.runnerEvent(run, new RunnerEventsRequest.Event("tool", "Read", "src/a.ts"))).isTrue();

            assertThat(stored).hasSize(2);
            assertThat(run.getEvidenceRunnerSeq()).isZero();
        }
    }

    @Nested
    @DisplayName("ce que le runner rapporte")
    class RunnerEvents {

        @Test
        @DisplayName("ce que l'agent raconte et le brief n'entrent que par leur empreinte ; leur texte vit à côté")
        void conversation_enters_by_its_digest() throws Exception {
            service.runnerEvent(run, numbered(1, "text", "I will read the footer first."));
            service.runnerEvent(run, new RunnerEventsRequest.Event("brief", null, "The brief given to Claude Code", null, null, 2,
                null, null, null, "You are working on a task delegated from TaskForce: WEB-12", null, null));

            assertThat(stored.get(0).getData()).doesNotContain("footer");
            assertThat(data(0).get("text").get("sha256").asText())
                .isEqualTo(EvidenceChain.sha256(text("text").getSalt() + "I will read the footer first."));
            assertThat(data(1).get("brief").get("sha256").asText())
                .isEqualTo(EvidenceChain.sha256(text("brief").getSalt() + "You are working on a task delegated from TaskForce: WEB-12"));
            assertThat(texts).extracting(MissionDossierText::getKind).containsExactly("text", "brief");
        }

        @Test
        @DisplayName("R159, M6 : le même texte dans un dossier garde son sel ; dans un autre dossier, il en tire un autre")
        void a_salt_is_drawn_once_per_text_and_dossier() throws Exception {
            service.runnerEvent(run, numbered(1, "text", "Done."));
            service.runnerEvent(run, numbered(2, "text", "Done."));
            rows.put(101L, MissionDossier.builder().runId(101L).build());

            Map<String, Object> other = service.ref(101L, "text", "Done.");

            assertThat(data(1).get("text")).isEqualTo(data(0).get("text"));
            // La référence de l'autre dossier n'est nommée par aucun événement : son texte n'est pas gardé (R159, second tour, N1).
            assertThat(texts).hasSize(1);
            assertThat(other.get("sha256")).isNotEqualTo(data(0).get("text").get("sha256").asText());
        }

        @Test
        @DisplayName("R159, L5 : le modèle configuré et ceux que les réponses ont nommés, à côté du modèle retenu")
        void the_agent_keeps_the_configured_and_the_served_models() throws Exception {
            service.runnerEvent(run, new RunnerEventsRequest.Event("agent", null, "Claude Code 2.1.300", null, null, 1, null, null,
                null, null, new RunnerEventsRequest.Agent("2.1.300", "claude-sonnet-5-20261001", "1b2c3d4e", "amazon-bedrock",
                    "sonnet", List.of("claude-sonnet-5-20261001", " ", "claude-haiku-5-20261001")), null));

            JsonNode agent = data(0);
            assertThat(agent.get("provider").asText()).isEqualTo("amazon-bedrock");
            assertThat(agent.get("configured").asText()).isEqualTo("sonnet");
            assertThat(agent.get("served")).extracting(JsonNode::asText)
                .containsExactly("claude-sonnet-5-20261001", "claude-haiku-5-20261001");
        }

        @Test
        @DisplayName("R159, M5 : des tests dont la branche a changé la définition le disent")
        void the_tests_say_when_the_branch_changed_their_definition() throws Exception {
            service.runnerEvent(run, new RunnerEventsRequest.Event("test", "npm test", "Tests passed: `npm test` (4 s).", null, null, 1,
                null, null, null, null, null, new RunnerEventsRequest.Test("npm test", true, true, 42, 42,
                    "sha256:" + "1".repeat(64), 5000L, true, List.of("package.json", " ", "vitest.config.ts"))));

            assertThat(data(0).get("definitionChanged")).extracting(JsonNode::asText).containsExactly("package.json", "vitest.config.ts");
        }

        @Test
        @DisplayName("R159 second tour, L-b : la liste que le runner a regardée, et le réglage de test du projet changé pendant la mission")
        void the_tests_say_what_the_runner_looked_at() throws Exception {
            run.getIssue().getProject().setTestCommand("npm run test:ci");

            service.runnerEvent(run, new RunnerEventsRequest.Event("test", "npm test", "Tests passed: `npm test` (4 s).", null, null, 1,
                null, null, null, null, null, new RunnerEventsRequest.Test("npm test", true, true, 42, 42,
                    "sha256:" + "1".repeat(64), 5000L, true, null, List.of("package.json", "vitest.config.ts"))));

            assertThat(data(0).get("definitions")).extracting(JsonNode::asText).containsExactly("package.json", "vitest.config.ts");
            assertThat(data(0).get("definitionChanged")).extracting(JsonNode::asText).containsExactly(MissionEvidenceService.TEST_SETTING);
            String md = service.dossierMarkdown(100L).orElseThrow();
            assertThat(md).contains("changed during the mission (the project's test command in TaskForce)");
        }

        @Test
        @DisplayName("R159 second tour, L-b : rien de changé, le Markdown dit une liste, jamais que les tests sont les mêmes")
        void nothing_changed_is_said_as_a_list() throws Exception {
            service.runnerEvent(run, new RunnerEventsRequest.Event("test", "npm test", "Tests passed: `npm test` (4 s).", null, null, 1,
                null, null, null, null, null, new RunnerEventsRequest.Test("npm test", true, true, 42, 42,
                    "sha256:" + "1".repeat(64), 5000L, true, null, List.of("package.json"))));

            assertThat(data(0).has("definitionChanged")).isFalse();
            assertThat(service.dossierMarkdown(100L).orElseThrow()).contains("None of these files, which define how the tests run, changed: `package.json`")
                .contains("not a proof that the tests are the same");
        }

        @Test
        @DisplayName("R159 second tour, L-c : le dossier dit que le fournisseur est celui de la configuration du lancement")
        void the_provider_is_the_launch_configuration() throws Exception {
            service.runnerEvent(run, new RunnerEventsRequest.Event("agent", null, "Claude Code 2.1.300", null, null, 1, null, null,
                null, null, new RunnerEventsRequest.Agent("2.1.300", "claude-sonnet-5-20261001", "1b2c3d4e", "another-endpoint",
                    "sonnet", List.of(), "launch-configuration"), null));

            assertThat(data(0).get("providerFrom").asText()).isEqualTo("launch-configuration");
            assertThat(data(0).has("providerUnread")).isFalse();
        }

        @Test
        @DisplayName("R159 troisième tour, c-a : le dossier dit ce que le runner ne lit pas, le registre et les réglages du serveur")
        void the_record_says_what_the_runner_does_not_read() throws Exception {
            service.runnerEvent(run, new RunnerEventsRequest.Event("agent", null, "Claude Code 2.1.300", null, null, 1, null, null,
                null, null, new RunnerEventsRequest.Agent("2.1.300", "claude-sonnet-5-20261001", "1b2c3d4e", "anthropic",
                    "sonnet", List.of(), "launch-configuration", List.of("windows-registry", "server-managed-settings")), null));

            assertThat(data(0).get("providerUnread")).extracting(JsonNode::asText)
                .containsExactly("windows-registry", "server-managed-settings");
        }

        @Test
        @DisplayName("l'agent réellement lancé : sa version, son modèle, sa session")
        void the_agent_that_ran() throws Exception {
            service.runnerEvent(run, new RunnerEventsRequest.Event("agent", null, "Claude Code 2.1.300 with claude-sonnet-5-20261001",
                null, null, 1, null, null, null, null,
                new RunnerEventsRequest.Agent("2.1.300", "claude-sonnet-5-20261001", "1b2c3d4e", "anthropic"), null));

            JsonNode agent = data(0);
            assertThat(stored.getFirst().getActorKind()).isEqualTo("agent");
            assertThat(agent.get("kind").asText()).isEqualTo("agent");
            assertThat(agent.get("version").asText()).isEqualTo("2.1.300");
            assertThat(agent.get("model").asText()).isEqualTo("claude-sonnet-5-20261001");
            assertThat(agent.get("provider").asText()).isEqualTo("anthropic");
            assertThat(agent.get("fingerprint").isNull()).isTrue();
        }

        @Test
        @DisplayName("une décision garde les faits jugés et l'action exacte : l'empreinte de l'entrée et du contenu écrit")
        void a_decision_keeps_its_facts_and_its_exact_action() throws Exception {
            String input = "sha256:" + "e".repeat(64);
            String content = "sha256:" + "f".repeat(64);
            service.runnerEvent(run, new RunnerEventsRequest.Event("decision", "Write", "src/footer.tsx", "allow", "write-sandbox-files", 1,
                List.of(Map.of("action", "file.write", "tool", "Write", "path", "src/footer.tsx")), input,
                new RunnerEventsRequest.Written("src/footer.tsx", content, 120L), null, null, null));

            JsonNode decision = data(0);
            assertThat(stored.getFirst().getActorId()).isEqualTo("write-sandbox-files");
            assertThat(decision.get("facts").get(0).get("path").asText()).isEqualTo("src/footer.tsx");
            assertThat(decision.get("input").asText()).isEqualTo(input);
            assertThat(decision.get("written").get("sha256").asText()).isEqualTo(content);
        }

        @Test
        @DisplayName("les tests : ce que le runner a lancé, leur résultat, et l'empreinte de leur sortie entière")
        void the_tests_keep_the_digest_of_their_output() throws Exception {
            service.runnerEvent(run, new RunnerEventsRequest.Event("test", "npm test", "Tests passed: `npm test` (4 s).", null, null, 1,
                null, null, null, null, null,
                new RunnerEventsRequest.Test("npm test", true, true, 42, 42, "sha256:" + "1".repeat(64), 5000L)));

            JsonNode test = data(0);
            assertThat(stored.getFirst().getType()).isEqualTo("test.result");
            assertThat(stored.getFirst().getActorKind()).isEqualTo("runner");
            assertThat(test.get("passed").asBoolean()).isTrue();
            assertThat(test.get("passedCount").asInt()).isEqualTo(42);
            assertThat(test.get("output").get("sha256").asText()).isEqualTo("sha256:" + "1".repeat(64));
            assertThat(test.get("output").get("kept").asText()).isEqualTo("runner");
        }

        @Test
        @DisplayName("une moitié de paire de substitution, coupée en route, entre en U+FFFD : la chaîne reste du I-JSON")
        void a_cut_surrogate_enters_as_a_replacement() throws Exception {
            service.runnerEvent(run, new RunnerEventsRequest.Event("tool", "Bash", "echo \uD83D"));

            assertThat(data(0).get("text").asText()).isEqualTo("echo �");
        }
    }

    @Nested
    @DisplayName("la fin, le sceau")
    class Sealing {

        @Test
        @DisplayName("la fin garde la liste de l'issue, clôt le dossier, pose sa racine et le scelle ; le sceau annonce la mission scellée")
        void the_end_seals_the_file() throws Exception {
            lenient().when(checklist.findByIssueIdOrderByPositionAscIdAsc(55L)).thenReturn(List.of(
                IssueChecklistItem.builder().id(1L).issueId(55L).content("Update the links").done(true).build(),
                IssueChecklistItem.builder().id(2L).issueId(55L).content("Add a test").done(false).build()));
            startAndAct();

            service.end(run, new DeliveryPoll(DeliveryRunStatus.DONE, "## What I did\nThe footer links.", null, null));

            assertThat(data(2).get("kind").asText()).isEqualTo("checklist");
            assertThat(data(2).get("items").get(0).get("done").asBoolean()).isTrue();
            assertThat(stored.getLast().getType()).isEqualTo("mission.ended");
            assertThat(data(3).get("summary").get("sha256").asText())
                .isEqualTo(EvidenceChain.sha256(text("summary").getSalt() + "## What I did\nThe footer links."));
            assertThat(run.getEvidenceRoot()).isEqualTo(stored.getLast().getHash());
            assertThat(seals).hasSize(1);
            assertThat(seals.getFirst().getSeq()).isEqualTo(4);
            assertThat(seals.getFirst().getRoot()).isEqualTo(run.getEvidenceRoot());
            ArgumentCaptor<MissionSealed> sealed = ArgumentCaptor.forClass(MissionSealed.class);
            verify(publisher).publishEvent(sealed.capture());
            // Le témoin écrit aussi la clé qui a scellé la tête (R159, second tour, N6).
            assertThat(sealed.getValue()).extracting(MissionSealed::runId, MissionSealed::root, MissionSealed::seq)
                .containsExactly(100L, run.getEvidenceRoot(), 4);
            assertThat(sealed.getValue().keyId()).isEqualTo(seals.getFirst().getKeyId());
        }

        @Test
        @DisplayName("un geste après la fin : à la suite de la chaîne, le sceau passe au dernier maillon, un sceau de plus, rien n'est réécrit (R139)")
        void a_gesture_after_the_end_moves_the_seal() {
            startAndAct();
            service.end(run, new DeliveryPoll(DeliveryRunStatus.DONE, "done", null, null));
            String sealed = run.getEvidenceRoot();
            String firstHash = stored.getFirst().getHash();

            service.appendAfterEnd(run, "human.decision", new MissionEvidenceService.Actor("person", "ada@taskforce.dev"),
                Map.of("decision", "APPLY", "where", "taskforce"));

            assertThat(run.getEvidenceRoot()).isNotEqualTo(sealed).isEqualTo(stored.getLast().getHash());
            assertThat(stored.getLast().getPrev()).isEqualTo(sealed);
            assertThat(stored.getFirst().getHash()).isEqualTo(firstHash);
            assertThat(seals).extracting(MissionDossierSeal::getSeq).containsExactly(3, 4);
            // Seul le sceau de la fin s'écrit chez le témoin.
            verify(publisher).publishEvent(any(MissionSealed.class));
        }

        @Test
        @DisplayName("sans sceau, un geste s'ajoute sans en poser un (mission encore en cours)")
        void a_gesture_during_the_mission_seals_nothing() {
            startAndAct();

            service.appendAfterEnd(run, "action.result", MissionEvidenceService.Actor.SERVER, Map.of("kind", "correction"));

            assertThat(run.getEvidenceRoot()).isNull();
            assertThat(seals).isEmpty();
            verify(publisher, never()).publishEvent(any());
        }

        @Test
        @DisplayName("R159 troisième tour, c-f : sa mission supprimée, le sceau tardif verrouille le dossier avant de chercher un sceau, ne dit pas qu'elle a fini, et la ligne Seal du Markdown dit le retard")
        void a_late_seal_of_a_deleted_mission_says_only_what_is_known() throws Exception {
            service.open(run, rules(), "tf-runner-ada", Map.of());
            lenient().when(runRepository.findByIdForUpdate(100L)).thenReturn(Optional.empty());
            run.setIssue(null);
            List<String> calls = new ArrayList<>();
            lenient().when(dossiers.findByIdForUpdate(100L)).thenAnswer(inv -> {
                calls.add("lock");
                return Optional.ofNullable(rows.get(100L));
            });
            lenient().when(sealRepository.findTopByRunIdOrderBySeqDesc(100L)).thenAnswer(inv -> {
                calls.add("sealed?");
                return seals.isEmpty() ? Optional.empty() : Optional.of(seals.getLast());
            });

            assertThat(service.sealLate(100L)).isTrue();

            // Deux serveurs qui démarrent ensemble : le second attend le verrou, puis trouve le sceau du premier.
            assertThat(calls).startsWith("lock", "sealed?");
            assertThat(data(stored.size() - 1).get("text").asText()).startsWith("TaskForce sealed this record late, on ")
                .contains(", after its mission was deleted: ").doesNotContain("had ended");
            assertThat(seals.getLast().isLate()).isTrue();
            assertThat(service.dossierMarkdown(100L).orElseThrow())
                .contains("- Seal: event " + seals.getLast().getSeq() + ", signed late by key `")
                .contains(": a late seal proves the chain as it was on that date, not what happened before.");
        }

        @Test
        @DisplayName("R159 de #551, quatrième tour, d-e : un dossier scellé tard sort du passage du témoin, et sa note dit qu'aucun commentaire n'est écrit pour lui")
        void a_late_seal_leaves_the_witness_pass() throws Exception {
            service.open(run, rules(), "tf-runner-ada", Map.of());
            lenient().when(runRepository.findByIdForUpdate(100L)).thenReturn(Optional.of(run));
            lenient().when(dossiers.findByIdForUpdate(100L)).thenAnswer(inv -> Optional.ofNullable(rows.get(100L)));
            lenient().when(sealRepository.findTopByRunIdOrderBySeqDesc(100L))
                .thenAnswer(inv -> seals.isEmpty() ? Optional.empty() : Optional.of(seals.getLast()));

            assertThat(service.sealLate(100L)).isTrue();

            assertThat(data(stored.size() - 1).get("text").asText()).contains(", after its mission had ended: ")
                .endsWith(" No comment is written in a pull request for it.");
            assertThat(seals.getLast().isLate()).isTrue();
            // Aucun témoin par décision : le passage régulier ne le relit plus.
            verify(dossiers).markWitnessed(100L);
            verify(publisher, never()).publishEvent(any(MissionSealed.class));
        }
    }

    @Nested
    @DisplayName("l'export")
    class Export {

        @Test
        @DisplayName("l'en-tête vient de la chaîne ; le paquet de règles, les textes et le sceau partent avec le dossier")
        void the_file_carries_everything() throws Exception {
            service.open(run, rules(), "tf-runner-ada", Map.of());
            service.runnerEvent(run, new RunnerEventsRequest.Event("agent", null, "Claude Code 2.1.300", null, null, 1, null, null,
                null, null, new RunnerEventsRequest.Agent("2.1.300", "claude-sonnet-5-20261001", null, "anthropic"), null));
            service.end(run, new DeliveryPoll(DeliveryRunStatus.DONE, "done", null, null));

            JsonNode file = file();

            assertThat(file.get("format").asText()).isEqualTo("taskforce-evidence/1");
            assertThat(file.get("mission").get("id").asLong()).isEqualTo(100L);
            assertThat(file.get("mission").get("workspace").asText()).isEqualTo("acme");
            assertThat(file.get("mission").get("agent").get("model").asText()).isEqualTo("claude-sonnet-5-20261001");
            assertThat(file.get("mission").get("agent").get("version").asText()).isEqualTo("2.1.300");
            assertThat(file.get("rules").get("digest").asText()).isEqualTo(com.taskforce.tf_api.core.harness.rules.RulesDigest.of(file.get("rules")))
                .isEqualTo(file.get("mission").get("rules").get("digest").asText());
            assertThat(file.get("mission").get("requestedBy").asText()).matches(PERSON);
            assertThat(file.get("mission").get("runnerFacts").asText()).isEqualTo("agent-machine");
            // Chaque texte part avec son sel : l'empreinte que la chaîne porte est le SHA-256 du sel suivi du texte (R159, M6).
            String title = file.get("events").get(0).get("data").get("request").get("title").get("sha256").asText();
            JsonNode kept = file.get("texts").get(title);
            assertThat(kept.get("text").asText()).isEqualTo("Fix the footer");
            assertThat(EvidenceChain.sha256(kept.get("salt").asText() + kept.get("text").asText())).isEqualTo(title);
            List<ObjectNode> events = new ArrayList<>();
            file.get("events").forEach(e -> events.add((ObjectNode) e));
            assertThat(EvidenceChain.firstBrokenLink(events)).isEqualTo(-1);
            EvidenceSeal.Opened seal = EvidenceSeal.open(file.get("seal"));
            assertThat(seal.valid()).isTrue();
            assertThat(seal.statement().get("predicate").get("root").asText()).isEqualTo(file.get("root").asText());
            assertThat(CanonicalJson.of(seal.statement().get("predicate").get("mission"))).isEqualTo(CanonicalJson.of(file.get("mission")));
            assertThat(service.envelope(100L).orElseThrow()).contains("\"payloadType\" : \"application/vnd.in-toto+json\"");
        }

        @Test
        @DisplayName("l'export ne lit ni la mission ni son issue : il se fait encore quand elles n'existent plus")
        void the_export_needs_neither_the_mission_nor_its_issue() throws Exception {
            service.open(run, rules(), "tf-runner-ada", Map.of());
            service.end(run, new DeliveryPoll(DeliveryRunStatus.DONE, "done", null, null));
            lenient().when(runRepository.findByIdForUpdate(100L)).thenReturn(Optional.empty());
            run.setIssue(null);

            JsonNode file = file();

            assertThat(file.get("mission").get("issue").asText()).isEqualTo("WEB-12");
            assertThat(EvidenceSeal.open(file.get("seal")).valid()).isTrue();
            // Le départ, une note par personne (Ada qui délègue, Bob qui a écrit l'issue), la fin.
            assertThat(service.dossierMarkdown(100L).orElseThrow()).contains("# Evidence of mission 100: WEB-12")
                .contains("- Seal: event 4, signed by key `sha256:");
        }

        @Test
        @DisplayName("un dossier d'avant la 1.18 : ce que la chaîne ne couvre pas vient de sa ligne, sauf qui a délégué")
        void an_older_dossier_takes_the_rest_from_its_row() throws Exception {
            startAndAct();

            JsonNode mission = file().get("mission");

            assertThat(mission.get("id").asLong()).isEqualTo(100L);
            assertThat(mission.get("workspace").asText()).isEqualTo("acme");
            assertThat(mission.get("issue").asText()).isEqualTo("WEB-12");
            // R159, M6 : pas de courriel lu dans la ligne de la personne, qui changerait avec elle et casserait le sceau.
            assertThat(mission.get("requestedBy").isNull()).isTrue();
            assertThat(service.dossierMarkdown(100L).orElseThrow()).contains("- Requested by: not in the chain");
        }

        @Test
        @DisplayName("R159 de #551, troisième tour (v-j, relecture de #552) : le Markdown d'un dossier d'avant la 1.18 masque aussi un courriel aux lettres non ASCII")
        void the_markdown_hides_emails_beyond_ascii() throws Exception {
            startAndAct();
            service.append(run, "human.decision", new MissionEvidenceService.Actor("person", "zoé.müller@bücher.example"),
                Map.of("decision", "ALLOWED"));
            service.append(run, "human.decision", new MissionEvidenceService.Actor("person", "ada@taskforce.dev"),
                Map.of("decision", "ALLOWED"));

            assertThat(service.legacy(100L)).isTrue();
            String md = service.dossierMarkdown(100L).orElseThrow();
            assertThat(md).doesNotContain("zoé").doesNotContain("müller").doesNotContain("bücher").doesNotContain("ada@taskforce.dev");
            assertThat(md.split("\\(email hidden\\)", -1)).hasSizeGreaterThanOrEqualTo(3);
        }

        @Test
        @DisplayName("R159, M6 : un dossier d'avant la 1.18, scellé, se vérifie encore après la purge de la personne qui a délégué")
        void an_older_sealed_dossier_still_checks_after_the_delegator_is_purged() throws Exception {
            startAndAct();
            service.end(run, new DeliveryPoll(DeliveryRunStatus.DONE, "done", null, null));
            rows.get(100L).setDelegatedBy(null);

            JsonNode file = file();

            EvidenceSeal.Opened seal = EvidenceSeal.open(file.get("seal"));
            assertThat(CanonicalJson.of(seal.statement().get("predicate").get("mission"))).isEqualTo(CanonicalJson.of(file.get("mission")));
        }

        @Test
        @DisplayName("un texte s'efface avec son sel : son empreinte reste, la chaîne tient, l'effacement entre au dossier, qui se scelle de nouveau")
        void a_text_is_erased_without_breaking_the_chain() throws Exception {
            service.open(run, rules(), "tf-runner-ada", Map.of());
            service.end(run, new DeliveryPoll(DeliveryRunStatus.DONE, "done", null, null));
            String title = text("title").getHash();

            service.eraseText(100L, title, ada);

            JsonNode file = file();
            assertThat(file.get("texts").has(title)).isFalse();
            assertThat(text("title").getBody()).isNull();
            assertThat(text("title").getSalt()).isNull();
            assertThat(stored.getLast().getType()).isEqualTo("human.decision");
            assertThat(stored.getLast().getActorId()).isEqualTo(persons.get(7L).getPerson());
            assertThat(data(stored.size() - 1).get("kind").asText()).isEqualTo("erased");
            assertThat(data(stored.size() - 1).get("text").asText()).isEqualTo(title);
            List<ObjectNode> events = new ArrayList<>();
            file.get("events").forEach(e -> events.add((ObjectNode) e));
            assertThat(EvidenceChain.firstBrokenLink(events)).isEqualTo(-1);
            assertThat(EvidenceSeal.open(file.get("seal")).statement().get("predicate").get("seq").asInt()).isEqualTo(stored.size());
            assertThatThrownBy(() -> service.eraseText(100L, title, ada)).isInstanceOf(BusinessException.class);
        }

        @Test
        @DisplayName("l'export se vérifie par recalcul, et une donnée changée en base se voit, au bon endroit")
        void the_export_checks_and_a_change_shows() {
            startAndAct();
            assertThat(EvidenceChain.firstBrokenLink(service.events(100L))).isEqualTo(-1);

            DeliveryRunEvidence second = stored.get(1);
            stored.set(1, DeliveryRunEvidence.builder().runId(100L).seq(2).at(second.getAt()).type(second.getType())
                .actorKind(second.getActorKind()).actorId(second.getActorId())
                .data(second.getData().replace("allow", "deny")).prev(second.getPrev()).hash(second.getHash()).build());

            assertThat(EvidenceChain.firstBrokenLink(service.events(100L))).isEqualTo(1);
            assertThat(service.dossierMarkdown(100L).orElseThrow()).contains("BROKEN at event 2");
        }

        @Test
        @DisplayName("un run sans dossier (v1, autre fournisseur) n'a ni export ni clôture")
        void no_evidence_no_file() {
            service.end(run, new DeliveryPoll(DeliveryRunStatus.DONE, "done", null, null));

            assertThat(stored).isEmpty();
            assertThat(run.getEvidenceRoot()).isNull();
            assertThat(service.dossierJson(100L)).isEmpty();
            assertThat(service.dossierMarkdown(100L)).isEmpty();
            assertThat(service.envelope(100L)).isEmpty();
        }
    }

    @Nested
    @DisplayName("les personnes, par un identifiant opaque (R159, M6)")
    class People {

        @Test
        @DisplayName("une personne qui agit entre par son identifiant ; la première fois dans un dossier, une note la présente")
        void a_person_who_acts_is_introduced_once() throws Exception {
            startAndAct();
            User linus = User.builder().id(8L).email("linus@taskforce.dev").displayName("Linus").build();

            MissionEvidenceService.Actor first = service.person(run, linus);
            MissionEvidenceService.Actor again = service.person(run, linus);

            assertThat(first.kind()).isEqualTo("person");
            assertThat(first.id()).matches(PERSON).isEqualTo(again.id());
            assertThat(stored).hasSize(3);
            assertThat(data(2).get("kind").asText()).isEqualTo("person");
            assertThat(data(2).get("person").asText()).isEqualTo(first.id());
            assertThat(stored.get(2).getData()).doesNotContain("linus").doesNotContain("Linus");
            assertThat(texts).extracting(MissionDossierText::getPerson).containsOnly(first.id());
            assertThat(service.person(run, null)).isEqualTo(new MissionEvidenceService.Actor("person", "unknown"));
        }

        @Test
        @DisplayName("deux personnes de même nom ne partagent pas leur texte : chacune s'efface seule")
        void two_people_with_the_same_name_keep_their_own_text() {
            startAndAct();

            service.person(run, User.builder().id(8L).email("linus@taskforce.dev").displayName("Linus").build());
            service.person(run, User.builder().id(9L).email("linus@example.com").displayName("Linus").build());

            assertThat(texts).filteredOn(t -> "name".equals(t.getKind())).extracting(MissionDossierText::getPerson)
                .containsExactly(persons.get(8L).getPerson(), persons.get(9L).getPerson());
        }

        @Test
        @DisplayName("le compte purgé : son courriel et son nom s'effacent de chaque dossier, la chaîne tient, le dossier se scelle de nouveau")
        void a_purged_account_is_forgotten() throws Exception {
            service.open(run, rules(), "tf-runner-ada", Map.of());
            service.end(run, new DeliveryPoll(DeliveryRunStatus.DONE, "done", null, null));
            String adaId = persons.get(7L).getPerson();
            int sealsBefore = seals.size();
            assertThat(file().toString()).contains("ada@taskforce.dev");

            assertThat(service.forgetPerson(7L)).isEqualTo(1);

            JsonNode file = file();
            assertThat(file.toString()).doesNotContain("ada@taskforce.dev").doesNotContain("Ada Lovelace").contains("bob@taskforce.dev");
            assertThat(texts).filteredOn(t -> adaId.equals(t.getPerson())).hasSize(2)
                .allMatch(t -> t.getBody() == null && t.getSalt() == null && t.getErasedAt() != null);
            JsonNode erased = data(stored.size() - 1);
            assertThat(erased.get("kind").asText()).isEqualTo("erased");
            assertThat(erased.get("person").asText()).isEqualTo(adaId);
            assertThat(erased.get("reason").asText()).isEqualTo("account-deleted");
            assertThat(erased.get("texts")).hasSize(2);
            List<ObjectNode> events = new ArrayList<>();
            file.get("events").forEach(e -> events.add((ObjectNode) e));
            assertThat(EvidenceChain.firstBrokenLink(events)).isEqualTo(-1);
            assertThat(seals).hasSize(sealsBefore + 1);
            assertThat(EvidenceSeal.open(file.get("seal")).valid()).isTrue();
            // Plus rien ne relie la personne à son identifiant ; qui n'est pas connu n'a rien à oublier.
            assertThat(persons).doesNotContainKey(7L);
            assertThat(service.forgetPerson(7L)).isZero();
            assertThat(service.forgetPerson(null)).isZero();
        }

        @Test
        @DisplayName("R159 troisième tour, c-g : le login GitHub de qui a fusionné s'efface avec le compte dont TaskForce le connaît, quelle que soit la casse")
        void the_merge_login_is_erased_with_the_account() throws Exception {
            service.open(run, rules(), "tf-runner-ada", Map.of());
            service.end(run, new DeliveryPoll(DeliveryRunStatus.DONE, "done", null, null));
            service.appendAfterEnd(run, "human.decision", new MissionEvidenceService.Actor("person", "github"),
                Map.of("decision", "MERGE", "where", "github", "by", service.text(run, "login", "Ada-GH")));
            lenient().when(textRepository.findByKindAndBodyIgnoreCase(anyString(), anyString()))
                .thenAnswer(inv -> texts.stream().filter(t -> t.getKind().equals(inv.getArgument(0)) && t.getBody() != null
                    && t.getBody().equalsIgnoreCase(inv.getArgument(1))).toList());
            MissionDossierText login = text("login");
            assertThat(file().toString()).contains("Ada-GH");

            assertThat(service.forgetPerson(7L, List.of(" ada-gh ", "ADA-GH"))).isEqualTo(1);

            assertThat(login.getBody()).isNull();
            assertThat(login.getSalt()).isNull();
            assertThat(login.getErasedAt()).isNotNull();
            assertThat(file().toString()).doesNotContain("Ada-GH");
            assertThat(data(stored.size() - 1).get("texts")).extracting(JsonNode::asText).contains(login.getHash());
        }

        @Test
        @DisplayName("R159 troisième tour, c-g : un dossier où la personne n'est que le login qui a fusionné : la note ne nomme aucun identifiant")
        void a_dossier_that_only_knows_the_login_names_no_id() throws Exception {
            service.open(run, rules(), "tf-runner-ada", Map.of());
            service.end(run, new DeliveryPoll(DeliveryRunStatus.DONE, "done", null, null));
            service.appendAfterEnd(run, "human.decision", new MissionEvidenceService.Actor("person", "github"),
                Map.of("decision", "MERGE", "where", "github", "by", service.text(run, "login", "linus-gh")));
            lenient().when(textRepository.findByKindAndBodyIgnoreCase(anyString(), anyString()))
                .thenAnswer(inv -> texts.stream().filter(t -> t.getKind().equals(inv.getArgument(0)) && t.getBody() != null
                    && t.getBody().equalsIgnoreCase(inv.getArgument(1))).toList());

            // Linus n'a jamais été présenté dans ce dossier : seul son login y est.
            assertThat(service.forgetPerson(9L, List.of("linus-gh"))).isEqualTo(1);

            JsonNode erased = data(stored.size() - 1);
            assertThat(erased.get("kind").asText()).isEqualTo("erased");
            assertThat(erased.has("person")).isFalse();
            assertThat(erased.get("texts")).extracting(JsonNode::asText).containsExactly(text("login").getHash());
        }
    }

    @Test
    @DisplayName("chaque événement porte l'empreinte du précédent, la chaîne part de l'empreinte nulle")
    void events_are_chained() {
        startAndAct();

        assertThat(stored).extracting(DeliveryRunEvidence::getSeq).containsExactly(1, 2);
        assertThat(stored.get(0).getPrev()).isEqualTo(EvidenceChain.ZERO_HASH);
        assertThat(stored.get(1).getPrev()).isEqualTo(stored.get(0).getHash());
        assertThat(stored.get(1).getData()).isEqualTo("{\"effect\":\"allow\",\"text\":\"src/app.ts\",\"tool\":\"Read\"}");
        assertThat(rows).containsKey(100L);
    }

    @Test
    @DisplayName("l'agent qui coche une ligne de la liste le déclare, au dossier de sa mission")
    void the_agent_declares_what_it_checks() throws Exception {
        startAndAct();

        service.checked(run, IssueChecklistItem.builder().id(1L).issueId(55L).content("Update the links").done(true).build());

        assertThat(stored.getLast().getActorKind()).isEqualTo("agent");
        assertThat(data(2).get("kind").asText()).isEqualTo("checklist.checked");
        assertThat(data(2).get("done").asBoolean()).isTrue();
    }

    @Test
    @DisplayName("le temps de cycle se lit dans la chaîne : la mission, et l'attente d'une personne demande par demande")
    void cycle_time_comes_from_the_chain() {
        List<ObjectNode> events = List.of(
            event("2026-10-28T10:00:00.000Z", "mission.started", Map.of()),
            event("2026-10-28T10:01:00.000Z", "action.decided", Map.of("approval", 9, "effect", "ask")),
            event("2026-10-28T10:03:30.000Z", "human.decision", Map.of("approval", 9, "decision", "ALLOWED")),
            event("2026-10-28T10:04:00.000Z", "action.decided", Map.of("approval", 10, "effect", "ask")),
            event("2026-10-28T10:14:00.000Z", "action.decided", Map.of("approval", 10, "effect", "deny")),
            event("2026-10-28T10:20:05.000Z", "mission.ended", Map.of("status", "DONE")));

        assertThat(MissionEvidenceService.durations(events))
            .isEqualTo("mission 20 min 5 s; waiting for a person 12 min 30 s (2 requests)");
    }

    private static ObjectNode event(String at, String type, Map<String, ?> data) {
        ObjectNode e = JSON.createObjectNode();
        e.put("at", at);
        e.put("type", type);
        e.set("data", JSON.valueToTree(data));
        return e;
    }

    @Test
    @DisplayName("plein, le dossier le dit par un dernier événement, puis ne garde plus rien")
    void a_full_file_says_so() {
        rows.put(100L, MissionDossier.builder().runId(100L).build());
        stored.add(DeliveryRunEvidence.builder().runId(100L).seq(MissionEvidenceService.MAX_EVENTS - 1).at("2026-10-28T10:00:00.000Z")
            .type("note").actorKind("agent").actorId("claude-code").data("{}").prev(EvidenceChain.ZERO_HASH)
            .hash("sha256:" + "b".repeat(64)).build());

        Optional<String> limit = service.append(run, "note", new MissionEvidenceService.Actor("agent", "claude-code"), Map.of("text", "x"));
        Optional<String> after = service.append(run, "note", new MissionEvidenceService.Actor("agent", "claude-code"), Map.of("text", "y"));

        assertThat(limit).isPresent();
        assertThat(stored.getLast().getType()).isEqualTo(MissionEvidenceService.LIMIT_REACHED);
        assertThat(stored.getLast().getActorKind()).isEqualTo("server");
        assertThat(after).isEmpty();
        assertThat(stored).hasSize(2);
    }
}
