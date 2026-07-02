package com.taskforce.tf_api.core.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;

import com.taskforce.tf_api.core.dto.request.CreateWorkspaceRequest;
import com.taskforce.tf_api.core.dto.response.WorkspaceResponse;
import com.taskforce.tf_api.core.dto.response.WorkspaceUsageResponse;
import com.taskforce.tf_api.core.enums.PlanType;
import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.util.AbstractIntegrationTest;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.times;

/**
 * Tests d'intégration (B-T5 tr.3) — {@link WorkspaceService} contre un <b>vrai Postgres</b>.
 *
 * <p>Service chargé dans le slice via {@code @Import} ; repos réels ; {@code AuditService} et
 * {@code BrainSeedingService} en {@code @MockitoBean}. Couvre : création (workspace + membre OWNER
 * + amorçage brain), <b>limites de plan</b> FREE (2 max) vs PRO, usage (limites -1/valeurs), et
 * <b>suppression</b> (cascade DB workspace→members + audit + garde-fou non-owner).</p>
 */
@DisplayName("WorkspaceService (intégration Postgres)")
@Import(WorkspaceService.class)
class WorkspaceServiceIntegrationTest extends AbstractIntegrationTest {

    @Autowired private WorkspaceService workspaceService;
    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private WorkspaceMemberRepository workspaceMemberRepository;

    @org.springframework.test.context.bean.override.mockito.MockitoBean
    private AuditService auditService;
    @org.springframework.test.context.bean.override.mockito.MockitoBean
    private com.taskforce.tf_api.core.service.brain.BrainSeedingService brainSeedingService;

    @PersistenceContext private EntityManager em;

    private User owner;

    @BeforeEach
    void seed() {
        owner = userRepository.save(User.builder()
            .keycloakId("kc-ws-owner").email("ws-owner@it.dev").displayName("Owner")
            .isActive(true).planType(PlanType.FREE).build());
    }

    private CreateWorkspaceRequest req(String name) {
        CreateWorkspaceRequest r = new CreateWorkspaceRequest();
        r.setName(name);
        r.setDescription("desc");
        return r;
    }

    // =========================================================================
    @Nested
    @DisplayName("createNewWorkspace")
    class Create {

        @Test
        @DisplayName("crée le workspace, ajoute l'owner comme membre OWNER et amorce le brain")
        void should_create_with_owner_member_and_seed_brain() {
            WorkspaceResponse res = workspaceService.createNewWorkspace(owner.getId(), req("My Space"));

            assertThat(res).isNotNull();
            assertThat(res.getSlug()).isNotBlank();

            Workspace persisted = workspaceRepository.findBySlug(res.getSlug()).orElseThrow();
            WorkspaceMember member = workspaceMemberRepository
                .findByWorkspaceIdAndUserId(persisted.getId(), owner.getId()).orElseThrow();
            assertThat(member.getRole()).isEqualTo(WorkspaceRole.OWNER);

            verify(brainSeedingService).seedBrain(any(Workspace.class), any(), eq(owner.getEmail()));
        }

        @Test
        @DisplayName("bloque la création au-delà de la limite FREE (2 workspaces) → IllegalStateException")
        void should_enforce_free_workspace_limit() {
            workspaceService.createNewWorkspace(owner.getId(), req("WS 1"));
            workspaceService.createNewWorkspace(owner.getId(), req("WS 2"));

            assertThatThrownBy(() -> workspaceService.createNewWorkspace(owner.getId(), req("WS 3")))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Limite de workspaces");
        }

        @Test
        @DisplayName("un compte PRO dépasse la limite FREE (3e workspace accepté)")
        void should_allow_pro_beyond_free_limit() {
            User pro = userRepository.save(User.builder()
                .keycloakId("kc-pro").email("pro@it.dev").displayName("Pro")
                .isActive(true).planType(PlanType.PRO).build());

            workspaceService.createNewWorkspace(pro.getId(), req("P1"));
            workspaceService.createNewWorkspace(pro.getId(), req("P2"));
            WorkspaceResponse third = workspaceService.createNewWorkspace(pro.getId(), req("P3"));

            assertThat(third).isNotNull();
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("getUsage")
    class Usage {

        @Test
        @DisplayName("renvoie le plan, l'usage et les limites du plan (FREE : 5 membres / 2 workspaces)")
        void should_report_usage_and_limits() {
            WorkspaceResponse ws = workspaceService.createNewWorkspace(owner.getId(), req("Usage WS"));

            WorkspaceUsageResponse usage = workspaceService.getUsage(ws.getSlug(), owner.getId());

            assertThat(usage.getPlan()).isEqualTo(PlanType.FREE.name());
            assertThat(usage.getMembersUsed()).isEqualTo(1);
            assertThat(usage.getMembersLimit()).isEqualTo(5);
            assertThat(usage.getWorkspacesUsed()).isEqualTo(1);
            assertThat(usage.getWorkspacesLimit()).isEqualTo(2);
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("deleteWorkspace")
    class Delete {

        @Test
        @DisplayName("supprime le workspace en cascade (members) et journalise l'audit — OWNER")
        void should_delete_cascade_and_audit() {
            WorkspaceResponse ws = workspaceService.createNewWorkspace(owner.getId(), req("To Delete"));
            Long wsId = workspaceRepository.findBySlug(ws.getSlug()).orElseThrow().getId();
            // Détache les entités créées (owner member) pour reproduire la prod (tx séparée) :
            // sinon le WorkspaceMember reste managé et pointe vers un Workspace supprimé au flush.
            em.flush();
            em.clear();

            workspaceService.deleteWorkspace(wsId, owner.getId());
            em.flush();
            em.clear();

            assertThat(workspaceRepository.findById(wsId)).isEmpty();
            assertThat(workspaceMemberRepository.findByWorkspaceIdAndUserId(wsId, owner.getId())).isEmpty();
            verify(auditService).record(isNull(), eq(owner.getId()),
                eq(AuditService.WORKSPACE_DELETED), eq("Workspace"), eq(String.valueOf(wsId)), any());
        }

        @Test
        @DisplayName("refuse la suppression par un non-owner → IllegalStateException")
        void should_reject_non_owner() {
            WorkspaceResponse ws = workspaceService.createNewWorkspace(owner.getId(), req("Protected"));
            Long wsId = workspaceRepository.findBySlug(ws.getSlug()).orElseThrow().getId();
            User stranger = userRepository.save(User.builder()
                .keycloakId("kc-x").email("x@it.dev").displayName("X").isActive(true).build());

            assertThatThrownBy(() -> workspaceService.deleteWorkspace(wsId, stranger.getId()))
                .isInstanceOf(IllegalStateException.class);

            verify(auditService, times(0)).record(any(), any(), any(), any(), any(), any());
            assertThat(workspaceRepository.findById(wsId)).isPresent(); // toujours là
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("membres & update")
    class Members {

        private Long createWs() {
            WorkspaceResponse ws = workspaceService.createNewWorkspace(owner.getId(), req("Members WS"));
            return workspaceRepository.findBySlug(ws.getSlug()).orElseThrow().getId();
        }

        private User persistUser(String name) {
            return userRepository.save(User.builder()
                .keycloakId("kc-" + name).email(name + "@it.dev").displayName(name).isActive(true).build());
        }

        @Test
        @DisplayName("getMembers renvoie l'owner ; updateWorkspace change le nom")
        void should_get_members_and_update() {
            Long wsId = createWs();

            assertThat(workspaceService.getMembers(wsId, owner.getId())).hasSize(1);

            var upd = new com.taskforce.tf_api.core.dto.request.UpdateWorkspaceRequest();
            upd.setName("Renommé");
            assertThat(workspaceService.updateWorkspace(wsId, owner.getId(), upd).getName()).isEqualTo("Renommé");
        }

        @Test
        @DisplayName("inviteMember ajoute un membre existant ; refuse un doublon")
        void should_invite_member() {
            Long wsId = createWs();
            persistUser("bob");

            var invite = new com.taskforce.tf_api.core.dto.request.InviteMemberRequest();
            invite.setEmail("bob@it.dev");
            invite.setRole(WorkspaceRole.MEMBER);
            workspaceService.inviteMember(wsId, owner.getId(), invite);

            assertThat(workspaceService.getMembers(wsId, owner.getId())).hasSize(2);

            assertThatThrownBy(() -> workspaceService.inviteMember(wsId, owner.getId(), invite))
                .isInstanceOf(IllegalStateException.class);
        }

        @Test
        @DisplayName("updateMemberRole promeut un membre MEMBER → ADMIN (OWNER only)")
        void should_update_member_role() {
            Long wsId = createWs();
            User bob = persistUser("carol");
            var invite = new com.taskforce.tf_api.core.dto.request.InviteMemberRequest();
            invite.setEmail("carol@it.dev");
            invite.setRole(WorkspaceRole.MEMBER);
            workspaceService.inviteMember(wsId, owner.getId(), invite);
            Long memberId = workspaceMemberRepository.findByWorkspaceIdAndUserId(wsId, bob.getId()).orElseThrow().getId();

            var roleReq = new com.taskforce.tf_api.core.dto.request.UpdateMemberRoleRequest();
            roleReq.setRole(WorkspaceRole.ADMIN);
            var res = workspaceService.updateMemberRole(wsId, owner.getId(), memberId, roleReq);

            assertThat(res.getRole()).isEqualTo(WorkspaceRole.ADMIN);
        }

        @Test
        @DisplayName("getWorkspaceBySlug / listWorkspacesByUser retrouvent le workspace du membre")
        void should_get_and_list() {
            WorkspaceResponse ws = workspaceService.createNewWorkspace(owner.getId(), req("Getter"));

            assertThat(workspaceService.getWorkspaceBySlug(ws.getSlug(), owner.getId()).getSlug()).isEqualTo(ws.getSlug());
            assertThat(workspaceService.listWorkspacesByUser(owner.getId())).isNotEmpty();
        }

        @Test
        @DisplayName("removeMember retire un membre non-owner")
        void should_remove_member() {
            Long wsId = createWs();
            User dan = persistUser("dan");
            var invite = new com.taskforce.tf_api.core.dto.request.InviteMemberRequest();
            invite.setEmail("dan@it.dev");
            invite.setRole(WorkspaceRole.MEMBER);
            workspaceService.inviteMember(wsId, owner.getId(), invite);
            Long memberId = workspaceMemberRepository.findByWorkspaceIdAndUserId(wsId, dan.getId()).orElseThrow().getId();

            workspaceService.removeMember(wsId, owner.getId(), memberId);

            assertThat(workspaceMemberRepository.findByWorkspaceIdAndUserId(wsId, dan.getId())).isEmpty();
        }

        @Test
        @DisplayName("getWorkspaceByUserId renvoie le workspace de l'utilisateur")
        void should_get_by_user_id() {
            createWs();
            assertThat(workspaceService.getWorkspaceByUserId(owner.getId())).isNotNull();
        }

        @Test
        @DisplayName("inviteMember en tant qu'OWNER est refusé")
        void should_reject_invite_as_owner() {
            Long wsId = createWs();
            persistUser("eve");
            var invite = new com.taskforce.tf_api.core.dto.request.InviteMemberRequest();
            invite.setEmail("eve@it.dev");
            invite.setRole(WorkspaceRole.OWNER);

            assertThatThrownBy(() -> workspaceService.inviteMember(wsId, owner.getId(), invite))
                .isInstanceOf(IllegalStateException.class);
        }

        @Test
        @DisplayName("updateMemberRole vers OWNER est refusé")
        void should_reject_promote_to_owner() {
            Long wsId = createWs();
            User frank = persistUser("frank");
            var invite = new com.taskforce.tf_api.core.dto.request.InviteMemberRequest();
            invite.setEmail("frank@it.dev");
            invite.setRole(WorkspaceRole.MEMBER);
            workspaceService.inviteMember(wsId, owner.getId(), invite);
            Long memberId = workspaceMemberRepository.findByWorkspaceIdAndUserId(wsId, frank.getId()).orElseThrow().getId();

            var roleReq = new com.taskforce.tf_api.core.dto.request.UpdateMemberRoleRequest();
            roleReq.setRole(WorkspaceRole.OWNER);

            assertThatThrownBy(() -> workspaceService.updateMemberRole(wsId, owner.getId(), memberId, roleReq))
                .isInstanceOf(IllegalStateException.class);
        }

        @Test
        @DisplayName("updateWorkspace par un simple MEMBER est refusé")
        void should_reject_update_by_member() {
            Long wsId = createWs();
            User gwen = persistUser("gwen");
            var invite = new com.taskforce.tf_api.core.dto.request.InviteMemberRequest();
            invite.setEmail("gwen@it.dev");
            invite.setRole(WorkspaceRole.MEMBER);
            workspaceService.inviteMember(wsId, owner.getId(), invite);

            var upd = new com.taskforce.tf_api.core.dto.request.UpdateWorkspaceRequest();
            upd.setName("Interdit");

            assertThatThrownBy(() -> workspaceService.updateWorkspace(wsId, gwen.getId(), upd))
                .isInstanceOf(IllegalStateException.class);
        }

        @Test
        @DisplayName("removeMember refuse de retirer le propriétaire (OWNER)")
        void should_reject_remove_owner() {
            Long wsId = createWs();
            Long ownerMemberId = workspaceMemberRepository
                .findByWorkspaceIdAndUserId(wsId, owner.getId()).orElseThrow().getId();

            assertThatThrownBy(() -> workspaceService.removeMember(wsId, owner.getId(), ownerMemberId))
                .isInstanceOf(IllegalStateException.class);
        }

        @Test
        @DisplayName("removeMember par un simple MEMBER est refusé (droits insuffisants)")
        void should_reject_remove_by_member() {
            Long wsId = createWs();
            User hugo = persistUser("hugo");
            User ivan = persistUser("ivan");
            var inviteHugo = new com.taskforce.tf_api.core.dto.request.InviteMemberRequest();
            inviteHugo.setEmail("hugo@it.dev");
            inviteHugo.setRole(WorkspaceRole.MEMBER);
            workspaceService.inviteMember(wsId, owner.getId(), inviteHugo);
            var inviteIvan = new com.taskforce.tf_api.core.dto.request.InviteMemberRequest();
            inviteIvan.setEmail("ivan@it.dev");
            inviteIvan.setRole(WorkspaceRole.MEMBER);
            workspaceService.inviteMember(wsId, owner.getId(), inviteIvan);
            Long ivanMemberId = workspaceMemberRepository.findByWorkspaceIdAndUserId(wsId, ivan.getId()).orElseThrow().getId();

            assertThatThrownBy(() -> workspaceService.removeMember(wsId, hugo.getId(), ivanMemberId))
                .isInstanceOf(IllegalStateException.class);
        }

        @Test
        @DisplayName("getWorkspaceBySlug refuse un non-membre")
        void should_reject_get_by_slug_for_non_member() {
            WorkspaceResponse ws = workspaceService.createNewWorkspace(owner.getId(), req("Privé"));
            User stranger = persistUser("stranger");

            assertThatThrownBy(() -> workspaceService.getWorkspaceBySlug(ws.getSlug(), stranger.getId()))
                .isInstanceOf(IllegalStateException.class);
        }

        @Test
        @DisplayName("updateMemberRole refuse un memberId d'un autre workspace")
        void should_reject_role_update_for_foreign_member() {
            Long wsA = createWs();
            WorkspaceResponse wsBResp = workspaceService.createNewWorkspace(owner.getId(), req("Autre WS"));
            Long wsB = workspaceRepository.findBySlug(wsBResp.getSlug()).orElseThrow().getId();
            Long ownerMemberInB = workspaceMemberRepository
                .findByWorkspaceIdAndUserId(wsB, owner.getId()).orElseThrow().getId();

            var roleReq = new com.taskforce.tf_api.core.dto.request.UpdateMemberRoleRequest();
            roleReq.setRole(WorkspaceRole.ADMIN);

            assertThatThrownBy(() -> workspaceService.updateMemberRole(wsA, owner.getId(), ownerMemberInB, roleReq))
                .isInstanceOf(IllegalArgumentException.class);
        }

        @Test
        @DisplayName("listAuditLogs renvoie les entrées pour un OWNER ; refuse un simple MEMBER")
        void should_list_audit_logs_owner_only() {
            WorkspaceResponse ws = workspaceService.createNewWorkspace(owner.getId(), req("Audit WS"));
            Long wsId = workspaceRepository.findBySlug(ws.getSlug()).orElseThrow().getId();
            User jane = persistUser("jane");
            var invite = new com.taskforce.tf_api.core.dto.request.InviteMemberRequest();
            invite.setEmail("jane@it.dev");
            invite.setRole(WorkspaceRole.MEMBER);
            workspaceService.inviteMember(wsId, owner.getId(), invite);

            org.mockito.Mockito.when(auditService.listForWorkspace(eq(wsId), org.mockito.ArgumentMatchers.anyInt()))
                .thenReturn(java.util.List.of());

            assertThat(workspaceService.listAuditLogs(ws.getSlug(), owner.getId())).isEmpty();

            assertThatThrownBy(() -> workspaceService.listAuditLogs(ws.getSlug(), jane.getId()))
                .isInstanceOf(com.taskforce.tf_api.shared.exception.ForbiddenException.class);
        }
    }
}
