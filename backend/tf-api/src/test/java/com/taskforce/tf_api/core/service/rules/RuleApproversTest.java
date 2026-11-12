package com.taskforce.tf_api.core.service.rules;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.enums.ProjectRole;
import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.harness.rules.RulesEngine.Obligations;
import com.taskforce.tf_api.core.model.ProjectMember;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.ProjectMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;

/** Qui signe un accord qu'une règle de l'entreprise demande, et quand il est complet (R98). */
@ExtendWith(MockitoExtension.class)
@DisplayName("Les signataires d'un accord")
class RuleApproversTest {

    private static final long WS = 1L;
    private static final long PROJECT = 12L;
    private static final long DELEGATOR = 7L;
    private static final long FINANCE = 42L;
    private static final long ADMIN = 5L;
    private static final long LEAD = 9L;

    @Mock private WorkspaceMemberRepository members;
    @Mock private ProjectMemberRepository projectMembers;

    private RuleApprovers approvers;

    @BeforeEach
    void setUp() {
        approvers = new RuleApprovers(members, projectMembers);
        member(DELEGATOR, WorkspaceRole.MEMBER, "Pierre");
        member(FINANCE, WorkspaceRole.MEMBER, "Marie Martin");
        member(ADMIN, WorkspaceRole.ADMIN, "Ada");
        member(LEAD, WorkspaceRole.MEMBER, "Linus");
        lenient().when(projectMembers.findByProjectIdAndUserId(eq(PROJECT), anyLong())).thenReturn(Optional.empty());
        lenient().when(projectMembers.findByProjectIdAndUserId(PROJECT, LEAD))
            .thenReturn(Optional.of(ProjectMember.builder().role(ProjectRole.LEAD).build()));
    }

    private void member(long id, WorkspaceRole role, String name) {
        lenient().when(members.findByWorkspaceIdAndUserId(WS, id)).thenReturn(Optional.of(
            WorkspaceMember.builder().role(role).user(User.builder().id(id).displayName(name).email(id + "@x.dev").build()).build()));
    }

    private static Obligations finance() {
        return new Obligations(List.of(List.of("person:" + FINANCE)), 1, false);
    }

    @Test
    @DisplayName("un accord ordinaire : la personne qui a délégué, seule")
    void ordinary() {
        assertThat(approvers.maySign(null, WS, PROJECT, DELEGATOR, DELEGATOR)).isTrue();
        assertThat(approvers.maySign(null, WS, PROJECT, DELEGATOR, ADMIN)).isFalse();
        assertThat(approvers.complete(null, WS, PROJECT, List.of(DELEGATOR))).isTrue();
        assertThat(approvers.aloneSuffices(null, WS, PROJECT, DELEGATOR)).isTrue();
    }

    @Test
    @DisplayName("la règle du CEO : seule la responsable désignée accorde, et une signature suffit")
    void theFinanceLeadSigns() {
        assertThat(approvers.maySign(finance(), WS, PROJECT, DELEGATOR, FINANCE)).isTrue();
        assertThat(approvers.maySign(finance(), WS, PROJECT, DELEGATOR, DELEGATOR)).isFalse();
        assertThat(approvers.maySign(finance(), WS, PROJECT, DELEGATOR, ADMIN)).isFalse();
        assertThat(approvers.complete(finance(), WS, PROJECT, List.of(FINANCE))).isTrue();
        assertThat(approvers.aloneSuffices(finance(), WS, PROJECT, DELEGATOR)).isFalse();
        assertThat(approvers.aloneSuffices(finance(), WS, PROJECT, FINANCE)).isTrue();
        assertThat(approvers.names(finance(), WS)).containsExactly("Marie Martin");
        assertThat(approvers.labels(finance(), WS)).containsExactly(List.of("Marie Martin"));
    }

    @Test
    @DisplayName("deux signatures, sans celle de qui a préparé : un admin et le responsable du projet")
    void twoSignaturesWithSeparation() {
        Obligations two = new Obligations(List.of(), 2, true);

        assertThat(approvers.maySign(two, WS, PROJECT, DELEGATOR, DELEGATOR)).isFalse();
        assertThat(approvers.maySign(two, WS, PROJECT, DELEGATOR, ADMIN)).isTrue();
        assertThat(approvers.maySign(two, WS, PROJECT, DELEGATOR, LEAD)).isTrue();
        assertThat(approvers.maySign(two, WS, PROJECT, DELEGATOR, FINANCE)).isFalse();
        assertThat(approvers.complete(two, WS, PROJECT, List.of(ADMIN))).isFalse();
        assertThat(approvers.complete(two, WS, PROJECT, List.of(ADMIN, ADMIN))).isFalse();
        assertThat(approvers.complete(two, WS, PROJECT, List.of(ADMIN, LEAD))).isTrue();
    }

    @Test
    @DisplayName("deux listes : il faut une personne de chacune, la même si elle est dans les deux")
    void everyListIsCovered() {
        Obligations both = new Obligations(List.of(List.of("person:" + FINANCE), List.of("role:admin")), 1, false);

        assertThat(approvers.complete(both, WS, PROJECT, List.of(FINANCE))).isFalse();
        assertThat(approvers.complete(both, WS, PROJECT, List.of(FINANCE, ADMIN))).isTrue();
        assertThat(approvers.names(both, WS)).containsExactly("Marie Martin", "an admin of the workspace");
    }

    @Test
    @DisplayName("les rôles : le propriétaire, un admin, le responsable du projet en cours")
    void roles() {
        member(3L, WorkspaceRole.OWNER, "Owner");
        assertThat(approvers.covers("role:owner", WS, PROJECT, 3L)).isTrue();
        assertThat(approvers.covers("role:owner", WS, PROJECT, ADMIN)).isFalse();
        assertThat(approvers.covers("role:admin", WS, PROJECT, 3L)).isTrue();
        assertThat(approvers.covers("project-lead", WS, PROJECT, LEAD)).isTrue();
        assertThat(approvers.covers("project-lead", WS, null, LEAD)).isFalse();
        assertThat(approvers.covers("role:admin", WS, PROJECT, 99L)).isFalse();
        assertThat(approvers.covers("person:42", WS, PROJECT, null)).isFalse();
        assertThat(approvers.labels(new Obligations(List.of(List.of("project-lead", "person:" + FINANCE)), 1, false), WS))
            .containsExactly(List.of("project-lead", "Marie Martin"));
    }
}
