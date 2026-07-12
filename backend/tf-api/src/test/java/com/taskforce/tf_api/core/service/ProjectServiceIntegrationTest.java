package com.taskforce.tf_api.core.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;

import com.taskforce.tf_api.core.dto.request.CreateLabelRequest;
import com.taskforce.tf_api.core.dto.request.CreateProjectRequest;
import com.taskforce.tf_api.core.dto.request.UpdateProjectRequest;
import com.taskforce.tf_api.core.dto.response.ProjectLabelResponse;
import com.taskforce.tf_api.core.dto.response.ProjectResponse;
import com.taskforce.tf_api.core.enums.ProjectRole;
import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.ProjectLabelRepository;
import com.taskforce.tf_api.core.repository.ProjectMemberRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;
import com.taskforce.tf_api.util.AbstractIntegrationTest;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Tests d'intégration (couverture C25) — {@link ProjectService} contre un vrai Postgres.
 * Service chargé via {@code @Import} ; {@code IssueService} mocké (seed statuts/types no-op) ; repos réels.
 * Couvre create (identifier uppercased, créateur LEAD, labels par défaut), identifiant dupliqué,
 * projet introuvable, update, delete (cascade), CRUD label.
 */
@DisplayName("ProjectService (intégration Postgres)")
@Import(ProjectService.class)
class ProjectServiceIntegrationTest extends AbstractIntegrationTest {

    @Autowired private ProjectService projectService;
    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private WorkspaceMemberRepository workspaceMemberRepository;
    @Autowired private ProjectRepository projectRepository;
    @Autowired private ProjectMemberRepository projectMemberRepository;
    @Autowired private ProjectLabelRepository projectLabelRepository;
    @Autowired private com.taskforce.tf_api.core.repository.ProjectFavoriteRepository projectFavoriteRepository;
    @Autowired private com.taskforce.tf_api.core.repository.TeamRepository teamRepository;

    @org.springframework.test.context.bean.override.mockito.MockitoBean
    private IssueService issueService;

    @PersistenceContext private EntityManager em;

    private static final String SLUG = "ws-proj-it";
    private User owner;

    @BeforeEach
    void seed() {
        owner = userRepository.save(User.builder()
            .keycloakId("kc-proj").email("proj@it.dev").displayName("Owner").isActive(true).build());
        Workspace ws = workspaceRepository.save(Workspace.builder().name("Proj WS").slug(SLUG).owner(owner).build());
        workspaceMemberRepository.save(WorkspaceMember.builder().workspace(ws).user(owner).role(WorkspaceRole.OWNER).build());
    }

    private CreateProjectRequest req(String name, String identifier) {
        CreateProjectRequest r = new CreateProjectRequest();
        r.setName(name);
        r.setIdentifier(identifier);
        r.setDescription("desc");
        return r;
    }

    // =========================================================================
    @Nested
    @DisplayName("createProject")
    class Create {

        @Test
        @DisplayName("crée le projet (identifier en MAJUSCULES), le créateur devient LEAD, labels par défaut seedés")
        void should_create_with_lead_and_default_labels() {
            ProjectResponse res = projectService.createProject(SLUG, owner.getId(), req("Web App", "web"));

            assertThat(res.getIdentifier()).isEqualTo("WEB"); // uppercased

            Project persisted = projectRepository.findById(res.getId()).orElseThrow();
            assertThat(persisted.getName()).isEqualTo("Web App");

            assertThat(projectMemberRepository.findByProjectIdAndUserId(persisted.getId(), owner.getId()))
                .get().extracting(m -> m.getRole()).isEqualTo(ProjectRole.LEAD);
            assertThat(projectLabelRepository.findByProjectIdOrderByNameAsc(persisted.getId())).hasSize(5); // Bug/Feature/…

            org.mockito.Mockito.verify(issueService).seedDefaultStatusesAndTypes(org.mockito.ArgumentMatchers.any());
        }

        @Test
        @DisplayName("refuse un identifiant déjà pris dans le workspace (insensible à la casse)")
        void should_reject_duplicate_identifier() {
            projectService.createProject(SLUG, owner.getId(), req("Web", "web"));

            assertThatThrownBy(() -> projectService.createProject(SLUG, owner.getId(), req("Web 2", "WEB")))
                .isInstanceOf(BusinessException.class);
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("get / update / delete")
    class Lifecycle {

        @Test
        @DisplayName("getProject lève ResourceNotFoundException pour un id inconnu")
        void should_throw_when_unknown() {
            assertThatThrownBy(() -> projectService.getProject(SLUG, 999_999L, owner.getId()))
                .isInstanceOf(ResourceNotFoundException.class);
        }

        @Test
        @DisplayName("updateProject applique nom + couleur (créateur LEAD autorisé)")
        void should_update_name_and_color() {
            ProjectResponse created = projectService.createProject(SLUG, owner.getId(), req("Old", "OLD"));

            UpdateProjectRequest upd = new UpdateProjectRequest();
            upd.setName("New Name");
            upd.setColor("bg-emerald-500");
            projectService.updateProject(SLUG, created.getId(), owner.getId(), upd);

            Project reloaded = projectRepository.findById(created.getId()).orElseThrow();
            assertThat(reloaded.getName()).isEqualTo("New Name");
            assertThat(reloaded.getColor()).isEqualTo("bg-emerald-500");
        }

        @Test
        @DisplayName("deleteProject supprime le projet en cascade")
        void should_delete_project() {
            ProjectResponse created = projectService.createProject(SLUG, owner.getId(), req("Doomed", "DOO"));
            Long id = created.getId();
            em.flush();
            em.clear(); // détache (membre LEAD + labels) → évite le TransientPropertyValueException au flush

            projectService.deleteProject(SLUG, id, owner.getId());
            em.flush();
            em.clear();

            assertThat(projectRepository.findById(id)).isEmpty();
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("labels")
    class Labels {

        @Test
        @DisplayName("createLabel ajoute un label au projet (au-delà des 5 par défaut)")
        void should_create_label() {
            ProjectResponse project = projectService.createProject(SLUG, owner.getId(), req("Labeled", "LAB"));

            CreateLabelRequest req = new CreateLabelRequest();
            req.setName("Blocked");
            req.setColor("#000000");
            ProjectLabelResponse label = projectService.createLabel(SLUG, project.getId(), owner.getId(), req);

            assertThat(label.getName()).isEqualTo("Blocked");
            assertThat(projectLabelRepository.findByProjectIdOrderByNameAsc(project.getId())).hasSize(6); // 5 défaut + 1
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("archive / favoris / membres")
    class MembersAndFlags {

        @Test
        @DisplayName("archiveProject passe le statut à ARCHIVED")
        void should_archive() {
            ProjectResponse created = projectService.createProject(SLUG, owner.getId(), req("Arch", "ARC"));

            ProjectResponse res = projectService.archiveProject(SLUG, created.getId(), owner.getId());

            assertThat(res.getStatus()).isEqualTo(com.taskforce.tf_api.core.enums.ProjectStatus.ARCHIVED);
            assertThat(projectRepository.findById(created.getId()).orElseThrow().getStatus())
                .isEqualTo(com.taskforce.tf_api.core.enums.ProjectStatus.ARCHIVED);
        }

        @Test
        @DisplayName("favorite puis unfavorite (idempotent) togglent le favori")
        void should_favorite_then_unfavorite() {
            ProjectResponse created = projectService.createProject(SLUG, owner.getId(), req("Fav", "FAV"));

            ProjectResponse fav = projectService.favoriteProject(SLUG, created.getId(), owner.getId());
            assertThat(fav.isFavorite()).isTrue();
            assertThat(projectFavoriteRepository.existsByUserIdAndProjectId(owner.getId(), created.getId())).isTrue();

            ProjectResponse unfav = projectService.unfavoriteProject(SLUG, created.getId(), owner.getId());
            assertThat(unfav.isFavorite()).isFalse();
            assertThat(projectFavoriteRepository.existsByUserIdAndProjectId(owner.getId(), created.getId())).isFalse();
        }

        @Test
        @DisplayName("listMembers = créateur (LEAD) ; addMember ajoute un membre du workspace")
        void should_list_and_add_member() {
            ProjectResponse created = projectService.createProject(SLUG, owner.getId(), req("Team", "TEA"));
            assertThat(projectService.listMembers(SLUG, created.getId(), owner.getId())).hasSize(1);

            // 2e user, déjà membre du workspace
            User bob = userRepository.save(User.builder()
                .keycloakId("kc-bob").email("bob@it.dev").displayName("Bob").isActive(true).build());
            Workspace ws = workspaceRepository.findBySlug(SLUG).orElseThrow();
            workspaceMemberRepository.save(WorkspaceMember.builder()
                .workspace(ws).user(bob).role(WorkspaceRole.MEMBER).build());

            var add = new com.taskforce.tf_api.core.dto.request.AddProjectMemberRequest();
            add.setEmail("bob@it.dev");
            add.setRole(ProjectRole.MEMBER);
            projectService.addMember(SLUG, created.getId(), owner.getId(), add);

            assertThat(projectService.listMembers(SLUG, created.getId(), owner.getId())).hasSize(2);
        }

        @Test
        @DisplayName("addMember refuse un utilisateur non-membre du workspace")
        void should_reject_member_not_in_workspace() {
            ProjectResponse created = projectService.createProject(SLUG, owner.getId(), req("Guard", "GUA"));
            userRepository.save(User.builder()
                .keycloakId("kc-out").email("out@it.dev").displayName("Out").isActive(true).build());

            var add = new com.taskforce.tf_api.core.dto.request.AddProjectMemberRequest();
            add.setEmail("out@it.dev");
            add.setRole(ProjectRole.MEMBER);

            assertThatThrownBy(() -> projectService.addMember(SLUG, created.getId(), owner.getId(), add))
                .isInstanceOf(BusinessException.class);
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("teams / removeMember / unfavorite")
    class TeamsAndMore {

        private com.taskforce.tf_api.core.model.Workspace ws() {
            return workspaceRepository.findBySlug(SLUG).orElseThrow();
        }

        @Test
        @DisplayName("attachTeam associe une équipe, listProjectTeams la voit, detachTeam la retire ; doublon refusé")
        void should_attach_list_detach_team() {
            ProjectResponse project = projectService.createProject(SLUG, owner.getId(), req("WithTeam", "WTE"));
            com.taskforce.tf_api.core.model.Team team = teamRepository.save(
                com.taskforce.tf_api.core.model.Team.builder().workspace(ws()).name("Backend").createdBy(owner).build());

            projectService.attachTeam(SLUG, project.getId(), team.getId(), owner.getId());
            assertThat(projectService.listProjectTeams(SLUG, project.getId(), owner.getId())).hasSize(1);

            assertThatThrownBy(() -> projectService.attachTeam(SLUG, project.getId(), team.getId(), owner.getId()))
                .isInstanceOf(BusinessException.class);

            projectService.detachTeam(SLUG, project.getId(), team.getId(), owner.getId());
            assertThat(projectService.listProjectTeams(SLUG, project.getId(), owner.getId())).isEmpty();
        }

        @Test
        @DisplayName("removeMember retire un membre du projet")
        void should_remove_member() {
            ProjectResponse project = projectService.createProject(SLUG, owner.getId(), req("RM", "RMV"));
            User bob = userRepository.save(User.builder()
                .keycloakId("kc-rmb").email("rmb@it.dev").displayName("Bob").isActive(true).build());
            workspaceMemberRepository.save(WorkspaceMember.builder().workspace(ws()).user(bob).role(WorkspaceRole.MEMBER).build());
            var add = new com.taskforce.tf_api.core.dto.request.AddProjectMemberRequest();
            add.setEmail("rmb@it.dev");
            add.setRole(ProjectRole.MEMBER);
            projectService.addMember(SLUG, project.getId(), owner.getId(), add);
            Long pmId = projectMemberRepository.findByProjectIdAndUserId(project.getId(), bob.getId()).orElseThrow().getId();

            projectService.removeMember(SLUG, project.getId(), owner.getId(), pmId);

            assertThat(projectService.listMembers(SLUG, project.getId(), owner.getId())).hasSize(1);
        }

        @Test
        @DisplayName("unfavoriteProject est idempotent quand le projet n'est pas en favori")
        void should_unfavorite_idempotent() {
            ProjectResponse project = projectService.createProject(SLUG, owner.getId(), req("Unfav", "UNF"));

            assertThat(projectService.unfavoriteProject(SLUG, project.getId(), owner.getId()).isFavorite()).isFalse();
        }

        @Test
        @DisplayName("getProjectActivity renvoie des points d'activité (parcourt la fenêtre de jours)")
        void should_get_project_activity() {
            ProjectResponse project = projectService.createProject(SLUG, owner.getId(), req("Act", "ACT"));

            assertThat(projectService.getProjectActivity(SLUG, project.getId(), owner.getId(), 14)).isNotEmpty();
        }

        @Test
        @DisplayName("updateProject applique tous les champs (desc/status/public/icon/couleur/growth)")
        void should_update_all_fields() {
            ProjectResponse created = projectService.createProject(SLUG, owner.getId(), req("Full", "FUL"));

            var upd = new com.taskforce.tf_api.core.dto.request.UpdateProjectRequest();
            upd.setName("Full Updated");
            upd.setDescription("nouvelle desc");
            upd.setStatus(com.taskforce.tf_api.core.enums.ProjectStatus.PAUSED);
            upd.setIsPublic(true);
            upd.setIconUrl("icon.png");
            upd.setColor("bg-rose-500");
            upd.setGrowthMode(true);

            projectService.updateProject(SLUG, created.getId(), owner.getId(), upd);

            var reloaded = projectRepository.findById(created.getId()).orElseThrow();
            assertThat(reloaded.getName()).isEqualTo("Full Updated");
            assertThat(reloaded.getStatus()).isEqualTo(com.taskforce.tf_api.core.enums.ProjectStatus.PAUSED);
            assertThat(reloaded.isPublic()).isTrue();
            assertThat(reloaded.isGrowthMode()).isTrue();
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("list / labels avancés / accès")
    class ListsAndLabelsAndAccess {

        @Test
        @DisplayName("listProjects renvoie les projets du workspace (ordre desc de création)")
        void should_list_projects() {
            projectService.createProject(SLUG, owner.getId(), req("Alpha", "ALP"));
            projectService.createProject(SLUG, owner.getId(), req("Beta", "BET"));

            assertThat(projectService.listProjects(SLUG, owner.getId())).hasSize(2);
        }

        @Test
        @DisplayName("listLabels renvoie les 5 labels par défaut du projet")
        void should_list_labels() {
            ProjectResponse project = projectService.createProject(SLUG, owner.getId(), req("Lbl", "LBL"));

            assertThat(projectService.listLabels(SLUG, project.getId(), owner.getId())).hasSize(5);
        }

        @Test
        @DisplayName("updateLabel modifie le nom et la couleur d'un label existant")
        void should_update_label() {
            ProjectResponse project = projectService.createProject(SLUG, owner.getId(), req("UL", "ULB"));
            CreateLabelRequest create = new CreateLabelRequest();
            create.setName("Temp");
            create.setColor("#111111");
            ProjectLabelResponse created = projectService.createLabel(SLUG, project.getId(), owner.getId(), create);

            var upd = new com.taskforce.tf_api.core.dto.request.UpdateLabelRequest();
            upd.setName("Renommé");
            upd.setColor("#222222");
            ProjectLabelResponse updated = projectService.updateLabel(
                SLUG, project.getId(), created.getId(), owner.getId(), upd);

            assertThat(updated.getName()).isEqualTo("Renommé");
            assertThat(updated.getColor()).isEqualTo("#222222");
        }

        @Test
        @DisplayName("deleteLabel retire un label du projet")
        void should_delete_label() {
            ProjectResponse project = projectService.createProject(SLUG, owner.getId(), req("DL", "DLB"));
            CreateLabelRequest create = new CreateLabelRequest();
            create.setName("Jetable");
            create.setColor("#333333");
            ProjectLabelResponse created = projectService.createLabel(SLUG, project.getId(), owner.getId(), create);
            assertThat(projectLabelRepository.findByProjectIdOrderByNameAsc(project.getId())).hasSize(6);

            projectService.deleteLabel(SLUG, project.getId(), created.getId(), owner.getId());

            assertThat(projectLabelRepository.findByProjectIdOrderByNameAsc(project.getId())).hasSize(5);
        }

        @Test
        @DisplayName("createLabel refuse un nom déjà pris dans le projet")
        void should_reject_duplicate_label() {
            ProjectResponse project = projectService.createProject(SLUG, owner.getId(), req("DupL", "DUL"));

            CreateLabelRequest req = new CreateLabelRequest();
            req.setName("Bug"); // déjà seedé par défaut
            req.setColor("#444444");

            assertThatThrownBy(() -> projectService.createLabel(SLUG, project.getId(), owner.getId(), req))
                .isInstanceOf(BusinessException.class);
        }

        @Test
        @DisplayName("getProject refuse un non-membre du workspace")
        void should_reject_get_for_non_member() {
            ProjectResponse project = projectService.createProject(SLUG, owner.getId(), req("Sec", "SEC"));
            User outsider = userRepository.save(User.builder()
                .keycloakId("kc-outsider").email("outsider@it.dev").displayName("Out").isActive(true).build());

            assertThatThrownBy(() -> projectService.getProject(SLUG, project.getId(), outsider.getId()))
                .isInstanceOf(BusinessException.class);
        }

        @Test
        @DisplayName("addMember refuse un utilisateur déjà membre du projet")
        void should_reject_duplicate_project_member() {
            ProjectResponse project = projectService.createProject(SLUG, owner.getId(), req("DupM", "DUM"));
            User kai = userRepository.save(User.builder()
                .keycloakId("kc-kai").email("kai@it.dev").displayName("Kai").isActive(true).build());
            Workspace ws = workspaceRepository.findBySlug(SLUG).orElseThrow();
            workspaceMemberRepository.save(WorkspaceMember.builder()
                .workspace(ws).user(kai).role(WorkspaceRole.MEMBER).build());

            var add = new com.taskforce.tf_api.core.dto.request.AddProjectMemberRequest();
            add.setEmail("kai@it.dev");
            add.setRole(ProjectRole.MEMBER);
            projectService.addMember(SLUG, project.getId(), owner.getId(), add);

            assertThatThrownBy(() -> projectService.addMember(SLUG, project.getId(), owner.getId(), add))
                .isInstanceOf(BusinessException.class);
        }

        @Test
        @DisplayName("attachTeam refuse une équipe d'un autre workspace")
        void should_reject_attach_foreign_team() {
            ProjectResponse project = projectService.createProject(SLUG, owner.getId(), req("FT", "FTE"));

            // Équipe rattachée à un AUTRE workspace
            Workspace other = workspaceRepository.save(
                Workspace.builder().name("Other WS").slug("other-ws-it").owner(owner).build());
            com.taskforce.tf_api.core.model.Team foreign = teamRepository.save(
                com.taskforce.tf_api.core.model.Team.builder().workspace(other).name("Foreign").createdBy(owner).build());

            assertThatThrownBy(() -> projectService.attachTeam(SLUG, project.getId(), foreign.getId(), owner.getId()))
                .isInstanceOf(BusinessException.class);
        }

        @Test
        @DisplayName("detachTeam lève ResourceNotFoundException si l'équipe n'est pas associée")
        void should_reject_detach_unlinked_team() {
            ProjectResponse project = projectService.createProject(SLUG, owner.getId(), req("DT", "DTE"));
            com.taskforce.tf_api.core.model.Team team = teamRepository.save(
                com.taskforce.tf_api.core.model.Team.builder()
                    .workspace(workspaceRepository.findBySlug(SLUG).orElseThrow())
                    .name("Detached").createdBy(owner).build());

            assertThatThrownBy(() -> projectService.detachTeam(SLUG, project.getId(), team.getId(), owner.getId()))
                .isInstanceOf(ResourceNotFoundException.class);
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("plafond collaborateurs projet privé (façon GitHub)")
    class PrivateProjectSeatLimit {

        private Workspace ws() { return workspaceRepository.findBySlug(SLUG).orElseThrow(); }

        /** Crée un utilisateur, l'ajoute au workspace, renvoie son email. */
        private String wsMember(String tag) {
            User u = userRepository.save(User.builder()
                .keycloakId("kc-" + tag).email(tag + "@it.dev").displayName(tag).isActive(true).build());
            workspaceMemberRepository.save(WorkspaceMember.builder()
                .workspace(ws()).user(u).role(WorkspaceRole.MEMBER).build());
            return u.getEmail();
        }

        private void addMember(Long projectId, String email) {
            var add = new com.taskforce.tf_api.core.dto.request.AddProjectMemberRequest();
            add.setEmail(email);
            add.setRole(ProjectRole.MEMBER);
            projectService.addMember(SLUG, projectId, owner.getId(), add);
        }

        @Test
        @DisplayName("Free + projet privé : plafonné à 5 collaborateurs (créateur inclus), le 6e est refusé (409)")
        void free_private_caps_at_five() {
            // owner = FREE par défaut ; projet privé par défaut (isPublic=false)
            ProjectResponse p = projectService.createProject(SLUG, owner.getId(), req("Priv", "PRV"));
            // créateur = 1 membre (LEAD) → on ajoute 4 collaborateurs pour atteindre 5
            addMember(p.getId(), wsMember("p1"));
            addMember(p.getId(), wsMember("p2"));
            addMember(p.getId(), wsMember("p3"));
            addMember(p.getId(), wsMember("p4"));
            assertThat(projectService.listMembers(SLUG, p.getId(), owner.getId())).hasSize(5);

            String sixth = wsMember("p5");
            assertThatThrownBy(() -> addMember(p.getId(), sixth))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("projets privés");
        }

        @Test
        @DisplayName("Projet PUBLIC : aucun plafond, même en Free")
        void public_project_is_unlimited() {
            ProjectResponse p = projectService.createProject(SLUG, owner.getId(), req("Pub", "PUB"));
            var upd = new com.taskforce.tf_api.core.dto.request.UpdateProjectRequest();
            upd.setIsPublic(true);
            projectService.updateProject(SLUG, p.getId(), owner.getId(), upd);

            for (int i = 1; i <= 5; i++) addMember(p.getId(), wsMember("pub" + i)); // 6 au total > 5
            assertThat(projectService.listMembers(SLUG, p.getId(), owner.getId())).hasSize(6);
        }

        @Test
        @DisplayName("Forfait payant : projet privé illimité")
        void paid_private_is_unlimited() {
            owner.setPlanType(com.taskforce.tf_api.core.enums.PlanType.BUSINESS);
            userRepository.save(owner);

            ProjectResponse p = projectService.createProject(SLUG, owner.getId(), req("Biz", "BIZ"));
            for (int i = 1; i <= 5; i++) addMember(p.getId(), wsMember("biz" + i)); // 6 au total > 5
            assertThat(projectService.listMembers(SLUG, p.getId(), owner.getId())).hasSize(6);
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("visibilité projet privé (façon GitHub)")
    class PrivateProjectVisibility {

        private Workspace ws() { return workspaceRepository.findBySlug(SLUG).orElseThrow(); }

        private User wsUser(String tag, WorkspaceRole role) {
            User u = userRepository.save(User.builder()
                .keycloakId("kc-" + tag).email(tag + "@it.dev").displayName(tag).isActive(true).build());
            workspaceMemberRepository.save(WorkspaceMember.builder().workspace(ws()).user(u).role(role).build());
            return u;
        }

        @Test
        @DisplayName("projet privé : invisible pour un membre du workspace non invité (getProject → 404, listProjects l'exclut)")
        void private_hidden_from_non_member() {
            ProjectResponse priv = projectService.createProject(SLUG, owner.getId(), req("Secret", "SEC"));
            User bob = wsUser("visB", WorkspaceRole.MEMBER); // membre workspace, PAS du projet

            assertThatThrownBy(() -> projectService.getProject(SLUG, priv.getId(), bob.getId()))
                .isInstanceOf(ResourceNotFoundException.class);
            assertThat(projectService.listProjects(SLUG, bob.getId()))
                .extracting(ProjectResponse::getId).doesNotContain(priv.getId());
        }

        @Test
        @DisplayName("projet privé : visible pour un collaborateur invité ET pour un ADMIN workspace non invité")
        void private_visible_to_member_and_admin() {
            ProjectResponse priv = projectService.createProject(SLUG, owner.getId(), req("Secret2", "SE2"));

            User kai = wsUser("visK", WorkspaceRole.MEMBER);
            var add = new com.taskforce.tf_api.core.dto.request.AddProjectMemberRequest();
            add.setEmail("visK@it.dev"); add.setRole(ProjectRole.MEMBER);
            projectService.addMember(SLUG, priv.getId(), owner.getId(), add);
            assertThat(projectService.getProject(SLUG, priv.getId(), kai.getId()).getId()).isEqualTo(priv.getId());

            User adm = wsUser("visA", WorkspaceRole.ADMIN); // ADMIN non invité → voit quand même
            assertThat(projectService.getProject(SLUG, priv.getId(), adm.getId()).getId()).isEqualTo(priv.getId());
            assertThat(projectService.listProjects(SLUG, adm.getId()))
                .extracting(ProjectResponse::getId).contains(priv.getId());
        }

        @Test
        @DisplayName("projet public : visible par tout membre du workspace")
        void public_visible_to_all() {
            ProjectResponse pub = projectService.createProject(SLUG, owner.getId(), req("Open", "OPN"));
            var upd = new com.taskforce.tf_api.core.dto.request.UpdateProjectRequest();
            upd.setIsPublic(true);
            projectService.updateProject(SLUG, pub.getId(), owner.getId(), upd);

            User bob = wsUser("visP", WorkspaceRole.MEMBER);
            assertThat(projectService.getProject(SLUG, pub.getId(), bob.getId()).getId()).isEqualTo(pub.getId());
            assertThat(projectService.listProjects(SLUG, bob.getId()))
                .extracting(ProjectResponse::getId).contains(pub.getId());
        }
    }
}
