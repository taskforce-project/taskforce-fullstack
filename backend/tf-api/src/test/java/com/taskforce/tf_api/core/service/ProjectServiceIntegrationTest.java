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
}
