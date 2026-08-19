package com.taskforce.tf_api.core.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.test.util.ReflectionTestUtils;

import com.taskforce.tf_api.core.dto.request.CreatePageRequest;
import com.taskforce.tf_api.core.dto.request.UpdatePageRequest;
import com.taskforce.tf_api.core.dto.response.PageResponse;
import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.PageRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;
import com.taskforce.tf_api.util.AbstractIntegrationTest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Tests d'intégration — {@link PageService} contre un vrai Postgres (repos réels).
 *
 * <p>Couvre create/get/list/update/delete + les cas négatifs, et surtout la <b>non-régression de
 * {@code PC-021}</b> : l'IDOR <b>inter-workspace</b>. Attention à l'histoire de ce fichier — il
 * annonçait déjà couvrir « le scope projet (IDOR) », mais ne testait qu'une page d'un <b>autre projet
 * du même workspace</b>, cas que le {@code findByIdAndProjectId} couvrait déjà. La vraie faille était
 * ailleurs : rien ne liait le {@code projectId} au <b>slug du workspace</b> de l'URL. Ce test donnait
 * donc une fausse confiance sur exactement ce qui était troué — d'où {@link CrossWorkspaceIdor}.</p>
 */
@DisplayName("PageService (intégration Postgres)")
@Import({PageService.class, ProjectVisibilityGuard.class})
class PageServiceIntegrationTest extends AbstractIntegrationTest {

    @Autowired private PageService pageService;
    @Autowired private PageRepository pageRepository;
    @Autowired private ProjectRepository projectRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private WorkspaceMemberRepository workspaceMemberRepository;
    @Autowired private UserRepository userRepository;

    private static final String SLUG = "ws-page-it";

    private User owner;
    private Project project;

    @BeforeEach
    void seed() {
        owner = userRepository.save(User.builder()
            .keycloakId("kc-page").email("page@it.dev").displayName("Jane Doe").isActive(true).build());
        Workspace ws = newWorkspace("Page WS", SLUG, owner);
        project = projectRepository.save(Project.builder()
            .workspace(ws).name("Wiki").identifier("WIK").createdBy(owner).build());
    }

    /**
     * Un workspace vient toujours avec la ligne {@link WorkspaceMember} de son owner : c'est ce que fait
     * {@code WorkspaceService} en production, et c'est ce qui rend l'owner OWNER aux yeux de
     * {@link ProjectVisibilityGuard} (les projets sont privés par défaut).
     */
    private Workspace newWorkspace(String name, String slug, User wsOwner) {
        Workspace ws = workspaceRepository.save(Workspace.builder()
            .name(name).slug(slug).owner(wsOwner).build());
        workspaceMemberRepository.save(WorkspaceMember.builder()
            .workspace(ws).user(wsOwner).role(WorkspaceRole.OWNER).build());
        return ws;
    }

    private Long projectId() {
        return project.getId();
    }

    private CreatePageRequest createReq(String title, String emoji, String content) {
        CreatePageRequest r = new CreatePageRequest();
        ReflectionTestUtils.setField(r, "title", title);
        ReflectionTestUtils.setField(r, "emoji", emoji);
        ReflectionTestUtils.setField(r, "content", content);
        return r;
    }

    private UpdatePageRequest updateReq(String title, String emoji, String content) {
        UpdatePageRequest r = new UpdatePageRequest();
        ReflectionTestUtils.setField(r, "title", title);
        ReflectionTestUtils.setField(r, "emoji", emoji);
        ReflectionTestUtils.setField(r, "content", content);
        return r;
    }

    // =========================================================================
    @Nested
    @DisplayName("Création et lecture")
    class CreateAndRead {

        @Test
        @DisplayName("crée une page avec ses métadonnées")
        void should_create_page() {
            PageResponse res = pageService.createPage(SLUG, projectId(), owner.getId(),
                createReq("Guide de démarrage", "🚀", "<p>Bienvenue</p>"));

            assertThat(res.getId()).isNotNull();
            assertThat(res.getTitle()).isEqualTo("Guide de démarrage");
            assertThat(res.getEmoji()).isEqualTo("🚀");
            assertThat(res.getContent()).isEqualTo("<p>Bienvenue</p>");
            assertThat(res.getCreatedByName()).isEqualTo("Jane Doe");
            assertThat(res.getCreatedByInitials()).isEqualTo("JD");

            assertThat(pageRepository.findById(res.getId())).isPresent();
        }

        @Test
        @DisplayName("applique l'emoji par défaut si non fourni")
        void should_apply_default_emoji() {
            PageResponse res = pageService.createPage(SLUG, projectId(), owner.getId(),
                createReq("Sans emoji", null, null));

            assertThat(res.getEmoji()).isEqualTo("📄");
        }

        @Test
        @DisplayName("getPage renvoie la page demandée")
        void should_get_page() {
            PageResponse created = pageService.createPage(SLUG, projectId(), owner.getId(),
                createReq("À lire", "📖", "contenu"));

            PageResponse res = pageService.getPage(SLUG, projectId(), created.getId(), owner.getId());

            assertThat(res.getId()).isEqualTo(created.getId());
            assertThat(res.getTitle()).isEqualTo("À lire");
        }

        @Test
        @DisplayName("listPages renvoie toutes les pages du projet")
        void should_list_pages() {
            pageService.createPage(SLUG, projectId(), owner.getId(), createReq("Page 1", "1️⃣", null));
            pageService.createPage(SLUG, projectId(), owner.getId(), createReq("Page 2", "2️⃣", null));

            assertThat(pageService.listPages(SLUG, projectId(), owner.getId())).hasSize(2);
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("Mise à jour")
    class Update {

        @Test
        @DisplayName("updatePage met à jour titre, emoji et contenu")
        void should_update_all_fields() {
            PageResponse created = pageService.createPage(SLUG, projectId(), owner.getId(),
                createReq("Ancien titre", "📄", "ancien"));

            PageResponse res = pageService.updatePage(SLUG, projectId(), created.getId(), owner.getId(),
                updateReq("Nouveau titre", "✨", "nouveau"));

            assertThat(res.getTitle()).isEqualTo("Nouveau titre");
            assertThat(res.getEmoji()).isEqualTo("✨");
            assertThat(res.getContent()).isEqualTo("nouveau");
        }

        @Test
        @DisplayName("updatePage ignore un titre vide ou nul")
        void should_ignore_blank_title() {
            PageResponse created = pageService.createPage(SLUG, projectId(), owner.getId(),
                createReq("Titre conservé", "📄", "c"));

            PageResponse res = pageService.updatePage(SLUG, projectId(), created.getId(), owner.getId(),
                updateReq("   ", null, null));

            assertThat(res.getTitle()).isEqualTo("Titre conservé");
        }

        @Test
        @DisplayName("updatePage lève ResourceNotFoundException si la page n'existe pas")
        void should_throw_when_updating_unknown_page() {
            assertThatThrownBy(() ->
                pageService.updatePage(SLUG, projectId(), 999_999L, owner.getId(), updateReq("x", null, null)))
                .isInstanceOf(ResourceNotFoundException.class);
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("Suppression et cas négatifs")
    class DeleteAndNegative {

        @Test
        @DisplayName("deletePage retire la page")
        void should_delete_page() {
            PageResponse created = pageService.createPage(SLUG, projectId(), owner.getId(),
                createReq("Doomed", "📄", null));

            pageService.deletePage(SLUG, projectId(), created.getId(), owner.getId());

            assertThat(pageRepository.findById(created.getId())).isEmpty();
        }

        @Test
        @DisplayName("deletePage lève ResourceNotFoundException si la page n'existe pas")
        void should_throw_when_deleting_unknown_page() {
            assertThatThrownBy(() -> pageService.deletePage(SLUG, projectId(), 999_999L, owner.getId()))
                .isInstanceOf(ResourceNotFoundException.class);
        }

        @Test
        @DisplayName("getPage lève ResourceNotFoundException pour un id inconnu")
        void should_throw_when_page_unknown() {
            assertThatThrownBy(() -> pageService.getPage(SLUG, projectId(), 999_999L, owner.getId()))
                .isInstanceOf(ResourceNotFoundException.class);
        }

        @Test
        @DisplayName("getPage refuse une page d'un autre projet du même workspace")
        void should_reject_page_from_other_project() {
            PageResponse created = pageService.createPage(SLUG, projectId(), owner.getId(),
                createReq("Confidentielle", "🔒", null));
            Project other = projectRepository.save(Project.builder()
                .workspace(project.getWorkspace()).name("Autre").identifier("OTH").createdBy(owner).build());

            assertThatThrownBy(() -> pageService.getPage(SLUG, other.getId(), created.getId(), owner.getId()))
                .isInstanceOf(ResourceNotFoundException.class);
        }

        @Test
        @DisplayName("createPage lève ResourceNotFoundException pour un projet inconnu")
        void should_throw_when_project_unknown() {
            assertThatThrownBy(() ->
                pageService.createPage(SLUG, 999_999L, owner.getId(), createReq("x", null, null)))
                .isInstanceOf(ResourceNotFoundException.class);
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("PC-021 — IDOR inter-workspace (non-régression)")
    class CrossWorkspaceIdor {

        private static final String SLUG_MALLORY = "ws-mallory-it";

        private User mallory;

        @BeforeEach
        void seedAttacker() {
            mallory = userRepository.save(User.builder()
                .keycloakId("kc-mallory").email("mallory@it.dev").displayName("Mallory Doe").isActive(true).build());
            newWorkspace("Mallory WS", SLUG_MALLORY, mallory); // elle est OWNER — de SON workspace
        }

        /**
         * L'exploit d'origine, mot pour mot : Mallory est membre légitime de son propre workspace, donc
         * {@code WorkspaceAccessInterceptor} la laisse passer sur {@code /workspaces/ws-mallory-it/…}.
         * Elle glisse ensuite le {@code projectId} d'autrui. Avant le correctif, le service ne regardait
         * que le {@code projectId} et servait la page.
         */
        @Test
        @DisplayName("son slug + le projectId d'autrui → 404 (lecture)")
        void should_reject_foreign_project_id_under_own_slug() {
            PageResponse victim = pageService.createPage(SLUG, projectId(), owner.getId(),
                createReq("Secret", "🔒", "contenu privé"));

            assertThatThrownBy(() ->
                pageService.getPage(SLUG_MALLORY, projectId(), victim.getId(), mallory.getId()))
                .isInstanceOf(ResourceNotFoundException.class);
        }

        @Test
        @DisplayName("son slug + le projectId d'autrui → 404 (suppression)")
        void should_reject_foreign_delete() {
            PageResponse victim = pageService.createPage(SLUG, projectId(), owner.getId(),
                createReq("À ne pas supprimer", "🔒", null));

            assertThatThrownBy(() ->
                pageService.deletePage(SLUG_MALLORY, projectId(), victim.getId(), mallory.getId()))
                .isInstanceOf(ResourceNotFoundException.class);

            assertThat(pageRepository.findById(victim.getId())).isPresent();
        }

        @Test
        @DisplayName("son slug + le projectId d'autrui → 404 (listing)")
        void should_reject_foreign_list() {
            pageService.createPage(SLUG, projectId(), owner.getId(), createReq("Secret", "🔒", null));

            assertThatThrownBy(() -> pageService.listPages(SLUG_MALLORY, projectId(), mallory.getId()))
                .isInstanceOf(ResourceNotFoundException.class);
        }

        /**
         * Défense en profondeur : même en devinant le <b>bon</b> slug, la garde de visibilité tient —
         * le projet est privé et Mallory n'en est ni membre ni admin du workspace.
         */
        @Test
        @DisplayName("le bon slug mais un projet privé dont elle n'est pas membre → 404")
        void should_reject_private_project_even_with_right_slug() {
            PageResponse victim = pageService.createPage(SLUG, projectId(), owner.getId(),
                createReq("Secret", "🔒", null));

            assertThatThrownBy(() ->
                pageService.getPage(SLUG, projectId(), victim.getId(), mallory.getId()))
                .isInstanceOf(ResourceNotFoundException.class);
        }
    }
}
