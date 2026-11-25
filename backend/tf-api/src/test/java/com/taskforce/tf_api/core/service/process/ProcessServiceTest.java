package com.taskforce.tf_api.core.service.process;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.taskforce.tf_api.core.dto.response.ProcessResponse;
import com.taskforce.tf_api.core.enums.ProjectRole;
import com.taskforce.tf_api.core.enums.RuleScope;
import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.harness.rules.HarnessRulesService;
import com.taskforce.tf_api.core.model.HarnessRuleSet;
import com.taskforce.tf_api.core.model.ProcessDefinition;
import com.taskforce.tf_api.core.model.ProcessVersion;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.ProjectMember;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.process.BpmnExport;
import com.taskforce.tf_api.core.process.ProcessFingerprint;
import com.taskforce.tf_api.core.process.ProcessJson;
import com.taskforce.tf_api.core.process.ProcessModel;
import com.taskforce.tf_api.core.process.ProcessValidatorTest;
import com.taskforce.tf_api.core.repository.HarnessRuleSetRepository;
import com.taskforce.tf_api.core.repository.ProcessDefinitionRepository;
import com.taskforce.tf_api.core.repository.ProcessVersionRepository;
import com.taskforce.tf_api.core.repository.ProjectMemberRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.AuditService;
import com.taskforce.tf_api.core.service.ProjectVisibilityGuard;
import com.taskforce.tf_api.core.service.TestPersonIds;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

/**
 * Les processus d'un projet, de la lecture à la publication (ADR-027, règle 3) : l'espace, puis le projet, puis le rôle ;
 * une publication écrit une version immuable, numérotée à la suite, avec son auteur et son empreinte, et entre au
 * journal ; le vérificateur refuse avant toute écriture ; les étapes verrouillées restent d'une version à l'autre.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("Les processus d'un projet, de la lecture à la publication")
class ProcessServiceTest {

    static final long ADMIN = 7L;
    static final long LEAD = 5L;
    static final long MEMBER = 8L;
    static final long HIDDEN = 6L;
    static final long STRANGER = 9L;
    static final long PROJECT = 12L;
    private static final ObjectMapper JSON = new ObjectMapper();

    @Mock private WorkspaceRepository workspaces;
    @Mock private WorkspaceMemberRepository workspaceMembers;
    @Mock private ProjectRepository projects;
    @Mock private ProjectMemberRepository projectMembers;
    @Mock private ProjectVisibilityGuard visibility;
    @Mock private ProcessDefinitionRepository definitions;
    @Mock private ProcessVersionRepository versions;
    @Mock private UserRepository users;
    @Mock private HarnessRuleSetRepository ruleSets;
    @Mock private AuditService audit;

    private final List<ProcessDefinition> defs = new ArrayList<>();
    private final List<ProcessVersion> rows = new ArrayList<>();
    private ProcessService service;
    private Workspace ws;
    private Project project;

    /** Une ligne de la liste des versions, comme la requête la rend. */
    record Row(Long getDefinitionId, int getVersion, String getName, String getDigest, Long getAuthorId,
               LocalDateTime getCreatedAt) implements ProcessVersionRepository.Row {
    }

    private static User user(long id, String name) {
        return User.builder().id(id).email(name.toLowerCase() + "@example.com").displayName(name).build();
    }

    @BeforeEach
    void setUp() {
        User admin = user(ADMIN, "Pierre");
        ws = Workspace.builder().id(1L).slug("acme").name("Acme").owner(admin).build();
        project = Project.builder().id(PROJECT).name("Billing module").workspace(ws).build();
        List<WorkspaceMember> members = List.of(
            WorkspaceMember.builder().workspace(ws).user(admin).role(WorkspaceRole.ADMIN).build(),
            WorkspaceMember.builder().workspace(ws).user(user(LEAD, "Lea")).role(WorkspaceRole.MEMBER).build(),
            WorkspaceMember.builder().workspace(ws).user(user(MEMBER, "Marc")).role(WorkspaceRole.MEMBER).build(),
            WorkspaceMember.builder().workspace(ws).user(user(HIDDEN, "Hugo")).role(WorkspaceRole.MEMBER).build());
        lenient().when(workspaces.findBySlug("acme")).thenReturn(Optional.of(ws));
        lenient().when(workspaceMembers.existsByWorkspaceIdAndUserId(eq(1L), anyLong()))
            .thenAnswer(inv -> (long) inv.getArgument(1) != STRANGER);
        lenient().when(workspaceMembers.findByWorkspaceId(1L)).thenReturn(members);
        lenient().when(projects.findByIdAndWorkspaceId(PROJECT, 1L)).thenReturn(Optional.of(project));
        lenient().doThrow(new ResourceNotFoundException("Project not found")).when(visibility).assertCanView(project, HIDDEN);
        lenient().when(visibility.isWorkspaceAdmin(1L, ADMIN)).thenReturn(true);
        lenient().when(projectMembers.findByProjectIdAndUserId(PROJECT, LEAD))
            .thenReturn(Optional.of(ProjectMember.builder().role(ProjectRole.LEAD).build()));
        lenient().when(projectMembers.findByProjectIdAndUserId(PROJECT, MEMBER))
            .thenReturn(Optional.of(ProjectMember.builder().role(ProjectRole.MEMBER).build()));
        lenient().when(users.getReferenceById(anyLong())).thenAnswer(inv -> members.stream()
            .map(WorkspaceMember::getUser).filter(u -> u.getId().equals(inv.getArgument(0))).findFirst().orElseThrow());
        lenient().when(users.findAllById(any())).thenAnswer(inv -> {
            Collection<Long> ids = inv.getArgument(0);
            return members.stream().map(WorkspaceMember::getUser).filter(u -> ids.contains(u.getId())).toList();
        });
        lenient().when(definitions.findByProjectIdAndProcessKey(eq(PROJECT), anyString())).thenAnswer(inv -> defs.stream()
            .filter(d -> d.getProcessKey().equals(inv.getArgument(1))).findFirst());
        lenient().when(definitions.findByProjectIdOrderByCreatedAtAscIdAsc(PROJECT)).thenAnswer(inv -> List.copyOf(defs));
        lenient().when(definitions.saveAndFlush(any(ProcessDefinition.class))).thenAnswer(inv -> {
            ProcessDefinition d = inv.getArgument(0);
            d.setId((long) defs.size() + 100);
            defs.add(d);
            return d;
        });
        lenient().when(versions.findFirstByDefinitionIdOrderByVersionDesc(anyLong())).thenAnswer(inv -> rows.stream()
            .filter(v -> v.getDefinition().getId().equals(inv.getArgument(0)))
            .max((a, b) -> Integer.compare(a.getVersion(), b.getVersion())));
        lenient().when(versions.findByDefinitionIdAndVersion(anyLong(), any(Integer.class))).thenAnswer(inv -> rows.stream()
            .filter(v -> v.getDefinition().getId().equals(inv.getArgument(0)) && v.getVersion() == (int) inv.getArgument(1))
            .findFirst());
        lenient().when(versions.saveAndFlush(any(ProcessVersion.class))).thenAnswer(inv -> {
            ProcessVersion v = inv.getArgument(0);
            v.setId((long) rows.size() + 1);
            rows.add(v);
            return v;
        });
        lenient().when(versions.listRows(PROJECT)).thenAnswer(inv -> rows.stream()
            .sorted((a, b) -> Integer.compare(b.getVersion(), a.getVersion()))
            .map(v -> (ProcessVersionRepository.Row) new Row(v.getDefinition().getId(), v.getVersion(), v.getName(),
                v.getDigest(), v.getCreatedBy() == null ? null : v.getCreatedBy().getId(), v.getCreatedAt()))
            .toList());
        lenient().when(ruleSets.findByWorkspaceIdOrderByVersionDesc(1L)).thenReturn(List.of());
        service = new ProcessService(workspaces, workspaceMembers, projects, projectMembers, visibility, definitions,
            versions, users, new ProcessDefaults(), new HarnessRulesService(ruleSets, workspaceMembers, TestPersonIds.inMemory()), audit);
    }

    /** Le workflow par défaut d'E20, dérivé pour ce projet. */
    private static ObjectNode derived() {
        ObjectNode model = JSON.valueToTree(new ProcessDefaults().get("integrate-a-module").orElseThrow());
        model.put("derivedFrom", "integrate-a-module");
        return model;
    }

    private static ProcessModel model(ObjectNode node) {
        try {
            return JSON.treeToValue(node, ProcessModel.class);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    // ------------------------------------------------------------------------------------------------- publier

    @Test
    @DisplayName("le responsable du projet publie le workflow d'E20 : la version 1, avec son auteur et son empreinte, au journal")
    void the_lead_publishes_version_one() {
        ProcessModel model = model(derived());

        ProcessResponse.Publication published = service.publish("acme", PROJECT, model, LEAD);

        assertThat(published.refused()).isNull();
        assertThat(published.version().version()).isEqualTo(1);
        assertThat(published.version().author()).isEqualTo("Lea");
        assertThat(published.version().digest()).isEqualTo(ProcessFingerprint.of(model));
        assertThat(published.version().derivedFrom()).isEqualTo("integrate-a-module");
        assertThat(defs).singleElement().satisfies(d -> {
            assertThat(d.getProcessKey()).isEqualTo("integrate-a-module");
            assertThat(d.getProject()).isSameAs(project);
            assertThat(d.getWorkspace()).isSameAs(ws);
        });
        assertThat(ProcessJson.fromMap(rows.get(0).getModel())).isEqualTo(model);
        verify(audit).recordAfterCommit(eq(1L), eq(LEAD), eq(ProcessService.AUDIT_ACTION), eq("process_version"),
            eq("1"), anyMap());
    }

    @Test
    @DisplayName("publier de nouveau : la version 2 si quelque chose a changé, rien sinon")
    void the_next_version() {
        service.publish("acme", PROJECT, model(derived()), LEAD);

        ProcessResponse.Publication same = service.publish("acme", PROJECT, model(derived()), LEAD);
        ObjectNode changed = derived();
        changed.put("name", "Integrate the billing module");
        ProcessResponse.Publication next = service.publish("acme", PROJECT, model(changed), ADMIN);

        assertThat(same.version()).isNull();
        assertThat(same.refused().problems()).singleElement().satisfies(p -> {
            assertThat(p.code()).isEqualTo("unchanged");
            assertThat(p.message()).isEqualTo("Nothing changed since version 1: there is nothing to publish.");
        });
        assertThat(next.version().version()).isEqualTo(2);
        assertThat(next.version().author()).isEqualTo("Pierre");
        assertThat(defs).hasSize(1);
        assertThat(rows).hasSize(2);
    }

    @Test
    @DisplayName("une étape verrouillée de la version en vigueur ne s'en va pas, même sans workflow par défaut")
    void a_locked_step_stays_from_one_version_to_the_next() {
        ObjectNode first = derived();
        first.remove("derivedFrom");
        service.publish("acme", PROJECT, model(first), LEAD);
        ObjectNode next = first.deepCopy();
        ObjectNode deliver = ProcessValidatorTest.step(next, "deliver");
        ProcessValidatorTest.remove(
            ProcessValidatorTest.steps(deliver), "before-delivery");
        ProcessValidatorTest.remove(
            ProcessValidatorTest.flows(deliver), "before-delivery-deliver-module");
        ProcessValidatorTest.flow(deliver, "deliver-start-before-delivery")
            .put("to", "deliver-module");

        ProcessResponse.Publication refused = service.publish("acme", PROJECT, model(next), LEAD);

        assertThat(refused.version()).isNull();
        assertThat(refused.refused().problems()).extracting(ProcessResponse.Problem::code)
            .contains("lockedStepMissing", "pausePointMissing");
        assertThat(rows).hasSize(1);
    }

    @Test
    @DisplayName("ce que le vérificateur refuse n'est pas écrit : les refus reviennent, en phrases")
    void refused_by_the_validator() {
        ObjectNode model = derived();
        ProcessValidatorTest.step(model, "spec-zone").remove("answeredBy");
        ((ObjectNode) ProcessValidatorTest.step(model, "build-zone").get("rules").get(0))
            .put("ref", "no-such-rule");

        ProcessResponse.Publication refused = service.publish("acme", PROJECT, model(model), LEAD);

        assertThat(refused.refused().passed()).isFalse();
        assertThat(refused.refused().problems()).extracting(ProcessResponse.Problem::code)
            .containsExactlyInAnyOrder("noOwner", "unknownRule");
        assertThat(refused.refused().problems()).extracting(ProcessResponse.Problem::message)
            .contains("“Build the module” follows a rule that doesn't apply to this project: no-such-rule.");
        verify(versions, never()).saveAndFlush(any());
        verify(definitions, never()).saveAndFlush(any());
        verify(audit, never()).recordAfterCommit(anyLong(), anyLong(), anyString(), anyString(), anyString(), anyMap());
    }

    @Test
    @DisplayName("un membre qui n'est pas le responsable du projet ne publie pas")
    void a_member_does_not_publish() {
        assertThatThrownBy(() -> service.publish("acme", PROJECT, model(derived()), MEMBER))
            .isInstanceOf(ForbiddenException.class)
            .hasMessage("Only the project's lead, or an owner or admin of the workspace, can publish its processes.");
        verify(versions, never()).saveAndFlush(any());
    }

    @Test
    @DisplayName("l'appartenance au projet d'abord : un projet privé qu'on ne voit pas reste introuvable, avant le rôle")
    void membership_of_the_project_first() {
        assertThatThrownBy(() -> service.publish("acme", PROJECT, model(derived()), HIDDEN))
            .isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(() -> service.overview("acme", PROJECT, HIDDEN)).isInstanceOf(ResourceNotFoundException.class);
        verify(projectMembers, never()).findByProjectIdAndUserId(PROJECT, HIDDEN);
    }

    @Test
    @DisplayName("hors de l'espace : rien, ni les processus ni les workflows par défaut")
    void a_stranger_gets_nothing() {
        assertThatThrownBy(() -> service.overview("acme", PROJECT, STRANGER)).isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> service.defaults("acme", STRANGER)).isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> service.publish("acme", PROJECT, model(derived()), STRANGER))
            .isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> service.overview("nowhere", PROJECT, LEAD)).isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    @DisplayName("deux publications en même temps : la seconde le dit, sans rien casser")
    void a_concurrent_publication() {
        when(versions.saveAndFlush(any(ProcessVersion.class))).thenThrow(new DataIntegrityViolationException("dup"));

        assertThatThrownBy(() -> service.publish("acme", PROJECT, model(derived()), LEAD))
            .isInstanceOf(BusinessException.class)
            .hasMessage("The process changed while you were publishing it. Read it again, then publish.");
    }

    // ------------------------------------------------------------------------------------------------- lire

    @Test
    @DisplayName("lire : la version en vigueur, son auteur, le compte des versions, et qui peut publier")
    void reading() {
        service.publish("acme", PROJECT, model(derived()), LEAD);
        ObjectNode changed = derived();
        changed.put("name", "Integrate the billing module");
        service.publish("acme", PROJECT, model(changed), LEAD);

        ProcessResponse.Overview asMember = service.overview("acme", PROJECT, MEMBER);
        ProcessResponse.Overview asLead = service.overview("acme", PROJECT, LEAD);
        ProcessResponse.Detail detail = service.detail("acme", PROJECT, "integrate-a-module", MEMBER);
        ProcessResponse.Version first = service.version("acme", PROJECT, "integrate-a-module", 1, MEMBER);

        assertThat(asMember.canPublish()).isFalse();
        assertThat(asLead.canPublish()).isTrue();
        assertThat(asMember.processes()).singleElement().satisfies(s -> {
            assertThat(s.version()).isEqualTo(2);
            assertThat(s.name()).isEqualTo("Integrate the billing module");
            assertThat(s.author()).isEqualTo("Lea");
            assertThat(s.versions()).isEqualTo(2);
        });
        assertThat(detail.current().version()).isEqualTo(2);
        assertThat(detail.versions()).extracting(ProcessResponse.VersionSummary::version).containsExactly(2, 1);
        assertThat(first.name()).isEqualTo("Integrate a module");
        assertThatThrownBy(() -> service.version("acme", PROJECT, "integrate-a-module", 3, MEMBER))
            .isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(() -> service.detail("acme", PROJECT, "unknown", MEMBER))
            .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    @DisplayName("exporter une version : son BPMN, nommé par sa clé et sa version ; le réimporter : la même empreinte")
    void export_then_import() {
        ProcessModel model = model(derived());
        service.publish("acme", PROJECT, model, LEAD);

        ProcessService.BpmnFile file = service.export("acme", PROJECT, "integrate-a-module", 1, MEMBER);
        ProcessResponse.Import back = service.importBpmn("acme", PROJECT, file.xml(), MEMBER);

        assertThat(file.fileName()).isEqualTo("integrate-a-module-v1.bpmn");
        assertThat(file.xml()).isEqualTo(BpmnExport.toXml(model));
        assertThat(back.digest()).isEqualTo(ProcessFingerprint.of(model));
        // Rien n'a changé depuis la version 1 : l'import le dit, il ne publie rien.
        assertThat(back.passed()).isTrue();
        assertThat(back.problems()).isEmpty();
        assertThat(rows).hasSize(1);
    }

    @Test
    @DisplayName("importer : un fichier illisible le dit ; un élément hors du sous-ensemble est refusé avec sa raison")
    void importing() {
        ProcessResponse.Import unreadable = service.importBpmn("acme", PROJECT, "not xml", MEMBER);
        ProcessResponse.Import outside = service.importBpmn("acme", PROJECT, """
            <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d" targetNamespace="t">
              <bpmn:process id="pick" name="Pick"><bpmn:inclusiveGateway id="g" name="Which suppliers?"/></bpmn:process>
            </bpmn:definitions>
            """, MEMBER);

        assertThat(unreadable.passed()).isFalse();
        assertThat(unreadable.model()).isNull();
        assertThat(unreadable.problems()).singleElement().extracting(ProcessResponse.Problem::code).isEqualTo("unreadable");
        assertThat(outside.passed()).isFalse();
        assertThat(outside.problems()).singleElement().satisfies(p -> {
            assertThat(p.code()).isEqualTo("notInSubset");
            assertThat(p.message()).startsWith("“Which suppliers?” takes several paths at once");
        });
    }

    private HarnessRuleSet layer(RuleScope scope, Project on, String processKey, String rule) {
        return HarnessRuleSet.builder().workspace(ws).version(1).scope(scope).project(on).processKey(processKey)
            .rules(List.of(Map.of("id", rule, "effect", "deny", "when", Map.of("action", "repo.push")))).build();
    }

    @Test
    @DisplayName("le vérificateur ne connaît que les règles qui s'appliquent à ce projet et à ce processus")
    void only_the_rules_that_apply_here() {
        Project other = Project.builder().id(99L).name("Other").workspace(ws).build();
        when(ruleSets.findByWorkspaceIdOrderByVersionDesc(1L)).thenReturn(List.of(
            layer(RuleScope.PROJECT, other, null, "billing-only"),
            layer(RuleScope.PROCESS, null, "other-process", "other-process-only"),
            layer(RuleScope.PROJECT, project, null, "this-project-only"),
            layer(RuleScope.PROCESS, null, "integrate-a-module", "this-process-only")));
        ObjectNode model = derived();
        ArrayNode refs = (ArrayNode) ProcessValidatorTest.step(model, "spec-zone").get("rules");
        for (String ref : List.of("billing-only", "other-process-only", "this-project-only", "this-process-only")) {
            refs.addObject().put("ref", ref);
        }

        ProcessResponse.Check check = service.check("acme", PROJECT, model(model), MEMBER);

        assertThat(check.problems()).extracting(ProcessResponse.Problem::message).containsExactlyInAnyOrder(
            "“Draft the specification” follows a rule that doesn't apply to this project: billing-only.",
            "“Draft the specification” follows a rule that doesn't apply to this project: other-process-only.");
    }

    @Test
    @DisplayName("ce qui change le code se lit dans le paquet du projet : une règle de la couche du projet qui demande de "
        + "pousser oblige les notes de version à passer le point d'avant d'appliquer")
    void the_code_rules_come_from_the_bundle() {
        when(ruleSets.findByWorkspaceIdOrderByVersionDesc(1L)).thenReturn(List.of(HarnessRuleSet.builder().workspace(ws)
            .version(1).scope(RuleScope.PROJECT).project(project).rules(List.of(Map.of("id", "ask-before-push",
                "effect", "ask", "when", Map.of("action", "git.push")))).build()));
        ObjectNode notes = derived();
        ((ArrayNode) ProcessValidatorTest.step(notes, "notes-zone").get("rules")).addObject().put("ref", "ask-before-push");
        ObjectNode more = derived();
        ProcessValidatorTest.buildMore(more);

        assertThat(service.check("acme", PROJECT, model(notes), MEMBER).problems())
            .extracting(ProcessResponse.Problem::code).containsExactly("changeWithoutPausePoint");
        assertThat(service.check("acme", PROJECT, model(more), MEMBER).problems())
            .extracting(ProcessResponse.Problem::code).containsExactly("changeWithoutPausePoint");
    }

    @Test
    @DisplayName("écrire dans les outils de l'entreprise est un changement : une règle de la couche du projet qui le "
        + "demande oblige les notes de version à passer le point d'avant d'appliquer")
    void a_write_in_the_company_tools_is_a_change() {
        when(ruleSets.findByWorkspaceIdOrderByVersionDesc(1L)).thenReturn(List.of(HarnessRuleSet.builder().workspace(ws)
            .version(1).scope(RuleScope.PROJECT).project(project).rules(List.of(Map.of("id", "ask-before-tools-write",
                "effect", "ask", "when", Map.of("action", "mcp.write")))).build()));
        ObjectNode notes = derived();
        ((ArrayNode) ProcessValidatorTest.step(notes, "notes-zone").get("rules")).addObject()
            .put("ref", "ask-before-tools-write");

        assertThat(service.check("acme", PROJECT, model(derived()), MEMBER).problems()).isEmpty();
        assertThat(service.check("acme", PROJECT, model(notes), MEMBER).problems())
            .extracting(ProcessResponse.Problem::code).containsExactly("changeWithoutPausePoint");
    }

    /** Un processus de {@code levels} phases emboîtées, construit sans récursion. */
    static ProcessModel nested(int levels) {
        ProcessModel.Step inner = null;
        for (int i = levels; i >= 1; i--) {
            inner = new ProcessModel.Step("stage-" + i, ProcessModel.STAGE, "Stage " + i, null, null, null, null, null,
                null, null, null, null, null, null, null, inner == null ? null : List.of(inner), null);
        }
        return new ProcessModel(ProcessModel.FORMAT, "deep", "Deep", null, null, List.of(inner), null);
    }

    @Test
    @DisplayName("un processus trop profond se refuse en une phrase, sans être parcouru ni avoir d'empreinte")
    void too_deep() {
        ProcessModel deep = nested(5000);

        ProcessResponse.Check check = service.check("acme", PROJECT, deep, MEMBER);
        ProcessResponse.Publication publication = service.publish("acme", PROJECT, deep, LEAD);

        assertThat(check.passed()).isFalse();
        assertThat(check.digest()).isNull();
        assertThat(check.problems()).singleElement().extracting(ProcessResponse.Problem::code).isEqualTo("tooDeep");
        assertThat(publication.version()).isNull();
        assertThat(publication.refused().problems()).extracting(ProcessResponse.Problem::code)
            .containsExactly("tooDeep");
        verify(versions, never()).saveAndFlush(any());
    }

    @Test
    @DisplayName("vérifier n'écrit rien")
    void checking_writes_nothing() {
        ProcessResponse.Check check = service.check("acme", PROJECT, model(derived()), MEMBER);

        assertThat(check.passed()).isTrue();
        assertThat(check.digest()).startsWith("sha256:");
        verify(versions, never()).saveAndFlush(any());
    }

    @Test
    @DisplayName("les workflows par défaut : le processus d'E20, avec son empreinte, et son export")
    void the_defaults() {
        List<ProcessResponse.Default> defaults = service.defaults("acme", MEMBER);
        ProcessService.BpmnFile file = service.exportDefault("acme", "integrate-a-module", MEMBER);

        assertThat(defaults).extracting(ProcessResponse.Default::key).containsExactly("integrate-a-module");
        assertThat(defaults.get(0).digest()).isEqualTo(ProcessFingerprint.of(defaults.get(0).model()));
        assertThat(file.fileName()).isEqualTo("integrate-a-module.bpmn");
        assertThat(file.xml()).contains("<tf:process format=\"taskforce-process/1\"/>");
        assertThatThrownBy(() -> service.exportDefault("acme", "unknown", MEMBER))
            .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    @DisplayName("un modèle sans format prend celui de TaskForce")
    void the_format_is_given() {
        ObjectNode model = derived();
        model.remove("format");

        ProcessResponse.Publication published = service.publish("acme", PROJECT, model(model), LEAD);

        assertThat(published.version().model().format()).isEqualTo(ProcessModel.FORMAT);
        assertThat(rows.get(0).getModel()).containsEntry("format", ProcessModel.FORMAT);
    }
}
