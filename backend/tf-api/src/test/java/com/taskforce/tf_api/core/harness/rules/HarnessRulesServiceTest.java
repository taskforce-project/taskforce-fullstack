package com.taskforce.tf_api.core.harness.rules;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
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

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.enums.RuleScope;
import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.harness.rules.HarnessRulesService.Work;
import com.taskforce.tf_api.core.model.HarnessRuleSet;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.HarnessRuleSetRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;

@ExtendWith(MockitoExtension.class)
@DisplayName("Règles du harnais remises au runner : la table, puis les couches de l'entreprise")
class HarnessRulesServiceTest {

    @Mock private HarnessRuleSetRepository repository;
    @Mock private WorkspaceMemberRepository members;

    private HarnessRulesService service;
    private Workspace workspace;
    private final List<HarnessRuleSet> rows = new ArrayList<>();

    @BeforeEach
    void setUp() {
        service = new HarnessRulesService(repository, members);
        workspace = Workspace.builder().id(9L).slug("acme").owner(User.builder().id(7L).email("pierre@acme.dev").build()).build();
        lenient().when(repository.findByWorkspaceIdOrderByVersionDesc(9L)).thenAnswer(inv -> rows.stream()
            .sorted((a, b) -> Integer.compare(b.getVersion(), a.getVersion())).toList());
        lenient().when(members.findByWorkspaceIdAndUserId(eq(9L), anyLong())).thenReturn(Optional.empty());
    }

    private static Map<String, Object> rule(String id, String action, String effect) {
        Map<String, Object> rule = new LinkedHashMap<>();
        rule.put("id", id);
        rule.put("when", Map.of("action", action));
        rule.put("class", "reversible-exit");
        rule.put("effect", effect);
        rule.put("owner", "pierre@acme.dev");
        rule.put("reason", "Written by the company.");
        rule.put("review", "2027-05-11");
        rule.put("text", "Written by the company.");
        rule.put("cases", List.of(Map.of("facts", Map.of("action", action), "expect", Map.of("effect", effect))));
        rule.put("addedBy", 7);
        return rule;
    }

    private HarnessRuleSet row(RuleScope scope, int version, List<Map<String, Object>> rules) {
        HarnessRuleSet.HarnessRuleSetBuilder builder = HarnessRuleSet.builder().workspace(workspace).version(version)
            .scope(scope).rules(rules).digest(HarnessRulesService.digestOf(rules)).createdAt(LocalDateTime.now());
        return builder.build();
    }

    private void add(HarnessRuleSet row) {
        rows.add(row);
    }

    @Test
    @DisplayName("sans règles écrites : la table par défaut, dont la personne propriétaire de l'espace répond")
    void defaultsOwnedByTheWorkspaceOwner() {
        RulesBundle bundle = service.bundleFor(workspace);

        assertThat(bundle.format()).isEqualTo(RulesBundle.FORMAT);
        assertThat(bundle.workspace()).isEqualTo("acme");
        assertThat(bundle.version()).isEqualTo(1);
        assertThat(bundle.layers()).isNull();
        assertThat(bundle.rules()).isNotEmpty().allSatisfy(r -> {
            assertThat(r.owner()).isEqualTo("pierre@acme.dev");
            assertThat(r.layer()).isNull();
        });
        assertThat(bundle.rules()).extracting(RulesBundle.Rule::id).contains("change-rules", "no-harness-change")
            .doesNotContain("pay", "deploy");
    }

    @Test
    @DisplayName("l'empreinte remise est celle que le runner recalcule, et elle ne bouge pas d'un appel à l'autre")
    void digestIsTheOneTheRunnerRecomputes() {
        add(row(RuleScope.WORKSPACE, 2, List.of(rule("ws-ask-comments", "comment.create", "ask"))));

        RulesBundle bundle = service.bundleFor(workspace, new Work(12L, null, 7L));

        assertThat(bundle.digest()).isEqualTo(RulesDigest.of(new ObjectMapper().valueToTree(bundle)));
        assertThat(service.bundleFor(workspace, new Work(12L, null, 7L)).digest()).isEqualTo(bundle.digest());
    }

    @Test
    @DisplayName("la couche de l'organisation passe avant la table, sans ses cas, et seulement ce qui durcit")
    void theWorkspaceLayerTightensOnly() {
        add(row(RuleScope.WORKSPACE, 4, List.of(rule("ws-ask-comments", "comment.create", "ask"),
            rule("ws-allow-fetch", "web.fetch", "allow"))));

        RulesBundle bundle = service.bundleFor(workspace);

        assertThat(bundle.version()).isEqualTo(4);
        assertThat(bundle.rules().get(0)).satisfies(r -> {
            assertThat(r.id()).isEqualTo("ws-ask-comments");
            assertThat(r.layer()).isEqualTo("workspace");
            assertThat(r.text()).isEqualTo("Written by the company.");
        });
        assertThat(bundle.rules()).extracting(RulesBundle.Rule::id).doesNotContain("ws-allow-fetch");
        assertThat(bundle.layers()).singleElement().satisfies(l -> {
            assertThat(l.scope()).isEqualTo("workspace");
            assertThat(l.version()).isEqualTo(4);
            assertThat(l.digest()).startsWith("sha256:");
        });
        assertThat(new ObjectMapper().valueToTree(bundle).toString()).doesNotContain("cases").doesNotContain("addedBy");
        assertThat(RulesEngine.decide(bundle, Map.of("action", "comment.create")).effect()).isEqualTo("ask");
        assertThat(RulesEngine.decide(bundle, Map.of("action", "web.fetch")).rule().id()).isEqualTo("fetch-web");
    }

    @Test
    @DisplayName("la couche d'un projet ne vaut que pour le travail de ce projet")
    void aProjectLayerAppliesToItsProject() {
        HarnessRuleSet project = row(RuleScope.PROJECT, 3, List.of(rule("prj12-no-delete", "issue.delete", "deny")));
        project.setProject(Project.builder().id(12L).build());
        add(project);

        assertThat(RulesEngine.decide(service.bundleFor(workspace, new Work(12L, null, null)),
            Map.of("action", "issue.delete")).effect()).isEqualTo("deny");
        assertThat(RulesEngine.decide(service.bundleFor(workspace, new Work(13L, null, null)),
            Map.of("action", "issue.delete")).effect()).isEqualTo("ask");
    }

    @Test
    @DisplayName("la couche d'un rôle vaut pour qui l'a, celle d'une personne pour elle ; la plus précise passe d'abord")
    void roleAndPersonLayers() {
        HarnessRuleSet role = row(RuleScope.ROLE, 2, List.of(rule("role-member-ask-issues", "issue.create", "ask")));
        role.setRole("MEMBER");
        HarnessRuleSet person = row(RuleScope.PERSON, 3, List.of(rule("person8-ask-issues", "issue.create", "ask")));
        person.setPerson(User.builder().id(8L).build());
        add(row(RuleScope.WORKSPACE, 1, List.of(rule("ws-ask-issues", "issue.create", "ask"))));
        add(role);
        add(person);
        when(members.findByWorkspaceIdAndUserId(9L, 8L))
            .thenReturn(Optional.of(WorkspaceMember.builder().role(WorkspaceRole.MEMBER).build()));

        RulesBundle forMember = service.bundleFor(workspace, new Work(null, null, 8L));
        RulesBundle forOwner = service.bundleFor(workspace, new Work(null, null, 7L));

        assertThat(forMember.rules().subList(0, 3)).extracting(RulesBundle.Rule::id)
            .containsExactly("person8-ask-issues", "role-member-ask-issues", "ws-ask-issues");
        assertThat(RulesEngine.decide(forMember, Map.of("action", "issue.create")).rule().id()).isEqualTo("person8-ask-issues");
        assertThat(forOwner.rules()).extracting(RulesBundle.Rule::id)
            .doesNotContain("person8-ask-issues", "role-member-ask-issues").contains("ws-ask-issues");
    }

    @Test
    @DisplayName("la couche du rôle ADMIN vaut aussi pour un propriétaire, comme role:admin ; la sienne passe d'abord")
    void theAdminLayerAlsoCoversOwners() {
        HarnessRuleSet admins = row(RuleScope.ROLE, 2, List.of(rule("role-admin-ask-deletes", "issue.delete", "ask")));
        admins.setRole("ADMIN");
        HarnessRuleSet owners = row(RuleScope.ROLE, 3, List.of(rule("role-owner-ask-deletes", "issue.delete", "ask")));
        owners.setRole("OWNER");
        HarnessRuleSet membersLayer = row(RuleScope.ROLE, 4, List.of(rule("role-member-ask-deletes", "issue.delete", "ask")));
        membersLayer.setRole("MEMBER");
        add(admins);
        add(owners);
        add(membersLayer);
        when(members.findByWorkspaceIdAndUserId(9L, 7L))
            .thenReturn(Optional.of(WorkspaceMember.builder().role(WorkspaceRole.OWNER).build()));
        when(members.findByWorkspaceIdAndUserId(9L, 8L))
            .thenReturn(Optional.of(WorkspaceMember.builder().role(WorkspaceRole.ADMIN).build()));

        RulesBundle forOwner = service.bundleFor(workspace, new Work(null, null, 7L));
        RulesBundle forAdmin = service.bundleFor(workspace, new Work(null, null, 8L));

        assertThat(forOwner.rules()).extracting(RulesBundle.Rule::id)
            .containsSubsequence("role-owner-ask-deletes", "role-admin-ask-deletes")
            .doesNotContain("role-member-ask-deletes");
        assertThat(forAdmin.rules()).extracting(RulesBundle.Rule::id).contains("role-admin-ask-deletes")
            .doesNotContain("role-owner-ask-deletes", "role-member-ask-deletes");
    }

    @Test
    @DisplayName("la version en vigueur d'une couche est sa dernière ; les autres couches gardent la leur")
    void theLatestVersionOfALayerWins() {
        add(row(RuleScope.WORKSPACE, 3, List.of(rule("ws-ask-comments", "comment.create", "ask"))));
        add(row(RuleScope.WORKSPACE, 5, List.of(rule("ws-deny-comments", "comment.create", "deny"))));

        RulesBundle bundle = service.bundleFor(workspace);

        assertThat(bundle.rules()).extracting(RulesBundle.Rule::id).contains("ws-deny-comments").doesNotContain("ws-ask-comments");
        assertThat(bundle.version()).isEqualTo(5);
    }

    @Test
    @DisplayName("une condition inconnue tombe : la règle couvre plus d'actions, ce qui ne fait que durcir")
    void anUnknownConditionIsDropped() {
        Map<String, Object> odd = rule("ws-odd", "comment.create", "ask");
        odd.put("when", Map.of("action", "comment.create", "mood", "grumpy"));
        add(row(RuleScope.WORKSPACE, 2, List.of(odd)));

        RulesBundle bundle = service.bundleFor(workspace);

        assertThat(RulesEngine.decide(bundle, Map.of("action", "comment.create")).rule().id()).isEqualTo("ws-odd");
    }

    @Test
    @DisplayName("les obligations d'une règle qui demande vont avec elle dans le paquet")
    void obligationsTravelWithTheRule() {
        Map<String, Object> finance = rule("ws-accounting", "file.write", "ask");
        finance.put("when", Map.of("action", "file.write", "path", "**/accounting/**"));
        finance.put("require", Map.of("approvers", List.of("person:42")));
        add(row(RuleScope.WORKSPACE, 2, List.of(finance)));

        RulesEngine.Decision decision = RulesEngine.decide(service.bundleFor(workspace),
            Map.of("action", "file.write", "path", "src/accounting/ledger.ts"));

        assertThat(decision.effect()).isEqualTo("ask");
        assertThat(decision.require().approvers()).containsExactly(List.of("person:42"));
    }
}
