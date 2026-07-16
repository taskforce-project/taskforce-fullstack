package com.taskforce.tf_api.core.service.brain;

import java.net.SocketTimeoutException;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.taskforce.tf_api.core.dto.request.CreateKnowledgeNodeRequest;
import com.taskforce.tf_api.core.dto.request.UpdateKnowledgeNodeRequest;
import com.taskforce.tf_api.core.enums.CycleStatus;
import com.taskforce.tf_api.core.enums.IssueStatusCategory;
import com.taskforce.tf_api.core.enums.NodeRefType;
import com.taskforce.tf_api.core.model.Cycle;
import com.taskforce.tf_api.core.model.CycleIssue;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.IssueStatus;
import com.taskforce.tf_api.core.model.IssueType;
import com.taskforce.tf_api.core.model.KnowledgeNode;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.CycleIssueRepository;
import com.taskforce.tf_api.core.repository.CycleRepository;
import com.taskforce.tf_api.core.repository.KnowledgeNodeRepository;
import com.taskforce.tf_api.core.service.AiMeter;
import com.taskforce.tf_api.core.service.KnowledgeService;
import com.taskforce.tf_api.core.service.LlmClient;
import com.taskforce.tf_api.core.service.brain.BrainIngestionService.CycleFacts;
import com.taskforce.tf_api.core.service.brain.BrainIngestionService.IssueFact;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires — {@link BrainIngestionService}, la seule voie par laquelle le Brain OS se
 * remplit sans intervention humaine.
 *
 * <p>Ce qui est garanti ici tient au contrat d'écriture du Brain OS ({@code AGENTS.md} §2) :
 * <ol>
 *   <li>les <b>faits</b> sont ceux de la base (répartition par catégorie de statut, effort, taux) ;</li>
 *   <li>le LLM n'est qu'un <b>rédacteur</b> : indisponible, en panne ou hors quota, la rétro sort
 *       quand même — en faits seuls. <b>Une clôture de cycle ne casse jamais</b> ;</li>
 *   <li>l'écriture est <b>idempotente</b> : un node par cycle, mis à jour, jamais empilé ;</li>
 *   <li>le rendu est <b>Obsidian</b> (wikilinks + tags) — c'est ce qui raccroche la rétro au graphe.</li>
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
class BrainIngestionServiceTest {

    @Mock private CycleRepository         cycleRepository;
    @Mock private CycleIssueRepository    cycleIssueRepository;
    @Mock private KnowledgeNodeRepository nodeRepository;
    @Mock private KnowledgeService        knowledgeService;
    @Mock private LlmClient               llm;
    @Mock private AiMeter                 aiMeter;
    @InjectMocks private BrainIngestionService service;

    private static final Long WS = 7L;
    private static final Long CYCLE_ID = 42L;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(service, "model", "test-model");
    }

    // =========================================================================
    // 1. Les faits — ce que dit la base, rien d'autre
    // =========================================================================

    @ParameterizedTest(name = "statut {0} → {1}")
    @CsvSource({
        "COMPLETED, delivered",
        "CANCELLED, cancelled",
        "BACKLOG,   slipped",
        "UNSTARTED, slipped",
        "STARTED,   slipped"
    })
    @DisplayName("Chaque catégorie de statut tombe dans le bon seau de faits")
    void should_bucket_issue_by_status_category(IssueStatusCategory category, String bucket) {
        givenCycleWith(issue(1L, 12, "Titre", category, "Bug", "Sarah Chen", 5));

        CycleFacts facts = service.collectCycleFacts(CYCLE_ID);

        assertThat(facts.total()).isEqualTo(1);
        assertThat(bucketOf(facts, bucket)).hasSize(1);
        assertThat(bucketOf(facts, bucket).get(0).key()).isEqualTo("WEB-12");
    }

    @Test
    @DisplayName("Les faits reprennent clé, titre, assigné, effort et répartitions de la base")
    void should_collect_facts_from_database() {
        givenCycleWith(
            issue(1L, 1, "Login cassé",  IssueStatusCategory.COMPLETED, "Bug",     "Sarah Chen", 5),
            issue(2L, 2, "Ajout export", IssueStatusCategory.COMPLETED, "Feature", "Marc Dubois", 3),
            issue(3L, 3, "Refacto",      IssueStatusCategory.STARTED,   "Task",    "Sarah Chen", 8));

        CycleFacts facts = service.collectCycleFacts(CYCLE_ID);

        assertThat(facts.cycleName()).isEqualTo("Sprint 3");
        assertThat(facts.projectIdentifier()).isEqualTo("WEB");
        assertThat(facts.delivered()).extracting(IssueFact::key).containsExactly("WEB-1", "WEB-2");
        assertThat(facts.slipped()).extracting(IssueFact::key).containsExactly("WEB-3");
        assertThat(facts.delivered().get(0).title()).isEqualTo("Login cassé");
        assertThat(facts.delivered().get(0).assignee()).isEqualTo("Sarah Chen");
        assertThat(facts.pointsDelivered()).isEqualTo(8);   // 5 + 3 livrés
        assertThat(facts.pointsPlanned()).isEqualTo(16);    // 5 + 3 + 8 planifiés
        assertThat(facts.byType()).containsEntry("Bug", 1).containsEntry("Feature", 1).containsEntry("Task", 1);
        assertThat(facts.byAssignee()).containsEntry("Sarah Chen", 2).containsEntry("Marc Dubois", 1);
    }

    @Test
    @DisplayName("Une issue sans assigné ni type ne casse pas la collecte")
    void should_tolerate_missing_assignee_and_type() {
        Issue orphan = issue(1L, 9, "Orpheline", IssueStatusCategory.COMPLETED, null, null, null);
        givenCycleWith(orphan);

        CycleFacts facts = service.collectCycleFacts(CYCLE_ID);

        assertThat(facts.delivered().get(0).assignee()).isEqualTo("Non assignée");
        assertThat(facts.byType()).containsEntry("Sans type", 1);
        assertThat(facts.pointsPlanned()).isZero();
    }

    @ParameterizedTest(name = "{0} livrées / {1} au total → {2} %")
    @CsvSource({"0, 0, 0", "1, 4, 25", "3, 4, 75", "4, 4, 100", "2, 3, 67"})
    @DisplayName("Le taux de complétion est arrondi à l'entier")
    void should_compute_completion_rate(int delivered, int total, int expected) {
        CycleFacts facts = facts(delivered, total - delivered, 0);
        assertThat(facts.completionRate()).isEqualTo(expected);
    }

    @Test
    @DisplayName("Un cycle supprimé entre-temps ne fait pas échouer l'ingestion")
    void should_return_null_when_cycle_vanished() {
        when(cycleRepository.findById(CYCLE_ID)).thenReturn(Optional.empty());
        assertThat(service.collectCycleFacts(CYCLE_ID)).isNull();
    }

    @Test
    @DisplayName("Seul un cycle ACTIF porte l'avancement d'une issue")
    void should_only_follow_active_cycle() {
        // Les mocks sont construits AVANT le when() : en créer un pendant une stubbing en cours
        // laisse Mockito dans un état incohérent (UnfinishedStubbing).
        List<CycleIssue> onClosedCycle = List.of(cycleIssue(cycle(CycleStatus.COMPLETED), null));
        when(cycleIssueRepository.findByIssueId(1L)).thenReturn(onClosedCycle);
        assertThat(service.findActiveCycleId(1L)).isNull();

        List<CycleIssue> onActiveCycle = List.of(cycleIssue(cycle(CycleStatus.ACTIVE), null));
        when(cycleIssueRepository.findByIssueId(2L)).thenReturn(onActiveCycle);
        assertThat(service.findActiveCycleId(2L)).isEqualTo(CYCLE_ID);
    }

    // =========================================================================
    // 2. Le LLM n'est qu'un rédacteur — son absence n'empêche jamais la rétro
    // =========================================================================

    @Test
    @DisplayName("Avec LLM : la synthèse rédigée est renvoyée")
    void should_return_synthesis_when_llm_available() throws Exception {
        when(llm.isConfigured()).thenReturn(true);
        passThroughMeter();
        when(llm.chatCompletion(anyString(), anyString(), anyString(), anyBoolean(), eq("fast")))
            .thenReturn("### Lecture des chiffres\n- 75 % livrées");

        assertThat(service.synthesize(WS, facts(3, 1, 0))).contains("75 % livrées");
    }

    /** Les trois façons dont l'IA peut lâcher en production — aucune ne doit empêcher la rétro. */
    static Stream<Arguments> llmFailures() {
        return Stream.of(
            Arguments.of("quota du compte atteint",
                new IllegalStateException("Plafond de tokens atteint — passez à un forfait supérieur")),
            Arguments.of("panne du LLM", new RuntimeException("connection refused")),
            Arguments.of("timeout de génération", new SocketTimeoutException("Read timed out")));
    }

    @ParameterizedTest(name = "{0} → faits seuls, aucune exception")
    @MethodSource("llmFailures")
    @DisplayName("Toute défaillance IA retombe sur les faits seuls (la clôture ne casse jamais)")
    void should_fall_back_to_facts_only_on_any_llm_failure(String scenario, Exception failure) throws Exception {
        when(llm.isConfigured()).thenReturn(true);
        when(aiMeter.metered(any(), any())).thenThrow(failure);

        assertThat(service.synthesize(WS, facts(3, 1, 0))).isNull();
    }

    @Test
    @DisplayName("Sans LLM configuré, aucun appel n'est tenté")
    void should_not_call_llm_when_not_configured() throws Exception {
        when(llm.isConfigured()).thenReturn(false);

        assertThat(service.synthesize(WS, facts(3, 1, 0))).isNull();
        verify(aiMeter, never()).metered(any(), any());
    }

    @Test
    @DisplayName("Une réponse LLM vide vaut une absence de synthèse")
    void should_treat_blank_llm_answer_as_missing() throws Exception {
        when(llm.isConfigured()).thenReturn(true);
        passThroughMeter();
        when(llm.chatCompletion(anyString(), anyString(), anyString(), anyBoolean(), anyString()))
            .thenReturn("   ");

        assertThat(service.synthesize(WS, facts(3, 1, 0))).isNull();
    }

    @Test
    @DisplayName("Un cycle vide ne consomme aucun token")
    void should_skip_llm_for_empty_cycle() throws Exception {
        assertThat(service.synthesize(WS, facts(0, 0, 0))).isNull();
        verify(aiMeter, never()).metered(any(), any());
        verify(llm, never()).isConfigured();
    }

    // =========================================================================
    // 3. L'écriture — une fiche par cycle, mise à jour et jamais empilée
    // =========================================================================

    @Test
    @DisplayName("L'écriture verrouille la ligne du cycle (sérialise les listeners @Async concurrents)")
    void should_lock_cycle_row_before_writing() {
        givenSprint();
        givenNoExistingNode();

        service.writeCycleNode("taskforce-demo", WS, 1L, CYCLE_ID, null, true);

        // Sans ce verrou, 4 issues terminées coup sur coup produisent 4 nodes (constaté en réel).
        verify(cycleRepository).findByIdForUpdate(CYCLE_ID);
    }

    @Test
    @DisplayName("Un cycle supprimé avant l'écriture n'écrit rien")
    void should_write_nothing_when_cycle_vanished_before_write() {
        when(cycleRepository.findByIdForUpdate(CYCLE_ID)).thenReturn(Optional.empty());

        service.writeCycleNode("taskforce-demo", WS, 1L, CYCLE_ID, null, true);

        verify(knowledgeService, never()).createNode(anyString(), any(), any());
        verify(knowledgeService, never()).updateNode(anyString(), any(), any(), any());
    }

    @Test
    @DisplayName("Premier passage : crée un node ACTION_OODA rattaché au cycle")
    void should_create_node_on_first_ingestion() {
        givenSprint();
        givenNoExistingNode();

        service.writeCycleNode("taskforce-demo", WS, 1L, CYCLE_ID, "### Lecture\n- ok", true);

        CreateKnowledgeNodeRequest req = captureCreate();
        assertThat(req.getType()).isEqualTo("ACTION_OODA");
        assertThat(req.getDomain()).isEqualTo("HISTORIQUE");
        assertThat(req.getRefType()).isEqualTo("CYCLE");
        assertThat(req.getRefId()).isEqualTo(CYCLE_ID);
        assertThat(req.getTitle()).isEqualTo("Rétro — Sprint 3 (WEB)");
        assertThat(req.getTags()).contains("cycle", "retro", "ingestion-auto");
        assertThat(req.getMetadata()).containsEntry("mode", "generated").containsEntry("completionRate", 75);
    }

    @Test
    @DisplayName("Rejouer la clôture met à jour la fiche au lieu d'empiler un doublon")
    void should_update_existing_node_instead_of_duplicating() {
        givenSprint();
        KnowledgeNode existing = mock(KnowledgeNode.class);
        when(existing.getId()).thenReturn(999L);
        when(nodeRepository.findFirstByWorkspaceIdAndRefTypeAndRefId(WS, NodeRefType.CYCLE, CYCLE_ID))
            .thenReturn(Optional.of(existing));
        // Le rendu cherche aussi la spec de chaque issue (wikilink) : ici aucune.
        lenient().when(nodeRepository.findFirstByWorkspaceIdAndRefTypeAndRefId(eq(WS), eq(NodeRefType.ISSUE), any()))
            .thenReturn(Optional.empty());

        service.writeCycleNode("taskforce-demo", WS, 1L, CYCLE_ID, null, true);

        verify(knowledgeService, never()).createNode(anyString(), any(), any());
        ArgumentCaptor<UpdateKnowledgeNodeRequest> captor = ArgumentCaptor.forClass(UpdateKnowledgeNodeRequest.class);
        verify(knowledgeService).updateNode(eq("taskforce-demo"), eq(999L), eq(1L), captor.capture());
        assertThat(captor.getValue().getTitle()).isEqualTo("Rétro — Sprint 3 (WEB)");
    }

    @Test
    @DisplayName("En cours de cycle, le node est un relevé vivant (pas encore une rétro)")
    void should_write_progress_node_while_cycle_runs() {
        givenSprint();
        givenNoExistingNode();

        service.writeCycleNode("taskforce-demo", WS, 1L, CYCLE_ID, null, false);

        CreateKnowledgeNodeRequest req = captureCreate();
        assertThat(req.getTitle()).isEqualTo("Cycle en cours — Sprint 3 (WEB)");
        assertThat(req.getMetadata()).containsEntry("closed", false).containsEntry("mode", "facts-only");
        assertThat(req.getContent()).contains("Cycle en cours — ce relevé se met à jour");
    }

    // =========================================================================
    // 4. Le rendu — faits vérifiables + format Obsidian (sinon le node est orphelin)
    // =========================================================================

    @Test
    @DisplayName("Le contenu porte les faits et se raccroche au graphe (wikilink + tags)")
    void should_render_facts_in_obsidian_format() {
        givenSprint();
        givenNoExistingNode();

        service.writeCycleNode("taskforce-demo", WS, 1L, CYCLE_ID, null, true);

        String content = captureCreate().getContent();
        assertThat(content)
            .contains("4 issues — 3 livrées, 1 non livrées")
            .contains("**Complétion** : 75 %")
            .contains("`WEB-1`")
            .contains("[[16 · Historique des actions]]")   // rejoint le hub de domaine
            .contains("#cycle #retro #ingestion-auto")
            .contains("_Synthèse IA indisponible — seuls les faits sont consignés._");
    }

    @Test
    @DisplayName("Une issue déjà spécifiée est citée en wikilink vers sa spec")
    void should_wikilink_issues_that_already_have_a_spec_node() {
        givenSprint();
        givenNoExistingNode();
        KnowledgeNode spec = mock(KnowledgeNode.class);
        when(spec.getTitle()).thenReturn("Spec — WEB-1 Login cassé");
        when(nodeRepository.findFirstByWorkspaceIdAndRefTypeAndRefId(WS, NodeRefType.ISSUE, 1L))
            .thenReturn(Optional.of(spec)); // prime sur le stub générique « aucun node » posé au-dessus

        service.writeCycleNode("taskforce-demo", WS, 1L, CYCLE_ID, null, true);

        assertThat(captureCreate().getContent()).contains("→ [[Spec — WEB-1 Login cassé]]");
    }

    @Test
    @DisplayName("La synthèse IA est étiquetée « proposition », jamais « décision actée »")
    void should_label_ai_synthesis_as_a_proposal() {
        givenSprint();
        givenNoExistingNode();

        service.writeCycleNode("taskforce-demo", WS, 1L, CYCLE_ID, "### Lecture\n- 75 %", true);

        assertThat(captureCreate().getContent())
            .contains("> [!tip] Propositions à valider")
            .contains("jamais actées automatiquement");
    }

    @Test
    @DisplayName("Au-delà du plafond, la liste est tronquée et le dit (pas de troncature silencieuse)")
    void should_disclose_list_truncation() {
        Issue[] many = new Issue[BrainIngestionService.LIST_CAP + 5];
        for (int i = 0; i < many.length; i++) {
            many[i] = issue((long) i + 1, i + 1, "Issue " + (i + 1),
                IssueStatusCategory.COMPLETED, "Task", "Sarah Chen", 1);
        }
        givenCycleWith(many);
        givenNoExistingNode();

        service.writeCycleNode("taskforce-demo", WS, 1L, CYCLE_ID, null, true);

        assertThat(captureCreate().getContent()).contains("… et 5 autres (liste plafonnée à 50)");
    }

    // =========================================================================
    // Fixtures
    // =========================================================================

    private List<IssueFact> bucketOf(CycleFacts facts, String bucket) {
        return switch (bucket) {
            case "delivered" -> facts.delivered();
            case "cancelled" -> facts.cancelled();
            default          -> facts.slipped();
        };
    }

    private void passThroughMeter() throws Exception {
        when(aiMeter.metered(any(), any()))
            .thenAnswer(inv -> ((AiMeter.AiCall<?>) inv.getArgument(1)).call());
    }

    private void givenNoExistingNode() {
        when(nodeRepository.findFirstByWorkspaceIdAndRefTypeAndRefId(eq(WS), eq(NodeRefType.CYCLE), any()))
            .thenReturn(Optional.empty());
        lenient().when(nodeRepository.findFirstByWorkspaceIdAndRefTypeAndRefId(eq(WS), eq(NodeRefType.ISSUE), any()))
            .thenReturn(Optional.empty());
    }

    private CreateKnowledgeNodeRequest captureCreate() {
        ArgumentCaptor<CreateKnowledgeNodeRequest> captor =
            ArgumentCaptor.forClass(CreateKnowledgeNodeRequest.class);
        verify(knowledgeService).createNode(anyString(), any(), captor.capture());
        return captor.getValue();
    }

    /** Faits synthétiques : N livrées, M reportées, K annulées — pour les cas qui ne testent pas la collecte. */
    private CycleFacts facts(int delivered, int slipped, int cancelled) {
        return new CycleFacts(CYCLE_ID, "Sprint 3", "Web App", "WEB",
            LocalDate.of(2026, 7, 1), LocalDate.of(2026, 7, 14),
            issueFacts("WEB-", 1, delivered),
            issueFacts("WEB-S", 1, slipped),
            issueFacts("WEB-C", 1, cancelled),
            Map.of("Bug", delivered), Map.of("Sarah Chen", delivered),
            (delivered + slipped) * 2, delivered * 2);
    }

    private List<IssueFact> issueFacts(String prefix, int from, int count) {
        List<IssueFact> out = new java.util.ArrayList<>();
        for (int i = from; i < from + count; i++) {
            out.add(new IssueFact((long) i, prefix + i, "Issue " + i, "Sarah Chen", 2));
        }
        return out;
    }

    /** Un sprint réaliste : 3 issues livrées (10 pts) sur 4 (18 pts planifiés) → 75 % de complétion. */
    private void givenSprint() {
        givenCycleWith(
            issue(1L, 1, "Login cassé",  IssueStatusCategory.COMPLETED, "Bug",     "Sarah Chen",  5),
            issue(2L, 2, "Ajout export", IssueStatusCategory.COMPLETED, "Feature", "Marc Dubois", 3),
            issue(3L, 3, "Page profil",  IssueStatusCategory.COMPLETED, "Feature", "Sarah Chen",  2),
            issue(4L, 4, "Refacto",      IssueStatusCategory.STARTED,   "Task",    "Sarah Chen",  8));
    }

    private void givenCycleWith(Issue... issues) {
        Cycle cycle = cycle(CycleStatus.ACTIVE);
        // La collecte lit sans verrou (synthèse) ; l'écriture, elle, verrouille la ligne.
        lenient().when(cycleRepository.findById(CYCLE_ID)).thenReturn(Optional.of(cycle));
        lenient().when(cycleRepository.findByIdForUpdate(CYCLE_ID)).thenReturn(Optional.of(cycle));
        List<CycleIssue> links = java.util.Arrays.stream(issues)
            .map(i -> cycleIssue(cycle, i))
            .toList();
        when(cycleIssueRepository.findByCycleId(CYCLE_ID)).thenReturn(links);
    }

    private Cycle cycle(CycleStatus status) {
        Project project = mock(Project.class);
        lenient().when(project.getIdentifier()).thenReturn("WEB");
        lenient().when(project.getName()).thenReturn("Web App");
        return Cycle.builder()
            .id(CYCLE_ID)
            .project(project)
            .name("Sprint 3")
            .startDate(LocalDate.of(2026, 7, 1))
            .endDate(LocalDate.of(2026, 7, 14))
            .status(status)
            .build();
    }

    private CycleIssue cycleIssue(Cycle cycle, Issue issue) {
        CycleIssue link = mock(CycleIssue.class);
        lenient().when(link.getCycle()).thenReturn(cycle);
        lenient().when(link.getIssue()).thenReturn(issue);
        return link;
    }

    private Issue issue(Long id, int seq, String title, IssueStatusCategory category,
                        String typeName, String assigneeName, Integer points) {
        IssueStatus status = mock(IssueStatus.class);
        lenient().when(status.getCategory()).thenReturn(category);

        IssueType type = null;
        if (typeName != null) {
            type = mock(IssueType.class);
            lenient().when(type.getName()).thenReturn(typeName);
        }
        User assignee = null;
        if (assigneeName != null) {
            assignee = mock(User.class);
            lenient().when(assignee.getDisplayName()).thenReturn(assigneeName);
        }
        return Issue.builder()
            .id(id)
            .sequenceNumber(seq)
            .title(title)
            .status(status)
            .type(type)
            .assignee(assignee)
            .storyPoints(points)
            .build();
    }
}
