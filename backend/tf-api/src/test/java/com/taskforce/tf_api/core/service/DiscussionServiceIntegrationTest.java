package com.taskforce.tf_api.core.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;

import com.taskforce.tf_api.core.dto.request.CreateDiscussionRequest;
import com.taskforce.tf_api.core.dto.request.UpdateDiscussionRequest;
import com.taskforce.tf_api.core.dto.response.DiscussionResponse;
import com.taskforce.tf_api.core.enums.DiscussionCategory;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.DiscussionRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.util.AbstractIntegrationTest;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Tests d'intégration — {@link DiscussionService} (repos réels).
 * CRUD discussion + pin/lock toggles.
 */
@DisplayName("DiscussionService (intégration Postgres)")
@Import(DiscussionService.class)
class DiscussionServiceIntegrationTest extends AbstractIntegrationTest {

    @Autowired private DiscussionService discussionService;
    @Autowired private DiscussionRepository discussionRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private UserRepository userRepository;

    private static final String SLUG = "ws-disc-it";
    private User owner;

    @BeforeEach
    void seed() {
        owner = userRepository.save(User.builder()
            .keycloakId("kc-disc").email("disc@it.dev").displayName("Owner").isActive(true).build());
        workspaceRepository.save(Workspace.builder().name("Disc WS").slug(SLUG).owner(owner).build());
    }

    private DiscussionResponse create(String title) {
        CreateDiscussionRequest r = new CreateDiscussionRequest();
        r.setTitle(title);
        r.setCategory(DiscussionCategory.QUESTION);
        return discussionService.createDiscussion(SLUG, owner.getId(), r);
    }

    @Test
    @DisplayName("create + list + get")
    void should_create_list_get() {
        DiscussionResponse d = create("Comment déployer ?");

        assertThat(d.getTitle()).isEqualTo("Comment déployer ?");
        assertThat(discussionService.listDiscussions(SLUG, null)).hasSize(1);
        assertThat(discussionService.getDiscussion(SLUG, d.getId()).getId()).isEqualTo(d.getId());
    }

    @Test
    @DisplayName("updateDiscussion change le titre")
    void should_update() {
        DiscussionResponse d = create("v1");
        UpdateDiscussionRequest upd = new UpdateDiscussionRequest();
        upd.setTitle("v2");

        assertThat(discussionService.updateDiscussion(SLUG, d.getId(), upd).getTitle()).isEqualTo("v2");
    }

    @Test
    @DisplayName("togglePin puis toggleLock s'exécutent et persistent")
    void should_toggle_pin_and_lock() {
        DiscussionResponse d = create("À épingler");

        assertThat(discussionService.togglePin(SLUG, d.getId())).isNotNull();
        assertThat(discussionService.toggleLock(SLUG, d.getId())).isNotNull();
    }

    @Test
    @DisplayName("deleteDiscussion la retire")
    void should_delete() {
        DiscussionResponse d = create("Doomed");

        discussionService.deleteDiscussion(SLUG, d.getId());

        assertThat(discussionRepository.findById(d.getId())).isEmpty();
    }
}
