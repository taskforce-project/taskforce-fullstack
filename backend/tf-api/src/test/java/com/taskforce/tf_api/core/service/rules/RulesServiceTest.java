package com.taskforce.tf_api.core.service.rules;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.dto.request.RuleCheckRequest;
import com.taskforce.tf_api.core.dto.request.RuleDraftRequest;
import com.taskforce.tf_api.core.dto.response.RulesResponse;
import com.taskforce.tf_api.core.enums.ProjectRole;
import com.taskforce.tf_api.core.enums.RuleScope;
import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.harness.rules.HarnessRulesService;
import com.taskforce.tf_api.core.harness.rules.RulesEngine;
import com.taskforce.tf_api.core.model.HarnessRuleSet;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.ProjectMember;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.ConnectorConnectionRepository;
import com.taskforce.tf_api.core.repository.HarnessRuleSetRepository;
import com.taskforce.tf_api.core.repository.ProjectMemberRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.service.AuditService;
import com.taskforce.tf_api.core.service.AuthorizationService;
import com.taskforce.tf_api.core.service.ProjectVisibilityGuard;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;
import com.taskforce.tf_api.shared.exception.ForbiddenException;

/**
 * Les règles de l'entreprise par couches, de la phrase à la décision (R157, R94, R98) : la règle du CEO de bout en bout,
 * l'essai contradictoire (une règle qui relâcherait le socle n'entre pas), les droits d'écrire chaque couche, et les cas
 * rejoués à chaque changement.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("Les règles de l'entreprise, de la phrase à la décision")
class RulesServiceTest {

    static final String CEO_RULE = "No change in the accounting module without the approval of the finance lead";
    static final long ADMIN = 7L;
    static final long FINANCE = 42L;
    static final long MEMBER = 8L;
    static final long PROJECT = 12L;

    @Mock private BrainAccessGuard access;
    @Mock private AuthorizationService authorization;
    @Mock private ProjectVisibilityGuard visibility;
    @Mock private HarnessRuleSetRepository repository;
    @Mock private WorkspaceMemberRepository workspaceMembers;
    @Mock private ProjectRepository projects;
    @Mock private ProjectMemberRepository projectMembers;
    @Mock private ConnectorConnectionRepository connections;
    @Mock private RuleDraftService drafts;
    @Mock private AuditService audit;

    private final List<HarnessRuleSet> rows = new ArrayList<>();
    private RulesService service;
    private HarnessRulesService rules;
    private Workspace ws;
    private Project accounting;

    @BeforeEach
    void setUp() {
        rules = new HarnessRulesService(repository, workspaceMembers);
        service = new RulesService(access, authorization, visibility, repository, rules, workspaceMembers, projects,
            projectMembers, connections, drafts, audit);
        User admin = User.builder().id(ADMIN).email("pierre@example.com").displayName("Pierre").build();
        User finance = User.builder().id(FINANCE).email("marie@example.com").displayName("Marie Martin")
            .jobTitle("Finance lead").build();
        User member = User.builder().id(MEMBER).email("linus@example.com").displayName("Linus").build();
        ws = Workspace.builder().id(1L).slug("acme").name("Acme").owner(admin).build();
        accounting = Project.builder().id(PROJECT).name("Accounting").workspace(ws).build();
        List<WorkspaceMember> all = List.of(
            WorkspaceMember.builder().workspace(ws).user(admin).role(WorkspaceRole.ADMIN).build(),
            WorkspaceMember.builder().workspace(ws).user(finance).role(WorkspaceRole.MEMBER).build(),
            WorkspaceMember.builder().workspace(ws).user(member).role(WorkspaceRole.MEMBER).build());
        lenient().when(access.resolveAndAuthorize(eq("acme"), anyLong())).thenReturn(ws);
        lenient().when(workspaceMembers.findByWorkspaceId(1L)).thenReturn(all);
        for (WorkspaceMember m : all) {
            lenient().when(workspaceMembers.findByWorkspaceIdAndUserId(1L, m.getUser().getId())).thenReturn(Optional.of(m));
        }
        lenient().when(visibility.viewableProjectIds(eq(1L), anyLong())).thenReturn(List.of(PROJECT));
        lenient().when(projects.findByWorkspaceIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(accounting));
        lenient().when(projects.findByIdAndWorkspaceId(PROJECT, 1L)).thenReturn(Optional.of(accounting));
        lenient().when(projects.getReferenceById(PROJECT)).thenReturn(accounting);
        lenient().when(projectMembers.findByProjectIdAndUserId(eq(PROJECT), anyLong())).thenReturn(Optional.empty());
        lenient().when(connections.findByWorkspaceId(1L)).thenReturn(List.of());
        lenient().when(repository.findByWorkspaceIdOrderByVersionDesc(1L)).thenAnswer(inv -> rows.stream()
            .sorted((a, b) -> Integer.compare(b.getVersion(), a.getVersion())).toList());
        lenient().when(repository.findFirstByWorkspaceIdOrderByVersionDesc(1L)).thenAnswer(inv -> rows.stream()
            .max((a, b) -> Integer.compare(a.getVersion(), b.getVersion())));
        lenient().when(repository.saveAndFlush(any(HarnessRuleSet.class))).thenAnswer(inv -> {
            HarnessRuleSet row = inv.getArgument(0);
            row.setId((long) rows.size() + 1);
            rows.add(row);
            return row;
        });
    }

    /** Ce que le modèle de l'espace rend pour la règle du CEO : la règle, et ses deux cas. */
    private RuleDraftService.Translation ceoTranslation() {
        Map<String, Object> rule = new LinkedHashMap<>();
        rule.put("when", Map.of("action", "file.write", "path", "**/accounting/**"));
        rule.put("effect", "ask");
        rule.put("require", Map.of("approvers", List.of("person:" + FINANCE)));
        return new RuleDraftService.Translation(List.of(rule), List.of(
            new RuleCases.Case("Claude Code changes src/accounting/ledger.ts",
                Map.of("action", "file.write", "path", "src/accounting/ledger.ts", "actor", "agent"),
                new RuleCases.Expect("ask", List.of("person:" + FINANCE)), RuleCases.BY_MODEL),
            new RuleCases.Case("Claude Code changes src/billing/invoice.ts",
                Map.of("action", "file.write", "path", "src/billing/invoice.ts", "actor", "agent"),
                new RuleCases.Expect("allow", null), RuleCases.BY_MODEL)), null, null);
    }

    private RulesResponse.RuleDraft draftCeoRule(String scope, String ref) {
        when(drafts.translate(eq(1L), eq(CEO_RULE), anyString(), any(), any())).thenReturn(ceoTranslation());
        return service.draft("acme", ADMIN, new RuleDraftRequest(CEO_RULE, scope, ref, null, null));
    }

    private RulesService.Saved save(RulesResponse.RuleDraft draft, long userId) {
        return service.add("acme", userId, new RuleDraftRequest(draft.text(), draft.scope(), draft.ref(), draft.rules(),
            draft.modelCases()));
    }

    @Test
    @DisplayName("la règle du CEO, de bout en bout : en mots, ses cas passent, elle entre, et la mission demande à la responsable")
    void theCeoRuleEndToEnd() {
        RulesResponse.RuleDraft draft = draftCeoRule("workspace", null);

        assertThat(draft.passed()).isTrue();
        assertThat(draft.problems()).isEmpty();
        assertThat(draft.cases()).hasSize(4).allSatisfy(c -> assertThat(c.passed()).isTrue());
        assertThat(draft.cases()).anySatisfy(c -> {
            assertThat(c.text()).isEqualTo("Claude Code changes src/accounting/ledger.ts");
            assertThat(c.decision().effect()).isEqualTo("ask");
            assertThat(c.decision().approvers()).singleElement().satisfies(set ->
                assertThat(set).singleElement().satisfies(a -> assertThat(a.name()).isEqualTo("Marie Martin")));
        });

        RulesService.Saved saved = save(draft, ADMIN);

        assertThat(saved.saved()).isTrue();
        assertThat(rows).singleElement().satisfies(row -> {
            assertThat(row.getScope()).isEqualTo(RuleScope.WORKSPACE);
            assertThat(row.getVersion()).isEqualTo(1);
            assertThat(row.getDigest()).startsWith("sha256:");
            assertThat(row.getCreatedBy().getId()).isEqualTo(ADMIN);
            assertThat(row.getRules()).singleElement().satisfies(r -> {
                assertThat((String) r.get("id")).startsWith("ws-no-change-in-the-accounting-module");
                assertThat(r.get("text")).isEqualTo(CEO_RULE);
                assertThat(r.get("owner")).isEqualTo("pierre@example.com");
                assertThat(r.get("class")).isEqualTo("sandbox-write");
                assertThat((List<?>) r.get("cases")).hasSize(4);
            });
        });
        verify(audit).record(eq(1L), eq(ADMIN), eq(RulesService.AUDIT_ACTION), eq("harness_rule_set"), anyString(), anyMap());

        // La mission d'un membre dans le projet Accounting : le moteur demande à la responsable, ailleurs il laisse faire.
        var bundle = rules.bundleFor(ws, new HarnessRulesService.Work(PROJECT, null, MEMBER));
        RulesEngine.Decision ledger = RulesEngine.decide(bundle, Map.of("action", "file.write", "path", "src/accounting/ledger.ts"));
        assertThat(ledger.effect()).isEqualTo("ask");
        assertThat(ledger.rule().text()).isEqualTo(CEO_RULE);
        assertThat(ledger.require().approvers()).containsExactly(List.of("person:" + FINANCE));
        assertThat(RulesEngine.decide(bundle, Map.of("action", "file.write", "path", "src/billing/invoice.ts")).effect())
            .isEqualTo("allow");

        // L'écran : la phrase, qui l'a écrite, qui accorde, et ses cas qui passent.
        RulesResponse.RulesOverview overview = service.overview("acme", MEMBER);
        assertThat(overview.canEdit()).isFalse();
        assertThat(overview.layers()).singleElement().satisfies(layer -> {
            assertThat(layer.scope()).isEqualTo("workspace");
            assertThat(layer.author()).isEqualTo("Pierre");
            assertThat(layer.rules()).singleElement().satisfies(s -> {
                assertThat(s.text()).isEqualTo(CEO_RULE);
                assertThat(s.addedBy()).isEqualTo("Pierre");
                assertThat(s.approvers()).singleElement().satisfies(a -> {
                    assertThat(a.name()).isEqualTo("Marie Martin");
                    assertThat(a.detail()).isEqualTo("Finance lead");
                });
                assertThat(s.cases()).isNotEmpty().allSatisfy(c -> assertThat(c.passed()).isTrue());
            });
        });
        assertThat(overview.versions()).singleElement().satisfies(v -> assertThat(v.digest()).startsWith("sha256:"));
        assertThat(overview.floor()).contains("floor-irreversible", "floor-no-secret", "floor-three-at-once");

        // « What would happen? » : l'action en mots, lue en faits, jugée par le moteur.
        when(drafts.read(eq(1L), anyString(), any())).thenReturn(new RuleDraftService.Reading(
            Map.of("action", "file.write", "path", "src/accounting/ledger.ts", "actor", "agent"), null));
        RulesResponse.RuleCheck check = service.check("acme", MEMBER,
            new RuleCheckRequest("Claude Code changes the ledger in the accounting module", PROJECT));
        assertThat(check.decision().effect()).isEqualTo("ask");
        assertThat(check.decision().ruleText()).isEqualTo(CEO_RULE);
        assertThat(check.decision().layer()).isEqualTo("workspace");
        assertThat(check.decision().approvers()).singleElement().satisfies(set ->
            assertThat(set).extracting(RulesResponse.RuleApprover::name).containsExactly("Marie Martin"));
    }

    @Test
    @DisplayName("contradictoire : une règle qui permettrait une action irréversible sans personne est refusée, avec sa raison")
    void aRuleThatLoosensTheFloorIsRefused() {
        Map<String, Object> loosening = new LinkedHashMap<>();
        loosening.put("when", Map.of("action", "issue.delete"));
        loosening.put("effect", "allow");
        RuleDraftRequest request = new RuleDraftRequest("Agents may delete issues without asking", "workspace", null,
            List.of(loosening), null);

        RulesResponse.RuleDraft draft = service.draft("acme", ADMIN, request);
        RulesService.Saved saved = service.add("acme", ADMIN, request);

        assertThat(draft.passed()).isFalse();
        assertThat(draft.problems()).extracting(RulesResponse.RuleProblem::code).containsExactly("loosens");
        assertThat(saved.saved()).isFalse();
        assertThat(rows).isEmpty();
        verify(audit, never()).record(any(), any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("contradictoire : une règle sur le changement des règles est refusée")
    void aRuleAboutTheRulesIsRefused() {
        Map<String, Object> rule = new LinkedHashMap<>();
        rule.put("when", Map.of("action", "harness.change"));
        rule.put("effect", "deny");

        RulesService.Saved saved = service.add("acme", ADMIN,
            new RuleDraftRequest("Nobody changes the rules", "workspace", null, List.of(rule), null));

        assertThat(saved.saved()).isFalse();
        assertThat(saved.draft().problems()).extracting(RulesResponse.RuleProblem::code).contains("rulesAreTaskForce");
    }

    @Test
    @DisplayName("une règle que TaskForce refuse déjà ne change rien : son cas échoue, elle n'entre pas")
    void aShadowedRuleDoesNotEnter() {
        Map<String, Object> rule = new LinkedHashMap<>();
        rule.put("when", Map.of("action", "shell", "command", "git push**"));
        rule.put("effect", "ask");

        RulesService.Saved saved = service.add("acme", ADMIN,
            new RuleDraftRequest("Ask before the agent pushes from its shell", "workspace", null, List.of(rule), null));

        assertThat(saved.saved()).isFalse();
        assertThat(saved.draft().cases()).anySatisfy(c -> {
            assertThat(c.passed()).isFalse();
            assertThat(c.decision().effect()).isEqualTo("deny");
            assertThat(c.decision().layer()).isEqualTo("taskforce");
        });
    }

    @Test
    @DisplayName("un cas du modèle qui ne tient pas : la traduction n'est pas ce que dit la phrase, rien n'entre")
    void aModelCaseThatFailsBlocksTheSave() {
        Map<String, Object> rule = new LinkedHashMap<>();
        rule.put("when", Map.of("action", "file.write", "path", "**/accounting/**"));
        rule.put("effect", "ask");
        Map<String, Object> wrongCase = Map.of("text", "Claude Code changes src/billing/a.ts",
            "facts", Map.of("action", "file.write", "path", "src/billing/a.ts"), "expect", Map.of("effect", "ask"));

        RulesService.Saved saved = service.add("acme", ADMIN,
            new RuleDraftRequest("Ask before changing the accounting module", "workspace", null, List.of(rule), List.of(wrongCase)));

        assertThat(saved.saved()).isFalse();
        assertThat(saved.draft().cases()).filteredOn(c -> "model".equals(c.source())).singleElement()
            .satisfies(c -> assertThat(c.passed()).isFalse());
    }

    @Test
    @DisplayName("les cas se rejouent à chaque changement : une règle qui changerait ce qu'en fait une autre n'entre pas")
    void anotherRulesCasesAreReplayed() {
        assertThat(save(draftCeoRule("workspace", null), ADMIN).saved()).isTrue();
        Map<String, Object> freeze = new LinkedHashMap<>();
        freeze.put("when", Map.of("action", "file.write", "path", "src/**"));
        freeze.put("effect", "deny");

        RulesResponse.RuleDraft draft = service.draft("acme", ADMIN,
            new RuleDraftRequest("No change at all in src", "workspace", null, List.of(freeze), null));

        assertThat(draft.passed()).isFalse();
        assertThat(draft.broken()).isNotEmpty().allSatisfy(c -> assertThat(c.decision().effect()).isEqualTo("deny"));
    }

    @Test
    @DisplayName("la même phrase deux fois : la seconde n'entre pas")
    void twiceTheSameRule() {
        assertThat(save(draftCeoRule("workspace", null), ADMIN).saved()).isTrue();

        RulesResponse.RuleDraft again = draftCeoRule("workspace", null);

        assertThat(again.passed()).isFalse();
        assertThat(again.problems()).extracting(RulesResponse.RuleProblem::code).containsExactly("alreadyThere");
    }

    @Test
    @DisplayName("qui écrit : un membre ne change pas les règles de l'espace ; le responsable d'un projet change celles du projet")
    void whoWritesWhichLayer() {
        RuleDraftRequest workspaceRule = new RuleDraftRequest(CEO_RULE, "workspace", null, ceoTranslation().rules(), null);
        assertThatThrownBy(() -> service.add("acme", MEMBER, workspaceRule)).isInstanceOf(ForbiddenException.class);

        when(projectMembers.findByProjectIdAndUserId(PROJECT, MEMBER))
            .thenReturn(Optional.of(ProjectMember.builder().role(ProjectRole.LEAD).build()));
        RulesService.Saved saved = service.add("acme", MEMBER,
            new RuleDraftRequest(CEO_RULE, "project", String.valueOf(PROJECT), ceoTranslation().rules(), null));

        assertThat(saved.saved()).isTrue();
        assertThat(rows).singleElement().satisfies(row -> {
            assertThat(row.getScope()).isEqualTo(RuleScope.PROJECT);
            assertThat(row.getProject().getId()).isEqualTo(PROJECT);
            assertThat((String) row.getRules().get(0).get("id")).startsWith("prj12-");
        });
        assertThat(RulesEngine.decide(rules.bundleFor(ws, new HarnessRulesService.Work(13L, null, MEMBER)),
            Map.of("action", "file.write", "path", "src/accounting/a.ts")).effect()).isEqualTo("allow");
    }

    @Test
    @DisplayName("retirer une règle : une nouvelle version de sa couche, sans elle")
    void removeARule() {
        save(draftCeoRule("workspace", null), ADMIN);
        String group = (String) rows.get(0).getRules().get(0).get("group");

        service.remove("acme", ADMIN, "workspace", null, group);

        assertThat(rows).hasSize(2);
        assertThat(rows.get(1).getVersion()).isEqualTo(2);
        assertThat(rows.get(1).getRules()).isEmpty();
        assertThat(RulesEngine.decide(rules.bundleFor(ws), Map.of("action", "file.write", "path", "src/accounting/a.ts"))
            .effect()).isEqualTo("allow");
    }

    @Test
    @DisplayName("les couches des rôles et des personnes : une règle pour les membres ne touche pas l'admin")
    void roleLayer() {
        Map<String, Object> rule = new LinkedHashMap<>();
        rule.put("when", Map.of("action", "issue.delete"));
        rule.put("effect", "deny");

        assertThat(service.add("acme", ADMIN, new RuleDraftRequest("Members' agents never delete issues", "role", "member",
            List.of(rule), null)).saved()).isTrue();

        assertThat(RulesEngine.decide(rules.bundleFor(ws, new HarnessRulesService.Work(null, null, MEMBER)),
            Map.of("action", "issue.delete")).effect()).isEqualTo("deny");
        assertThat(RulesEngine.decide(rules.bundleFor(ws, new HarnessRulesService.Work(null, null, ADMIN)),
            Map.of("action", "issue.delete")).effect()).isEqualTo("ask");
    }

    @Test
    @DisplayName("une action que TaskForce ne sait pas juger : le tester le dit, sans décision")
    void checkWithoutFacts() {
        when(drafts.read(eq(1L), anyString(), any())).thenReturn(new RuleDraftService.Reading(null, "TaskForce doesn't see emails."));

        RulesResponse.RuleCheck check = service.check("acme", ADMIN, new RuleCheckRequest("Send an email to the client", null));

        assertThat(check.decision()).isNull();
        assertThat(check.unclear()).isEqualTo("TaskForce doesn't see emails.");
    }

    @Test
    @DisplayName("la traduction ne se demande qu'une fois : enregistrer sans règle vérifiée est refusé")
    void saveNeedsACheckedRule() {
        assertThatThrownBy(() -> service.add("acme", ADMIN, new RuleDraftRequest(CEO_RULE, "workspace", null, null, null)))
            .hasMessageContaining("Check the rule first");
    }
}
