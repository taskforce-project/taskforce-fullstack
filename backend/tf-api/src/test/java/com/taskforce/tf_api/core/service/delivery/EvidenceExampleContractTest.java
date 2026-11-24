package com.taskforce.tf_api.core.service.delivery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.taskforce.tf_api.core.dto.request.RunnerEventsRequest;
import com.taskforce.tf_api.core.dto.request.RunnerResultRequest;
import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.harness.evidence.CanonicalJson;
import com.taskforce.tf_api.core.harness.evidence.EvidenceChain;
import com.taskforce.tf_api.core.harness.evidence.EvidenceHeader;
import com.taskforce.tf_api.core.harness.evidence.EvidenceSeal;
import com.taskforce.tf_api.core.harness.evidence.EvidenceSigner;
import com.taskforce.tf_api.core.harness.rules.HarnessRulesService;
import com.taskforce.tf_api.core.harness.rules.RulesBundle;
import com.taskforce.tf_api.core.harness.rules.RulesDigest;
import com.taskforce.tf_api.core.harness.rules.RulesEngine;
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
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;

/**
 * L'exemple de {@code contracts/evidence/example-mission.json} : le dossier exporté d'une mission complète, écrit par le
 * vrai service, scellé par une clé tirée pour l'occasion (sa clé privée n'a pas été gardée). Le runner le vérifie
 * ({@code npm test}, {@code npm run verify}), la page de vérification le lit, et ce test le vérifie en Java : les deux
 * côtés lisent l'en-tête, le sceau et les décisions de la même façon. {@link #a_fresh_mission_exports_a_dossier_that_holds}
 * en écrit un neuf dans {@code target/example-mission.json}, de quoi refaire l'exemple quand le format change.
 */
@DisplayName("L'exemple du dossier exporté (contracts/evidence/example-mission.json)")
class EvidenceExampleContractTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    private static JsonNode example() throws IOException {
        Path dir = Path.of(System.getProperty("contracts.dir", "../../contracts"));
        return JSON.readTree(Files.readString(dir.resolve("evidence/example-mission.json"), StandardCharsets.UTF_8));
    }

    /** Tout ce qu'un tiers vérifie d'un dossier exporté, sans TaskForce. */
    static void holds(JsonNode file) throws Exception {
        List<ObjectNode> events = new ArrayList<>();
        file.get("events").forEach(e -> events.add((ObjectNode) e));
        // La chaîne, et sa tête.
        assertThat(EvidenceChain.firstBrokenLink(events)).isEqualTo(-1);
        assertThat(file.get("root").asText()).isEqualTo(events.getLast().get("hash").asText());
        // L'en-tête vient de la chaîne.
        EvidenceHeader.Projection projection = EvidenceHeader.of(events);
        assertThat(projection.covered()).containsAll(EvidenceHeader.FIELDS);
        for (String field : projection.covered()) {
            assertThat(CanonicalJson.of(file.get("mission").get(field))).as(field).isEqualTo(CanonicalJson.of(projection.header().get(field)));
        }
        // Les textes gardés à côté ont l'empreinte que la chaîne porte : celle de leur sel suivi du texte (R159, M6).
        file.get("texts").properties().forEach(text -> {
            assertThat(text.getValue().get("salt").asText()).matches("[0-9a-f]{32}");
            assertThat(EvidenceChain.sha256(text.getValue().get("salt").asText() + text.getValue().get("text").asText()))
                .isEqualTo(text.getKey());
        });
        // Aucune personne n'y entre par son courriel : son identifiant opaque, son courriel à côté ; le paquet de règles non
        // plus, ni par l'identifiant de son compte (R159, second tour, N3).
        assertThat(file.get("events").toString()).doesNotContain("@example.com");
        assertThat(file.get("rules").toString()).doesNotContain("@").doesNotContain("\"person:");
        assertThat(file.get("rules").get("rules").get(0).get("owner").asText()).matches("who:[0-9a-f]{32}");
        assertThat(file.get("mission").get("requestedBy").asText()).matches("who:[0-9a-f]{32}");
        assertThat(file.toString()).doesNotContain("\"person:");
        // Le paquet de règles est celui de la mission, et chaque décision se rejuge à l'identique.
        RulesBundle rules = JSON.treeToValue(file.get("rules"), RulesBundle.class);
        assertThat(RulesDigest.of(file.get("rules"))).isEqualTo(rules.digest()).isEqualTo(file.get("mission").get("rules").get("digest").asText());
        int judged = 0;
        for (ObjectNode event : events) {
            JsonNode data = event.get("data");
            if (!"action.decided".equals(event.get("type").asText()) || !"decision".equals(data.path("kind").asText())
                || !data.has("facts")) continue;
            List<Map<String, String>> facts = new ArrayList<>();
            data.get("facts").forEach(part -> {
                Map<String, String> one = new LinkedHashMap<>();
                part.properties().forEach(f -> one.put(f.getKey(), f.getValue().asText()));
                facts.add(one);
            });
            RulesEngine.Decision decision = RulesEngine.decideAll(rules, facts);
            assertThat(decision.effect()).isEqualTo(data.get("effect").asText());
            assertThat(decision.rule() == null ? "none" : decision.rule().id()).isEqualTo(event.get("actor").get("id").asText());
            judged++;
        }
        assertThat(judged).isPositive();
        // Le sceau : la signature tient, il couvre une tête de la chaîne, et l'en-tête du fichier.
        EvidenceSeal.Opened seal = EvidenceSeal.open(file.get("seal"));
        assertThat(seal.valid()).isTrue();
        JsonNode predicate = seal.statement().get("predicate");
        int seq = predicate.get("seq").asInt();
        assertThat(events.get(seq - 1).get("hash").asText()).isEqualTo(predicate.get("root").asText());
        assertThat(CanonicalJson.of(predicate.get("mission"))).isEqualTo(CanonicalJson.of(file.get("mission")));
    }

    @Test
    @DisplayName("l'exemple tient : la chaîne, l'en-tête tiré de la chaîne, les textes, les règles rejugées, le sceau")
    void the_example_holds() throws Exception {
        holds(example());
    }

    @Test
    @DisplayName("l'exemple porte une mission entière : la demande, le brief, l'agent, un accord, un trou, les tests, le témoin, le geste")
    void the_example_carries_a_whole_mission() throws Exception {
        List<String> kinds = new ArrayList<>();
        example().get("events").forEach(e -> kinds.add(e.get("type").asText() + "/" + e.get("data").path("kind").asText(e.get("data").path("decision").asText())));
        assertThat(kinds).contains("note/person", "note/brief", "note/agent", "note/text", "note/gap", "test.result/test", "note/changes",
            "note/runner", "note/checklist", "note/checklist.checked", "note/witness", "human.decision/ALLOWED", "human.decision/APPLY");
        // Le témoin nomme la clé qui a scellé sa tête, comme son commentaire (R159, second tour, N6).
        JsonNode witness = null;
        for (JsonNode e : example().get("events")) {
            if ("witness".equals(e.get("data").path("kind").asText())) witness = e.get("data");
        }
        assertThat(witness).isNotNull();
        String key = EvidenceSeal.open(example().get("seal")).statement().get("predicate").get("key").get("id").asText();
        assertThat(witness.path("key").asText()).as("the witness's key").matches("sha256:[0-9a-f]{64}").isEqualTo(key);
    }

    @Test
    @DisplayName("une mission neuve, du début à la fin, exporte un dossier qui tient (et refait l'exemple dans target/)")
    void a_fresh_mission_exports_a_dossier_that_holds() throws Exception {
        String file = new Scripted().mission();
        Path out = Path.of("target", "example-mission.json");
        Files.createDirectories(out.getParent());
        Files.writeString(out, file, StandardCharsets.UTF_8);

        holds(JSON.readTree(file));
    }

    /** Une mission jouée de bout en bout contre le vrai service, ses dépôts en mémoire. */
    static final class Scripted {
        final List<DeliveryRunEvidence> stored = new ArrayList<>();
        final Map<Long, MissionDossier> rows = new HashMap<>();
        final List<MissionDossierSeal> seals = new ArrayList<>();
        final List<MissionDossierText> texts = new ArrayList<>();
        final Map<Long, MissionPerson> persons = new HashMap<>();

        String mission() {
            MissionPersonRepository people = mock(MissionPersonRepository.class);
            lenient().when(people.findByWorkspaceIdAndUserId(anyLong(), anyLong()))
                .thenAnswer(inv -> Optional.ofNullable(persons.get(inv.<Long>getArgument(1))));
            lenient().when(people.saveAndFlush(any())).thenAnswer(inv -> {
                MissionPerson person = inv.getArgument(0);
                persons.put(person.getUserId(), person);
                return person;
            });
            DeliveryRunEvidenceRepository repository = mock(DeliveryRunEvidenceRepository.class);
            DeliveryRunRepository runRepository = mock(DeliveryRunRepository.class);
            MissionDossierRepository dossiers = mock(MissionDossierRepository.class);
            MissionDossierSealRepository sealRepository = mock(MissionDossierSealRepository.class);
            MissionDossierTextRepository textRepository = mock(MissionDossierTextRepository.class);
            IssueChecklistItemRepository checklist = mock(IssueChecklistItemRepository.class);
            lenient().when(repository.save(any())).thenAnswer(inv -> {
                stored.add(inv.getArgument(0));
                return inv.getArgument(0);
            });
            lenient().when(repository.findTopByRunIdOrderBySeqDesc(42L))
                .thenAnswer(inv -> stored.isEmpty() ? Optional.empty() : Optional.of(stored.getLast()));
            lenient().when(repository.findByRunIdOrderBySeqAsc(42L)).thenAnswer(inv -> List.copyOf(stored));
            lenient().when(dossiers.existsById(anyLong())).thenAnswer(inv -> rows.containsKey(inv.<Long>getArgument(0)));
            lenient().when(dossiers.findById(anyLong())).thenAnswer(inv -> Optional.ofNullable(rows.get(inv.<Long>getArgument(0))));
            lenient().when(dossiers.saveAndFlush(any())).thenAnswer(inv -> {
                MissionDossier row = inv.getArgument(0);
                rows.put(row.getRunId(), row);
                return row;
            });
            lenient().when(sealRepository.save(any())).thenAnswer(inv -> {
                seals.add(inv.getArgument(0));
                return inv.getArgument(0);
            });
            lenient().when(sealRepository.findTopByRunIdOrderBySeqDesc(42L))
                .thenAnswer(inv -> seals.isEmpty() ? Optional.empty() : Optional.of(seals.getLast()));
            lenient().when(sealRepository.existsByRunIdAndSeq(anyLong(), anyInt()))
                .thenAnswer(inv -> seals.stream().anyMatch(s -> s.getSeq().equals(inv.getArgument(1))));
            lenient().when(textRepository.save(any())).thenAnswer(inv -> {
                texts.add(inv.getArgument(0));
                return inv.getArgument(0);
            });
            lenient().when(textRepository.existsByRunIdAndHash(anyLong(), anyString()))
                .thenAnswer(inv -> texts.stream().anyMatch(t -> t.getHash().equals(inv.getArgument(1))));
            lenient().when(textRepository.findByRunIdOrderByIdAsc(42L)).thenAnswer(inv -> List.copyOf(texts));
            lenient().when(textRepository.findFirstByRunIdAndKindAndBody(anyLong(), anyString(), anyString()))
                .thenAnswer(inv -> texts.stream().filter(t -> t.getKind().equals(inv.getArgument(1)) && inv.getArgument(2).equals(t.getBody()))
                    .findFirst());
            lenient().when(textRepository.existsByRunIdAndPersonAndKind(anyLong(), anyString(), anyString()))
                .thenAnswer(inv -> texts.stream().anyMatch(t -> inv.getArgument(1).equals(t.getPerson()) && t.getKind().equals(inv.getArgument(2))));

            User ada = User.builder().id(7L).email("ada@example.com").displayName("Ada").build();
            User grace = User.builder().id(8L).email("grace@example.com").displayName("Grace").build();
            Workspace workspace = Workspace.builder().id(3L).slug("acme").owner(ada).build();
            Project project = Project.builder().id(12L).identifier("WEB").workspace(workspace).build();
            Issue issue = Issue.builder().id(55L).sequenceNumber(48).title("Fix the footer links")
                .description("The footer still links to the old documentation site. Point the three links to docs.example.com.")
                .reporter(grace).createdAt(LocalDateTime.of(2026, 11, 20, 9, 30)).project(project).build();
            DeliveryRun run = DeliveryRun.builder().id(42L).issue(issue).providerKey("claude-code").model("sonnet")
                .status(DeliveryRunStatus.RUNNING).startedBy(ada).claimedBy("tf-runner-ada").origin("app").build();
            run.setCreatedAt(LocalDateTime.of(2026, 11, 22, 8, 0));
            lenient().when(runRepository.findByIdForUpdate(42L)).thenReturn(Optional.of(run));
            List<IssueChecklistItem> items = List.of(
                IssueChecklistItem.builder().id(1L).issueId(55L).content("Point the three footer links to docs.example.com").done(true).build(),
                IssueChecklistItem.builder().id(2L).issueId(55L).content("Check the links on the staging site").done(false).build());
            lenient().when(checklist.findByIssueIdOrderByPositionAscIdAsc(55L)).thenReturn(items);

            HarnessRulesService rulesService = new HarnessRulesService(mock(HarnessRuleSetRepository.class),
                mock(WorkspaceMemberRepository.class));
            RulesBundle rules = rulesService.bundleFor(workspace, new HarnessRulesService.Work(12L, null, 7L));
            // Le paquet nomme le propriétaire de la table par son courriel : la copie du dossier le nomme par son identifiant (N3).
            UserRepository users = mock(UserRepository.class);
            lenient().when(users.findByEmail("ada@example.com")).thenReturn(Optional.of(ada));
            MissionEvidenceService service = new MissionEvidenceService(repository, runRepository, dossiers, sealRepository,
                textRepository, mock(HarnessRuleSetRepository.class), checklist, people, new EvidenceSigner("", "", ""),
                mock(ApplicationEventPublisher.class), users);

            service.open(run, rules, "tf-runner-ada", Map.of());
            int n = 0;
            service.runnerEvent(run, new RunnerEventsRequest.Event("brief", null, "The brief given to Claude Code", null, null, ++n,
                null, null, null, "You are working on a task delegated from TaskForce: WEB-48 - Fix the footer links\n...", null, null));
            service.runnerEvent(run, new RunnerEventsRequest.Event("agent", null, "Claude Code 2.1.300 with claude-sonnet-5-20261001",
                null, null, ++n, null, null, null, null,
                new RunnerEventsRequest.Agent("2.1.300", "claude-sonnet-5-20261001", "4f1c9a52-1b7e-4c38-9a0e-5d2f6b8c1e77", "anthropic",
                    "sonnet", List.of("claude-sonnet-5-20261001")),
                null));
            service.runnerEvent(run, new RunnerEventsRequest.Event("text", null, "I will read the footer component first.", null, null,
                ++n, null, null, null, null, null, null));
            decision(service, run, ++n, "Read", "src/components/footer.tsx", Map.of("action", "file.read", "tool", "Read",
                "path", "src/components/footer.tsx"), null);
            service.runnerEvent(run, new RunnerEventsRequest.Event("tool", "Read", "src/components/footer.tsx", null, null, ++n,
                null, null, null, null, null, null));
            String footer = "sha256:" + "5".repeat(64);
            decision(service, run, ++n, "Edit", "src/components/footer.tsx", Map.of("action", "file.write", "tool", "Edit",
                "path", "src/components/footer.tsx"), new RunnerEventsRequest.Written("src/components/footer.tsx", footer, 1830L));
            service.runnerEvent(run, new RunnerEventsRequest.Event("tool", "Edit", "src/components/footer.tsx", null, null, ++n,
                null, null, null, null, null, null));
            service.checked(run, items.getFirst());
            decision(service, run, ++n, "WebSearch", "docs.example.com footer links", Map.of("action", "web.search",
                "tool", "WebSearch"), null);
            // La demande ouverte par le serveur, puis l'accord de la personne, comme DeliveryActivityService les écrit.
            Map<String, Object> asked = new LinkedHashMap<>();
            asked.put("approval", 9);
            asked.put("tool", "WebSearch");
            asked.put("summary", "docs.example.com footer links");
            asked.put("action", "web.search");
            asked.put("rule", "search-web");
            asked.put("askedBy", "agent");
            asked.put("effect", "ask");
            asked.put("asked", service.person(run, ada).id());
            asked.put("input", "sha256:" + "6".repeat(64));
            asked.put("facts", List.of(Map.of("action", "web.search", "tool", "WebSearch", "actor", "agent")));
            service.append(run, "action.decided", MissionEvidenceService.Actor.SERVER, asked);
            Map<String, Object> decided = new LinkedHashMap<>();
            decided.put("approval", 9);
            decided.put("tool", "WebSearch");
            decided.put("summary", "docs.example.com footer links");
            decided.put("action", "web.search");
            decided.put("rule", "search-web");
            decided.put("decision", "ALLOWED");
            decided.put("scope", "ONCE");
            decided.put("reason", "Only the public docs site, to check the new addresses.");
            service.append(run, "human.decision", service.person(run, ada), decided);
            // L'événement suivant n'arrive jamais : le dossier marque le trou.
            ++n;
            service.runnerEvent(run, new RunnerEventsRequest.Event("tool", "WebSearch", "docs.example.com footer links", null, null,
                ++n, null, null, null, null, null, null));
            service.runnerEvent(run, new RunnerEventsRequest.Event("exit", "git push", "allowed by the rule push-agent-branch-private",
                "allow", "push-agent-branch-private", ++n, null, null, null, null, null, null));
            service.runnerEvent(run, new RunnerEventsRequest.Event("exit", "gh pr create", "allowed by the rule open-pull-request",
                "allow", "open-pull-request", ++n, null, null, null, null, null, null));
            Map<String, Object> changes = new LinkedHashMap<>();
            changes.put("kind", "changes");
            changes.put("mode", "repo");
            changes.put("base", "3".repeat(40));
            changes.put("added", 3);
            changes.put("removed", 3);
            changes.put("more", 0);
            changes.put("files", List.of(Map.of("path", "src/components/footer.tsx", "status", "modified", "added", 3, "removed", 3,
                "revision", "7".repeat(32), "sha256", footer)));
            service.append(run, "note", new MissionEvidenceService.Actor("runner", "tf-runner-ada"), changes);
            service.runnerEvent(run, new RunnerEventsRequest.Event("test", "npm test", "Tests passed: `npm test` (12 s).", null, null,
                ++n, null, null, null, null, null,
                new RunnerEventsRequest.Test("npm test", true, true, 48, 48, "sha256:" + "8".repeat(64), 20480L)));
            run.setBranch("tf/web-48-fix-the-footer-links");
            run.setCommits(1);
            service.runnerReport(run, new RunnerResultRequest("DONE", "done", "https://github.com/acme/website/pull/212", null, null,
                null, null, null, null, n, new RunnerResultRequest.Session("4f1c9a52-1b7e-4c38-9a0e-5d2f6b8c1e77",
                "sha256:" + "4".repeat(64), 182340L), "2".repeat(40)));
            service.end(run, new DeliveryPoll(DeliveryRunStatus.DONE, "## What I did\nI pointed the three footer links to "
                + "docs.example.com in `src/components/footer.tsx`.\n\n## What to check\n- `src/components/footer.tsx:12`: the "
                + "addresses.\n\n## What I'm not sure about\nI did not check the staging site.", "https://github.com/acme/website/pull/212",
                null));
            MissionDossierSeal end = seals.getLast();
            Map<String, Object> witness = new LinkedHashMap<>();
            witness.put("kind", "witness");
            witness.put("where", "github-pull-request");
            witness.put("pullRequest", "https://github.com/acme/website/pull/212");
            witness.put("root", end.getRoot());
            witness.put("seq", end.getSeq());
            // La clé qui a scellé cette tête, que le commentaire porte aussi (R159, second tour, N6).
            witness.put("key", end.getKeyId());
            // Un dépôt que GitHub dit privé : le commentaire porte le lien de la page (R159, B2).
            witness.put("pageLinked", true);
            witness.put("written", true);
            witness.put("comment", "https://github.com/acme/website/pull/212#issuecomment-1");
            service.appendToDossier(42L, "note", MissionEvidenceService.Actor.SERVER, witness);
            Map<String, Object> apply = new LinkedHashMap<>();
            apply.put("decision", "APPLY");
            apply.put("where", "taskforce");
            apply.put("reason", "The links are right; staging is checked by the release.");
            apply.put("pullRequest", "https://github.com/acme/website/pull/212");
            apply.put("merged", true);
            apply.put("testsFailed", false);
            service.appendAfterEnd(run, "human.decision", service.person(run, ada), apply);
            return service.dossierJson(42L).orElseThrow();
        }

        /** Une décision des règles, telle que le runner l'envoie : les faits jugés, l'action exacte, la règle qui l'a donnée. */
        private static void decision(MissionEvidenceService service, DeliveryRun run, int n, String tool, String text,
                                     Map<String, String> facts, RunnerEventsRequest.Written written) {
            RulesBundle rules = JSON.convertValue(service.dossier(42L).map(MissionDossier::getRulesBundle).map(EvidenceExampleContractTest::parse)
                .orElseThrow(), RulesBundle.class);
            Map<String, String> judged = new LinkedHashMap<>(facts);
            judged.put("actor", "agent");
            RulesEngine.Decision decision = RulesEngine.decideAll(rules, List.of(judged));
            service.runnerEvent(run, new RunnerEventsRequest.Event("decision", tool, text, decision.effect(),
                decision.rule() == null ? null : decision.rule().id(), n, List.of(judged),
                EvidenceChain.sha256("{\"input\":\"" + text + "\"}"), written, null, null, null));
        }
    }

    private static JsonNode parse(String json) {
        try {
            return JSON.readTree(json);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }
}
