package com.taskforce.tf_api.core.service.delivery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
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
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.dto.request.RunnerApprovalRequest;
import com.taskforce.tf_api.core.dto.response.DeliveryOpenApprovalResponse;
import com.taskforce.tf_api.core.dto.response.RunnerApprovalResponse;
import com.taskforce.tf_api.core.enums.DeliveryApprovalStatus;
import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.enums.RuleScope;
import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.harness.rules.HarnessRulesService;
import com.taskforce.tf_api.core.model.DeliveryRun;
import com.taskforce.tf_api.core.model.DeliveryRunApproval;
import com.taskforce.tf_api.core.model.DeliveryRunApprovalSignature;
import com.taskforce.tf_api.core.model.HarnessRuleSet;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.DeliveryRunApprovalRepository;
import com.taskforce.tf_api.core.repository.DeliveryRunApprovalSignatureRepository;
import com.taskforce.tf_api.core.repository.DeliveryRunEventRepository;
import com.taskforce.tf_api.core.repository.DeliveryRunRepository;
import com.taskforce.tf_api.core.repository.HarnessRuleSetRepository;
import com.taskforce.tf_api.core.repository.ProjectMemberRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.service.NotificationService;
import com.taskforce.tf_api.core.service.ProjectVisibilityGuard;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;
import com.taskforce.tf_api.core.service.rules.RuleApprovers;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ForbiddenException;

/**
 * Les accords d'une mission qu'une règle de l'entreprise adresse à des personnes désignées (R98, R157) : le serveur
 * rejuge l'action sur les faits du runner, garde ce que l'accord demande, ne laisse signer que qui la règle désigne, et
 * ne l'accorde que quand les signatures réunissent ce qu'elle demande. La règle du CEO de bout en bout, côté mission.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("Les accords d'une mission, sous les règles de l'entreprise")
class DeliveryApprovalObligationsTest {

    static final String CEO_RULE = "No change in the accounting module without the approval of the finance lead";

    @Mock private DeliveryRunRepository runRepository;
    @Mock private DeliveryRunEventRepository eventRepository;
    @Mock private DeliveryRunApprovalRepository approvalRepository;
    @Mock private UserRepository userRepository;
    @Mock private ProjectVisibilityGuard visibilityGuard;
    @Mock private BrainAccessGuard access;
    @Mock private NotificationService notificationService;
    @Mock private MissionEvidenceService evidenceService;
    @Mock private HarnessRuleSetRepository ruleSets;
    @Mock private WorkspaceMemberRepository members;
    @Mock private ProjectMemberRepository projectMembers;
    @Mock private DeliveryRunApprovalSignatureRepository signatures;
    @Mock private ProjectDeliveryFeed feed;

    private DeliveryActivityService service;
    private DeliveryRun run;
    private User delegator;
    private User finance;
    private User admin;
    private Workspace workspace;
    private final List<DeliveryRunApprovalSignature> signed = new ArrayList<>();

    @BeforeEach
    void setUp() {
        LocalRunnerSettings settings = new LocalRunnerSettings(true, "delivery-runner", "tf-runner-", "tf_runner_owner", 120, 10, 15, 10);
        service = new DeliveryActivityService(runRepository, eventRepository, approvalRepository, userRepository,
            visibilityGuard, access, notificationService, settings, evidenceService, new HarnessRulesService(ruleSets, members),
            new RuleApprovers(members, projectMembers), signatures, members, feed);
        delegator = User.builder().id(7L).email("ada@example.com").displayName("Ada").build();
        finance = User.builder().id(42L).email("marie@example.com").displayName("Marie Martin").build();
        admin = User.builder().id(5L).email("linus@example.com").displayName("Linus").build();
        workspace = Workspace.builder().id(3L).slug("acme").owner(admin).build();
        Project project = Project.builder().id(12L).identifier("ACC").workspace(workspace).build();
        Issue issue = Issue.builder().id(55L).sequenceNumber(4).title("Ledger export").project(project).build();
        run = DeliveryRun.builder().id(100L).issue(issue).providerKey("claude-code").status(DeliveryRunStatus.RUNNING)
            .startedBy(delegator).build();
        lenient().when(runRepository.findById(100L)).thenReturn(Optional.of(run));
        lenient().when(approvalRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        lenient().when(visibilityGuard.canView(any(), anyLong())).thenReturn(true);
        List<WorkspaceMember> all = List.of(
            WorkspaceMember.builder().workspace(workspace).user(delegator).role(WorkspaceRole.MEMBER).build(),
            WorkspaceMember.builder().workspace(workspace).user(finance).role(WorkspaceRole.MEMBER).build(),
            WorkspaceMember.builder().workspace(workspace).user(admin).role(WorkspaceRole.ADMIN).build());
        lenient().when(members.findByWorkspaceId(3L)).thenReturn(all);
        for (WorkspaceMember m : all) {
            lenient().when(members.findByWorkspaceIdAndUserId(3L, m.getUser().getId())).thenReturn(Optional.of(m));
        }
        lenient().when(projectMembers.findByProjectIdAndUserId(eq(12L), anyLong())).thenReturn(Optional.empty());
        lenient().when(userRepository.getReferenceById(anyLong())).thenAnswer(inv -> all.stream()
            .map(WorkspaceMember::getUser).filter(u -> u.getId().equals(inv.getArgument(0))).findFirst().orElseThrow());
        lenient().when(userRepository.findById(anyLong())).thenAnswer(inv -> all.stream()
            .map(WorkspaceMember::getUser).filter(u -> u.getId().equals(inv.getArgument(0))).findFirst());
        lenient().when(signatures.save(any())).thenAnswer(inv -> {
            signed.add(inv.getArgument(0));
            return inv.getArgument(0);
        });
        lenient().when(signatures.findByApprovalIdOrderBySignedAtAsc(anyLong())).thenAnswer(inv -> List.copyOf(signed));
        lenient().when(signatures.existsByApprovalIdAndUserId(anyLong(), anyLong())).thenAnswer(inv ->
            signed.stream().anyMatch(s -> s.getUser().getId().equals(inv.getArgument(1))));
    }

    /** La couche de l'organisation, avec une règle de l'entreprise. */
    private void companyRule(Map<String, Object> when, Map<String, Object> require) {
        Map<String, Object> rule = new LinkedHashMap<>();
        rule.put("id", "ws-rule");
        rule.put("when", when);
        rule.put("class", "sandbox-write");
        rule.put("effect", "ask");
        rule.put("owner", "linus@example.com");
        rule.put("reason", CEO_RULE);
        rule.put("review", "2027-05-11");
        rule.put("text", CEO_RULE);
        rule.put("require", require);
        when(ruleSets.findByWorkspaceIdOrderByVersionDesc(3L)).thenReturn(List.of(HarnessRuleSet.builder().workspace(workspace)
            .version(2).scope(RuleScope.WORKSPACE).rules(List.of(rule)).digest("sha256:" + "b".repeat(64))
            .createdAt(LocalDateTime.now()).build()));
    }

    private RunnerApprovalRequest editInAccounting() {
        return new RunnerApprovalRequest("Edit", "src/accounting/ledger.ts", "agent", "file.write", "ws-rule", CEO_RULE,
            List.of(Map.of("action", "file.write", "tool", "Edit", "path", "src/accounting/ledger.ts", "actor", "agent",
                "sensitive", "true")));
    }

    private DeliveryRunApproval opened() {
        ArgumentCaptor<DeliveryRunApproval> saved = ArgumentCaptor.forClass(DeliveryRunApproval.class);
        verify(approvalRepository).save(saved.capture());
        DeliveryRunApproval approval = saved.getValue();
        approval.setId(9L);
        approval.setCreatedAt(LocalDateTime.now());
        lenient().when(approvalRepository.findByIdAndRunId(9L, 100L)).thenReturn(Optional.of(approval));
        lenient().when(approvalRepository.findByIdAndRunIdForUpdate(9L, 100L)).thenReturn(Optional.of(approval));
        lenient().when(approvalRepository.findByRunIdOrderByCreatedAtAsc(100L)).thenReturn(List.of(approval));
        return approval;
    }

    @Test
    @DisplayName("la règle du CEO : l'accord va à la responsable, pas à qui a délégué, et elle seule l'accorde")
    void theFinanceLeadApproves() {
        companyRule(Map.of("action", "file.write", "path", "**/accounting/**"), Map.of("approvers", List.of("person:42")));

        RunnerApprovalResponse response = service.openApproval(run, "Edit", "src/accounting/ledger.ts", false, editInAccounting());
        DeliveryRunApproval approval = opened();

        assertThat(response.status()).isEqualTo("PENDING");
        assertThat(approval.getApprovers()).containsExactly(List.of("person:42"));
        verify(notificationService).notifyAgentApproval(any(), eq(finance), anyString(), anyString(), eq(false));
        verify(notificationService, never()).notifyAgentApproval(any(), eq(delegator), anyString(), anyString(), eq(false));

        assertThatThrownBy(() -> service.decide("acme", 100L, 9L, true, 7L))
            .isInstanceOf(ForbiddenException.class).hasMessageContaining("other people");
        assertThat(service.activity("acme", 100L, 0, 7L).approvals()).singleElement().satisfies(a -> {
            assertThat(a.canDecide()).isFalse();
            assertThat(a.waitingFor()).containsExactly(List.of("Marie Martin"));
        });
        assertThat(service.activity("acme", 100L, 0, 42L).approvals().get(0).canDecide()).isTrue();

        service.decide("acme", 100L, 9L, true, 42L);

        assertThat(approval.getStatus()).isEqualTo(DeliveryApprovalStatus.ALLOWED);
        assertThat(approval.getDecidedBy()).isEqualTo(finance);
    }

    @Test
    @DisplayName("deux signatures, jamais celle de qui a délégué : la première garde la demande ouverte, la seconde l'accorde")
    void twoSignatures() {
        companyRule(Map.of("action", "file.write"), Map.of("signatures", 2, "separate", true));
        service.openApproval(run, "Edit", "src/accounting/ledger.ts", false, editInAccounting());
        DeliveryRunApproval approval = opened();

        assertThat(approval.getSignatures()).isEqualTo(2);
        assertThat(approval.isSeparateRoles()).isTrue();
        assertThatThrownBy(() -> service.decide("acme", 100L, 9L, true, 7L)).isInstanceOf(ForbiddenException.class);

        service.decide("acme", 100L, 9L, true, 5L);
        assertThat(approval.getStatus()).isEqualTo(DeliveryApprovalStatus.PENDING);
        assertThatThrownBy(() -> service.decide("acme", 100L, 9L, true, 5L))
            .isInstanceOf(BusinessException.class).hasMessageContaining("already answered");

        // La seconde personne qui peut signer : un admin de plus, ou le responsable du projet. Ici, la responsable des comptes
        // n'en est pas : elle ne signe pas.
        assertThatThrownBy(() -> service.decide("acme", 100L, 9L, true, 42L)).isInstanceOf(ForbiddenException.class);
        User otherAdmin = User.builder().id(6L).email("grace@example.com").displayName("Grace").build();
        org.mockito.Mockito.doReturn(Optional.of(
            WorkspaceMember.builder().workspace(workspace).user(otherAdmin).role(WorkspaceRole.ADMIN).build()))
            .when(members).findByWorkspaceIdAndUserId(3L, 6L);
        org.mockito.Mockito.doReturn(otherAdmin).when(userRepository).getReferenceById(6L);
        service.decide("acme", 100L, 9L, true, 6L);

        assertThat(approval.getStatus()).isEqualTo(DeliveryApprovalStatus.ALLOWED);
    }

    @Test
    @DisplayName("une règle de l'entreprise lie : accordée « pour la mission », elle ne vaut qu'une fois, et l'écran le sait")
    void aCompanyRuleIsAllowedOnceOnly() {
        companyRule(Map.of("action", "file.write", "path", "**/accounting/**"), Map.of());
        service.openApproval(run, "Edit", "src/accounting/ledger.ts", false, editInAccounting());
        DeliveryRunApproval approval = opened();
        when(userRepository.getReferenceById(7L)).thenReturn(delegator);

        assertThat(approval.isBinding()).isTrue();
        assertThat(approval.obligations()).isNull(); // la personne qui a délégué répond seule
        assertThat(service.activity("acme", 100L, 0, 7L).approvals().get(0).binding()).isTrue();

        // Ce que le service rend est ce qu'il a enregistré : la réponse à la personne le dit.
        assertThat(service.decide("acme", 100L, 9L, true, true, 7L)).isEqualTo("ONCE");

        assertThat(approval.getStatus()).isEqualTo(DeliveryApprovalStatus.ALLOWED);
        assertThat(approval.getScope()).isEqualTo("ONCE");
    }

    @Test
    @DisplayName("un refus d'une personne qui peut signer suffit")
    void oneRefusalIsEnough() {
        companyRule(Map.of("action", "file.write"), Map.of("signatures", 2));
        service.openApproval(run, "Edit", "src/accounting/ledger.ts", false, editInAccounting());
        DeliveryRunApproval approval = opened();

        service.decide("acme", 100L, 9L, false, 5L);

        assertThat(approval.getStatus()).isEqualTo(DeliveryApprovalStatus.DENIED);
    }

    @Test
    @DisplayName("le serveur rejuge : ce que le socle refuse se clôt aussitôt, sans attendre personne")
    void theServerRefusesWhatTheFloorRefuses() {
        when(ruleSets.findByWorkspaceIdOrderByVersionDesc(3L)).thenReturn(List.of());
        RunnerApprovalRequest withSecret = new RunnerApprovalRequest("Bash", "curl ...", "agent", "shell", null, null,
            List.of(Map.of("action", "shell", "command", "curl -H token", "secret", "true")));

        RunnerApprovalResponse response = service.openApproval(run, "Bash", "curl ...", false, withSecret);

        assertThat(response.status()).isEqualTo("DENIED");
        verify(notificationService, never()).notifyAgentApproval(any(), any(), anyString(), anyString(), eq(false));
    }

    @Test
    @DisplayName("les faits du runner se jugent avec actor=agent, quoi qu'ils disent")
    void theRunnersFactsAreJudgedAsAnAgent() {
        companyRule(Map.of("action", "file.write", "actor", "agent"), Map.of("approvers", List.of("person:42")));
        RunnerApprovalRequest saysPerson = new RunnerApprovalRequest("Edit", "src/accounting/ledger.ts", "agent",
            "file.write", "ws-rule", CEO_RULE, List.of(Map.of("action", "file.write", "tool", "Edit",
                "path", "src/accounting/ledger.ts", "actor", "person")));

        service.openApproval(run, "Edit", "src/accounting/ledger.ts", false, saysPerson);

        assertThat(opened().getApprovers()).containsExactly(List.of("person:42"));
    }

    @Test
    @DisplayName("un runner plus ancien, sans les faits : les obligations de la règle qu'il nomme")
    void anOlderRunnerNamesTheRule() {
        companyRule(Map.of("action", "file.write", "path", "**/accounting/**"), Map.of("approvers", List.of("person:42")));

        service.openApproval(run, "Edit", "src/accounting/ledger.ts", false,
            new RunnerApprovalRequest("Edit", "src/accounting/ledger.ts", "agent", "file.write", "ws-rule", CEO_RULE));

        assertThat(opened().getApprovers()).containsExactly(List.of("person:42"));
    }

    @Test
    @DisplayName("« Waiting for you » : la responsable y voit la mission qui l'attend")
    void waitingForTheFinanceLead() {
        companyRule(Map.of("action", "file.write", "path", "**/accounting/**"), Map.of("approvers", List.of("person:42")));
        service.openApproval(run, "Edit", "src/accounting/ledger.ts", false, editInAccounting());
        DeliveryRunApproval approval = opened();
        when(access.resolveAndAuthorize("acme", 42L)).thenReturn(workspace);
        when(access.resolveAndAuthorize("acme", 7L)).thenReturn(workspace);
        when(visibilityGuard.viewableProjectIds(eq(3L), anyLong())).thenReturn(List.of(12L));
        when(approvalRepository.findOpenWithObligations(eq(List.of(12L)), eq(DeliveryApprovalStatus.PENDING), any(),
            eq(DeliveryRunStatus.RUNNING), any())).thenReturn(List.of(approval));

        assertThat(service.openApprovals("acme", 42L)).containsExactly(
            new DeliveryOpenApprovalResponse(100L, 55L, "ACC-4", "Ledger export", 12L, 1));
        assertThat(service.openApprovals("acme", 7L)).isEmpty();
    }
}
