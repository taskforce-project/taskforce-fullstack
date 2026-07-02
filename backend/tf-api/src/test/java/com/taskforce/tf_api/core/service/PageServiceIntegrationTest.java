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
import com.taskforce.tf_api.core.model.Page;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.PageRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;
import com.taskforce.tf_api.util.AbstractIntegrationTest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Tests d'intégration — {@link PageService} contre un vrai Postgres (repos réels).
 * Couvre create/get/list/update/delete des pages wiki + cas négatifs (page introuvable,
 * projet/utilisateur introuvable, scope projet — IDOR).
 */
@DisplayName("PageService (intégration Postgres)")
@Import(PageService.class)
class PageServiceIntegrationTest extends AbstractIntegrationTest {

    @Autowired private PageService pageService;
    @Autowired private PageRepository pageRepository;
    @Autowired private ProjectRepository projectRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private UserRepository userRepository;

    private static final String SLUG = "ws-page-it";

    private User owner;
    private Project project;

    @BeforeEach
    void seed() {
        owner = userRepository.save(User.builder()
            .keycloakId("kc-page").email("page@it.dev").displayName("Jane Doe").isActive(true).build());
        Workspace ws = workspaceRepository.save(Workspace.builder()
            .name("Page WS").slug(SLUG).owner(owner).build());
        project = projectRepository.save(Project.builder()
            .workspace(ws).name("Wiki").identifier("WIK").createdBy(owner).build());
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
            PageResponse res = pageService.createPage(projectId(), owner.getId(),
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
            PageResponse res = pageService.createPage(projectId(), owner.getId(),
                createReq("Sans emoji", null, null));

            assertThat(res.getEmoji()).isEqualTo("📄");
        }

        @Test
        @DisplayName("getPage renvoie la page demandée")
        void should_get_page() {
            PageResponse created = pageService.createPage(projectId(), owner.getId(),
                createReq("À lire", "📖", "contenu"));

            PageResponse res = pageService.getPage(projectId(), created.getId());

            assertThat(res.getId()).isEqualTo(created.getId());
            assertThat(res.getTitle()).isEqualTo("À lire");
        }

        @Test
        @DisplayName("listPages renvoie toutes les pages du projet")
        void should_list_pages() {
            pageService.createPage(projectId(), owner.getId(), createReq("Page 1", "1️⃣", null));
            pageService.createPage(projectId(), owner.getId(), createReq("Page 2", "2️⃣", null));

            assertThat(pageService.listPages(projectId())).hasSize(2);
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("Mise à jour")
    class Update {

        @Test
        @DisplayName("updatePage met à jour titre, emoji et contenu")
        void should_update_all_fields() {
            PageResponse created = pageService.createPage(projectId(), owner.getId(),
                createReq("Ancien titre", "📄", "ancien"));

            PageResponse res = pageService.updatePage(projectId(), created.getId(),
                updateReq("Nouveau titre", "✨", "nouveau"));

            assertThat(res.getTitle()).isEqualTo("Nouveau titre");
            assertThat(res.getEmoji()).isEqualTo("✨");
            assertThat(res.getContent()).isEqualTo("nouveau");
        }

        @Test
        @DisplayName("updatePage ignore un titre vide ou nul")
        void should_ignore_blank_title() {
            PageResponse created = pageService.createPage(projectId(), owner.getId(),
                createReq("Titre conservé", "📄", "c"));

            PageResponse res = pageService.updatePage(projectId(), created.getId(),
                updateReq("   ", null, null));

            assertThat(res.getTitle()).isEqualTo("Titre conservé");
        }

        @Test
        @DisplayName("updatePage lève ResourceNotFoundException si la page n'existe pas")
        void should_throw_when_updating_unknown_page() {
            assertThatThrownBy(() ->
                pageService.updatePage(projectId(), 999_999L, updateReq("x", null, null)))
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
            PageResponse created = pageService.createPage(projectId(), owner.getId(),
                createReq("Doomed", "📄", null));

            pageService.deletePage(projectId(), created.getId());

            assertThat(pageRepository.findById(created.getId())).isEmpty();
        }

        @Test
        @DisplayName("deletePage lève ResourceNotFoundException si la page n'existe pas")
        void should_throw_when_deleting_unknown_page() {
            assertThatThrownBy(() -> pageService.deletePage(projectId(), 999_999L))
                .isInstanceOf(ResourceNotFoundException.class);
        }

        @Test
        @DisplayName("getPage lève ResourceNotFoundException pour un id inconnu")
        void should_throw_when_page_unknown() {
            assertThatThrownBy(() -> pageService.getPage(projectId(), 999_999L))
                .isInstanceOf(ResourceNotFoundException.class);
        }

        @Test
        @DisplayName("getPage refuse une page d'un autre projet (IDOR)")
        void should_reject_page_from_other_project() {
            PageResponse created = pageService.createPage(projectId(), owner.getId(),
                createReq("Confidentielle", "🔒", null));
            Project other = projectRepository.save(Project.builder()
                .workspace(project.getWorkspace()).name("Autre").identifier("OTH").createdBy(owner).build());

            assertThatThrownBy(() -> pageService.getPage(other.getId(), created.getId()))
                .isInstanceOf(ResourceNotFoundException.class);
        }

        @Test
        @DisplayName("createPage lève ResourceNotFoundException pour un projet inconnu")
        void should_throw_when_project_unknown() {
            assertThatThrownBy(() ->
                pageService.createPage(999_999L, owner.getId(), createReq("x", null, null)))
                .isInstanceOf(ResourceNotFoundException.class);
        }

        @Test
        @DisplayName("createPage lève ResourceNotFoundException pour un utilisateur inconnu")
        void should_throw_when_user_unknown() {
            assertThatThrownBy(() ->
                pageService.createPage(projectId(), 999_999L, createReq("x", null, null)))
                .isInstanceOf(ResourceNotFoundException.class);
        }
    }
}
