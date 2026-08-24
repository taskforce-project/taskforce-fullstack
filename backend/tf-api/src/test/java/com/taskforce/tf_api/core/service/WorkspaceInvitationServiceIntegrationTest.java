package com.taskforce.tf_api.core.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.taskforce.tf_api.core.dto.request.CreateInvitationRequest;
import com.taskforce.tf_api.core.dto.response.InvitationResponse;
import com.taskforce.tf_api.core.enums.InvitationStatus;
import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.model.WorkspaceInvitation;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceInvitationRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.util.AbstractIntegrationTest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Tests d'intégration (invitations / contrôle d'accès, priorité critique) — {@link WorkspaceInvitationService}.
 * Repos réels ; {@code AuthorizationService} (requireManager) et {@code EmailService} mockés.
 * Couvre create (PENDING, garde-fous OWNER/déjà-membre), listPending, revoke, preview, accept (join + garde-fous).
 */
@DisplayName("WorkspaceInvitationService (intégration Postgres)")
@Import(WorkspaceInvitationService.class)
class WorkspaceInvitationServiceIntegrationTest extends AbstractIntegrationTest {

    @Autowired private WorkspaceInvitationService service;
    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private WorkspaceMemberRepository workspaceMemberRepository;
    @Autowired private WorkspaceInvitationRepository invitationRepository;

    @MockitoBean private AuthorizationService authorizationService; // requireManager → no-op
    @MockitoBean private EmailService emailService;

    private static final String SLUG = "ws-inv-it";
    private User owner;
    private Workspace workspace;

    @BeforeEach
    void seed() {
        owner = userRepository.save(User.builder()
            .keycloakId("kc-inv").email("owner@it.dev").displayName("Owner").isActive(true).build());
        workspace = workspaceRepository.save(Workspace.builder().name("Inv WS").slug(SLUG).owner(owner).build());
        workspaceMemberRepository.save(WorkspaceMember.builder().workspace(workspace).user(owner).role(WorkspaceRole.OWNER).build());
    }

    private CreateInvitationRequest req(String email, WorkspaceRole role) {
        CreateInvitationRequest r = new CreateInvitationRequest();
        r.setEmail(email);
        r.setRole(role);
        return r;
    }

    private User persistUser(String name) {
        return userRepository.save(User.builder()
            .keycloakId("kc-" + name).email(name + "@it.dev").displayName(name).isActive(true).build());
    }

    // =========================================================================
    @Nested
    @DisplayName("createInvitation")
    class Create {

        @Test
        @DisplayName("crée une invitation PENDING et envoie l'email")
        void should_create_pending_and_send_email() {
            InvitationResponse res = service.createInvitation(SLUG, owner.getId(), req("bob@it.dev", WorkspaceRole.MEMBER));

            assertThat(res.getStatus()).isEqualTo(InvitationStatus.PENDING);
            assertThat(res.getEmail()).isEqualTo("bob@it.dev");
            assertThat(invitationRepository.findByWorkspaceIdAndStatus(workspace.getId(), InvitationStatus.PENDING)).hasSize(1);
            org.mockito.Mockito.verify(emailService)
                .sendWorkspaceInvitationEmail(org.mockito.ArgumentMatchers.eq("bob@it.dev"),
                    org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
        }

        @Test
        @DisplayName("refuse d'inviter en tant qu'OWNER")
        void should_reject_owner_role() {
            assertThatThrownBy(() -> service.createInvitation(SLUG, owner.getId(), req("x@it.dev", WorkspaceRole.OWNER)))
                .isInstanceOf(BusinessException.class);
        }

        @Test
        @DisplayName("refuse d'inviter un utilisateur déjà membre du workspace")
        void should_reject_existing_member() {
            User bob = persistUser("bob");
            workspaceMemberRepository.save(WorkspaceMember.builder().workspace(workspace).user(bob).role(WorkspaceRole.MEMBER).build());

            assertThatThrownBy(() -> service.createInvitation(SLUG, owner.getId(), req("bob@it.dev", WorkspaceRole.MEMBER)))
                .isInstanceOf(BusinessException.class);
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("listPending / revoke / preview / accept")
    class Lifecycle {

        private WorkspaceInvitation createFor(String email) {
            service.createInvitation(SLUG, owner.getId(), req(email, WorkspaceRole.MEMBER));
            return invitationRepository.findByWorkspaceIdAndStatus(workspace.getId(), InvitationStatus.PENDING).get(0);
        }

        @Test
        @DisplayName("listPending renvoie les invitations en attente ; revoke passe en REVOKED")
        void should_list_and_revoke() {
            WorkspaceInvitation inv = createFor("carol@it.dev");
            assertThat(service.listPending(SLUG, owner.getId())).hasSize(1);

            service.revokeInvitation(SLUG, owner.getId(), inv.getId());
            assertThat(invitationRepository.findById(inv.getId()).orElseThrow().getStatus())
                .isEqualTo(InvitationStatus.REVOKED);
        }

        @Test
        @DisplayName("preview d'un token valide renvoie valid=true ; token inconnu → valid=false")
        void should_preview() {
            WorkspaceInvitation inv = createFor("dan@it.dev");

            var ok = service.preview(inv.getToken());
            assertThat(ok.isValid()).isTrue();
            assertThat(ok.getEmail()).isEqualTo("dan@it.dev");

            assertThat(service.preview("inconnu").isValid()).isFalse();
        }

        @Test
        @DisplayName("acceptInvitation fait rejoindre le workspace ; email non concordant → refus")
        void should_accept_and_guard_email() {
            WorkspaceInvitation inv = createFor("erin@it.dev");
            User erin = persistUser("erin");
            User mallory = persistUser("mallory");

            // mauvaise adresse → refus
            assertThatThrownBy(() -> service.acceptInvitation(inv.getToken(), mallory.getId()))
                .isInstanceOf(BusinessException.class);

            // bonne adresse → devient membre
            service.acceptInvitation(inv.getToken(), erin.getId());
            assertThat(workspaceMemberRepository.existsByWorkspaceIdAndUserId(workspace.getId(), erin.getId())).isTrue();
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("invitations reçues (in-app, approbation explicite)")
    class Incoming {

        @Test
        @DisplayName("listMyPendingInvitations renvoie les invitations PENDING adressées à mon email")
        void should_list_my_pending() {
            service.createInvitation(SLUG, owner.getId(), req("frank@it.dev", WorkspaceRole.MEMBER));
            User frank = persistUser("frank");

            var mine = service.listMyPendingInvitations(frank.getId());
            assertThat(mine).hasSize(1);
            assertThat(mine.get(0).getWorkspaceName()).isEqualTo("Inv WS");
            assertThat(mine.get(0).getRole()).isEqualTo(WorkspaceRole.MEMBER);
        }

        @Test
        @DisplayName("acceptMyInvitation fait rejoindre par identifiant ; invitation d'autrui → refus")
        void should_accept_mine_and_guard_email() {
            service.createInvitation(SLUG, owner.getId(), req("grace@it.dev", WorkspaceRole.MEMBER));
            WorkspaceInvitation inv = invitationRepository
                .findByWorkspaceIdAndStatus(workspace.getId(), InvitationStatus.PENDING).get(0);
            User grace = persistUser("grace");
            User heidi = persistUser("heidi");

            // invitation adressée à grace → un autre compte ne peut pas l'accepter
            assertThatThrownBy(() -> service.acceptMyInvitation(heidi.getId(), inv.getId()))
                .isInstanceOf(BusinessException.class);

            service.acceptMyInvitation(grace.getId(), inv.getId());
            assertThat(workspaceMemberRepository.existsByWorkspaceIdAndUserId(workspace.getId(), grace.getId())).isTrue();
        }
    }
}
