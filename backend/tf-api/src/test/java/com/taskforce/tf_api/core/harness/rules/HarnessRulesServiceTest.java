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
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.service.PersonIds;
import com.taskforce.tf_api.core.service.TestPersonIds;

@ExtendWith(MockitoExtension.class)
@DisplayName("Règles du harnais remises au runner : la table, puis les couches de l'entreprise")
class HarnessRulesServiceTest {

    /** Ce que le contrat permet à {@code owner} (contracts/rules/taskforce-rules-1.schema.json) : jamais un courriel. */
    static final String OWNER = "^(who:([0-9a-f]{32}|unknown)|workspace-owner)$";

    @Mock private HarnessRuleSetRepository repository;
    @Mock private WorkspaceMemberRepository members;
    @Mock private UserRepository users;

    private HarnessRulesService service;
    private PersonIds personIds;
    private Workspace workspace;
    private User pierre;
    private final List<HarnessRuleSet> rows = new ArrayList<>();

    @BeforeEach
    void setUp() {
        personIds = TestPersonIds.inMemory(users);
        service = new HarnessRulesService(repository, members, personIds);
        pierre = User.builder().id(7L).email("pierre@acme.dev").createdAt(LocalDateTime.of(2026, 1, 5, 9, 0)).build();
        workspace = Workspace.builder().id(9L).slug("acme").owner(pierre).build();
        // L'auteur d'une règle se lit d'abord par son compte (R159 de #551, quatrième tour, d-c).
        lenient().when(users.findById(7L)).thenReturn(Optional.of(pierre));
        lenient().when(users.findAllByEmailIgnoreCase("pierre@acme.dev")).thenReturn(List.of(pierre));
        lenient().when(repository.findByWorkspaceIdOrderByVersionDesc(9L)).thenAnswer(inv -> rows.stream()
            .sorted((a, b) -> Integer.compare(b.getVersion(), a.getVersion())).toList());
        lenient().when(members.findByWorkspaceIdAndUserId(eq(9L), anyLong())).thenReturn(Optional.empty());
        // Une version écrite avant la 1.18 nomme son auteur par son courriel ; le compte le porte encore.
        lenient().when(users.findByEmail("pierre@acme.dev")).thenReturn(Optional.of(pierre));
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
    @DisplayName("sans règles écrites : la table par défaut, dont la personne propriétaire de l'espace répond, par son identifiant")
    void defaultsOwnedByTheWorkspaceOwner() {
        RulesBundle bundle = service.bundleFor(workspace);

        assertThat(bundle.format()).isEqualTo(RulesBundle.FORMAT);
        assertThat(bundle.workspace()).isEqualTo("acme");
        assertThat(bundle.version()).isEqualTo(1);
        assertThat(bundle.layers()).isNull();
        String owner = personIds.of(9L, 7L);
        assertThat(owner).matches("who:[0-9a-f]{32}");
        assertThat(bundle.rules()).isNotEmpty().allSatisfy(r -> {
            assertThat(r.owner()).isEqualTo(owner);
            assertThat(r.layer()).isNull();
        });
        assertThat(new ObjectMapper().valueToTree(bundle).toString()).doesNotContain("@");
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

    @Test
    @DisplayName("une version d'avant la 1.18 nomme son auteur par son courriel : le paquet le nomme par son identifiant, "
        + "et l'empreinte de la couche, calculée sur ses règles nommées ainsi, ne confirme pas le courriel")
    void anOlderLayerNamesItsAuthorById() {
        List<Map<String, Object>> stored = List.of(rule("ws-ask-comments", "comment.create", "ask"));
        add(row(RuleScope.WORKSPACE, 2, stored));

        RulesBundle bundle = service.bundleFor(workspace);

        String pierreId = personIds.of(9L, 7L);
        assertThat(bundle.rules().get(0).owner()).isEqualTo(pierreId);
        Map<String, Object> named = new LinkedHashMap<>(stored.get(0));
        named.put("owner", pierreId);
        assertThat(bundle.layers()).singleElement().satisfies(l -> {
            assertThat(l.digest()).isEqualTo(HarnessRulesService.digestOf(List.of(named)));
            assertThat(l.digest()).isNotEqualTo(rows.get(0).getDigest());
        });
        assertThat(new ObjectMapper().valueToTree(bundle).toString()).doesNotContain("@");
        // La version gardée ne change pas : elle ne change jamais (V125).
        assertThat(rows.get(0).getRules().get(0).get("owner")).isEqualTo("pierre@acme.dev");
    }

    @Test
    @DisplayName("une version écrite depuis la 1.18 nomme déjà son auteur par son identifiant : le paquet porte son empreinte")
    void aNewerLayerKeepsItsDigest() {
        Map<String, Object> rule = rule("ws-ask-comments", "comment.create", "ask");
        rule.put("owner", personIds.of(9L, 7L));
        add(row(RuleScope.WORKSPACE, 2, List.of(rule)));

        RulesBundle bundle = service.bundleFor(workspace);

        assertThat(bundle.rules().get(0).owner()).isEqualTo(personIds.of(9L, 7L));
        assertThat(bundle.layers()).singleElement().satisfies(l -> assertThat(l.digest()).isEqualTo(rows.get(0).getDigest()));
    }

    @Test
    @DisplayName("un propriétaire que TaskForce ne retrouve pas, un courriel sans compte ou un nom tapé, ne nomme personne")
    void anOwnerNoOneHasIsUnknown() {
        Map<String, Object> gone = rule("ws-ask-comments", "comment.create", "ask");
        gone.put("owner", "someone-gone@acme.dev");
        // Une règle d'avant le 11 novembre, sans le compte qui l'a écrite : son courriel seul, que plus aucun compte ne porte.
        gone.remove("addedBy");
        Map<String, Object> typed = rule("ws-no-delete", "issue.delete", "deny");
        typed.put("owner", "Pierre Michel");
        add(row(RuleScope.WORKSPACE, 2, List.of(gone, typed)));

        RulesBundle bundle = service.bundleFor(workspace);

        assertThat(bundle.rules()).filteredOn(r -> r.layer() != null).extracting(RulesBundle.Rule::owner)
            .containsExactly(PersonIds.UNKNOWN, PersonIds.UNKNOWN);
        assertThat(bundle.rules()).allSatisfy(r -> assertThat(r.owner()).matches(OWNER));
        assertThat(new ObjectMapper().valueToTree(bundle).toString()).doesNotContain("@").doesNotContain("Pierre Michel");
    }

    @Test
    @DisplayName("R159 de #551, quatrième tour, d-c : l'auteur se lit par son compte ; un compte qui reprend le courriel d'un compte purgé n'hérite d'aucune règle")
    void anAccountThatTakesOverAnEmailInheritsNoRule() {
        // Ada a écrit deux règles avant la 1.18, puis son compte a été purgé ; un compte neuf porte aujourd'hui son courriel.
        User newcomer = User.builder().id(12L).email("ada@acme.dev").createdAt(LocalDateTime.now()).build();
        lenient().when(users.findById(11L)).thenReturn(Optional.empty());
        // La base cherche sans tenir compte de la casse : le compte neuf répond aux deux écritures.
        lenient().when(users.findAllByEmailIgnoreCase("ada@acme.dev")).thenReturn(List.of(newcomer));
        lenient().when(users.findAllByEmailIgnoreCase("ADA@acme.dev")).thenReturn(List.of(newcomer));
        Map<String, Object> byAccount = rule("ws-ask-comments", "comment.create", "ask");
        byAccount.put("owner", "ada@acme.dev");
        byAccount.put("addedBy", 11);
        Map<String, Object> byEmail = rule("ws-no-delete", "issue.delete", "deny");
        byEmail.put("owner", "ADA@acme.dev");
        byEmail.remove("addedBy");
        // Pierre, lui, porte encore le courriel qu'une règle plus ancienne écrit avec une autre casse.
        Map<String, Object> pierreByEmail = rule("ws-ask-pushes", "git.push", "ask");
        pierreByEmail.put("owner", "Pierre@Acme.dev");
        pierreByEmail.remove("addedBy");
        lenient().when(users.findAllByEmailIgnoreCase("Pierre@Acme.dev")).thenReturn(List.of(pierre));
        HarnessRuleSet version = row(RuleScope.WORKSPACE, 2, List.of(byAccount, byEmail, pierreByEmail));
        version.setCreatedAt(LocalDateTime.of(2026, 10, 1, 9, 0));
        add(version);

        RulesBundle bundle = service.bundleFor(workspace);

        // Le compte purgé ne nomme plus personne, le compte neuf, créé après la version, n'hérite de rien ; Pierre reste.
        assertThat(bundle.rules()).filteredOn(r -> r.layer() != null).extracting(RulesBundle.Rule::owner)
            .containsExactly(PersonIds.UNKNOWN, PersonIds.UNKNOWN, personIds.of(9L, 7L));
    }

    @Test
    @DisplayName("un espace sans propriétaire garde le repère du contrat : le paquet n'invente personne")
    void aWorkspaceWithoutOwnerKeepsThePlaceholder() {
        Workspace orphan = Workspace.builder().id(9L).slug("acme").build();

        assertThat(service.bundleFor(orphan).rules()).allSatisfy(r -> assertThat(r.owner()).isEqualTo("workspace-owner"));
    }
}
