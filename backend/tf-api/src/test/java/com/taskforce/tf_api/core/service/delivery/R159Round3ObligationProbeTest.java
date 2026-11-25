package com.taskforce.tf_api.core.service.delivery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import java.time.LocalDateTime;
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
import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.enums.RuleScope;
import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.harness.rules.HarnessRulesService;
import com.taskforce.tf_api.core.model.DeliveryRun;
import com.taskforce.tf_api.core.model.DeliveryRunApproval;
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
import com.taskforce.tf_api.core.service.TestPersonIds;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;
import com.taskforce.tf_api.core.service.rules.RuleApprovers;
import com.taskforce.tf_api.shared.exception.BusinessException;

/**
 * La sonde de la relecture R159 de #551, troisième tour (C1), sur le montage de {@link DeliveryApprovalObligationsTest} :
 * une règle de l'entreprise demande l'accord de la personne 42 pour toute commande qui vise `prod-db`. L'agent place
 * `prod-db` après le 4 000e caractère d'une commande simple ; le runner juge la commande entière, puis coupe le fait pour
 * le dossier. Sur `936ef711`, le serveur rejugeait la demande sur le fait coupé, qui ne dit plus `prod-db` : aucun
 * approbateur, une signature, et la demande allait à qui a délégué. Une demande d'accord sur un fait coupé est refusée.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("Une demande d'accord sur un fait coupé, sonde R159 de #551 (troisième tour, C1)")
class R159Round3ObligationProbeTest {

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
    private User dba;

    @BeforeEach
    void setUp() {
        LocalRunnerSettings settings = new LocalRunnerSettings(true, "delivery-runner", "tf-runner-", "tf_runner_owner", 120, 10, 15, 10);
        service = new DeliveryActivityService(runRepository, eventRepository, approvalRepository, userRepository,
            visibilityGuard, access, notificationService, settings, evidenceService, new HarnessRulesService(ruleSets, members, TestPersonIds.inMemory()),
            new RuleApprovers(members, projectMembers), signatures, members, feed);
        delegator = User.builder().id(7L).email("ada@example.com").displayName("Ada").build();
        dba = User.builder().id(42L).email("marie@example.com").displayName("Marie Martin").build();
        User admin = User.builder().id(5L).email("linus@example.com").displayName("Linus").build();
        Workspace workspace = Workspace.builder().id(3L).slug("acme").owner(admin).build();
        Project project = Project.builder().id(12L).identifier("OPS").workspace(workspace).build();
        Issue issue = Issue.builder().id(55L).sequenceNumber(4).title("Clean the ledger").project(project).build();
        run = DeliveryRun.builder().id(100L).issue(issue).providerKey("claude-code").status(DeliveryRunStatus.RUNNING)
            .startedBy(delegator).build();
        lenient().when(runRepository.findById(100L)).thenReturn(Optional.of(run));
        lenient().when(approvalRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        lenient().when(visibilityGuard.canView(any(), anyLong())).thenReturn(true);
        List<WorkspaceMember> all = List.of(
            WorkspaceMember.builder().workspace(workspace).user(delegator).role(WorkspaceRole.MEMBER).build(),
            WorkspaceMember.builder().workspace(workspace).user(dba).role(WorkspaceRole.MEMBER).build(),
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
        lenient().when(evidenceService.person(any(), any())).thenAnswer(inv -> {
            User user = inv.getArgument(1);
            return new MissionEvidenceService.Actor("person", user == null ? "unknown" : "who:" + user.getId());
        });
        // La règle de l'entreprise : toute commande qui vise prod-db demande l'accord de la personne 42.
        Map<String, Object> rule = new LinkedHashMap<>();
        rule.put("id", "ws-prod-db");
        rule.put("when", Map.of("action", "shell", "command", "**prod-db**"));
        rule.put("class", "irreversible");
        rule.put("effect", "ask");
        rule.put("owner", "linus@example.com");
        rule.put("reason", "A command on the production database needs the database administrator.");
        rule.put("review", "2027-05-11");
        rule.put("require", Map.of("approvers", List.of("person:42")));
        lenient().when(ruleSets.findByWorkspaceIdOrderByVersionDesc(3L)).thenReturn(List.of(HarnessRuleSet.builder().workspace(workspace)
            .version(2).scope(RuleScope.WORKSPACE).rules(List.of(rule)).digest("sha256:" + "b".repeat(64))
            .createdAt(LocalDateTime.now()).build()));
    }

    /** La coupe du runner (`taskforce-runner/src/text.ts`, `cut`) : au plus `max` unités, la marque au bout. */
    static String cut(String text, int max) {
        if (text.length() <= max) return text;
        String mark = "\n[TaskForce cut this text here: " + text.codePointCount(0, text.length()) + " characters in all]";
        int end = Math.max(0, max - mark.length());
        if (end > 0 && Character.isHighSurrogate(text.charAt(end - 1))) end--;
        return text.substring(0, end) + mark;
    }

    /** La demande d'accord telle que le runner l'envoie : la commande dans les faits, coupée pour tenir au dossier. */
    private RunnerApprovalRequest shell(String command) {
        String fact = cut(command, 4000);
        return new RunnerApprovalRequest("Bash", command.substring(0, Math.min(command.length(), 200)), "agent", "shell",
            "ws-prod-db", "A command on the production database needs the database administrator.",
            List.of(Map.of("action", "shell", "tool", "Bash", "command", fact, "actor", "agent")));
    }

    @Test
    @DisplayName("une commande courte : l'accord va à la personne que la règle désigne, et il lie")
    void aShortCommandGoesToTheDesignatedPerson() {
        service.openApproval(run, "Bash", "psql -h prod-db", false, shell("psql -h prod-db -c \"drop table ledger\""));

        ArgumentCaptor<DeliveryRunApproval> saved = ArgumentCaptor.forClass(DeliveryRunApproval.class);
        verify(approvalRepository).save(saved.capture());
        assertThat(saved.getValue().getApprovers()).containsExactly(List.of("person:42"));
        assertThat(saved.getValue().isBinding()).isTrue();
        verify(notificationService).notifyAgentApproval(any(), eq(dba), anyString(), anyString(), eq(false));
    }

    @Test
    @DisplayName("prod-db au-delà du 4 000e caractère : la demande sur le fait coupé est refusée, personne n'est sollicité")
    void aRequestOnACutFactIsRefused() {
        String command = "psql -v pad=" + "a".repeat(4100) + " -h prod-db -c \"drop table ledger\"";
        assertThat(command).hasSize(4146);

        assertThatThrownBy(() -> service.openApproval(run, "Bash", command.substring(0, 200), false, shell(command)))
            .isInstanceOf(BusinessException.class).hasMessageContaining("cut to fit the record");
        verify(approvalRepository, never()).save(any());
        verify(notificationService, never()).notifyAgentApproval(any(), any(), anyString(), anyString(), anyBoolean());
        verify(evidenceService, never()).append(any(), anyString(), any(), any());
    }
}
