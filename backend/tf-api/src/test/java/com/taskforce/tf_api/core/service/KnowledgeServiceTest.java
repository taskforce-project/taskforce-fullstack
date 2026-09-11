package com.taskforce.tf_api.core.service;

import java.util.HashMap;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.dto.request.CreateKnowledgeNodeRequest;
import com.taskforce.tf_api.core.dto.request.MoveNodeRequest;
import com.taskforce.tf_api.core.dto.request.UpdateKnowledgeNodeRequest;
import com.taskforce.tf_api.core.dto.response.KnowledgeNodeResponse;
import com.taskforce.tf_api.core.enums.NodeDomain;
import com.taskforce.tf_api.core.enums.NodeStatus;
import com.taskforce.tf_api.core.enums.NodeType;
import com.taskforce.tf_api.core.model.KnowledgeNode;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.BrainWorkspaceRepository;
import com.taskforce.tf_api.core.repository.KnowledgeEdgeRepository;
import com.taskforce.tf_api.core.repository.KnowledgeNodeRepository;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;
import com.taskforce.tf_api.core.service.brain.BrainLinkService;
import com.taskforce.tf_api.core.service.brain.BrainSearchService;
import com.taskforce.tf_api.core.service.brain.BrainSeedingService;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Arbre de pages facon Notion (chantier C1) : {@link KnowledgeService} rend {@code parentNodeId}
 * settable a la creation et au deplacement, avec garde meme-workspace ({@code requireNode}) et
 * <b>anti-cycle</b> au reparentage. Le reste de la logique brain est couvert ailleurs (ingestion,
 * outils agent) ; on cible ici le seul comportement ajoute.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("KnowledgeService — parentNodeId (arbre de pages)")
class KnowledgeServiceTest {

    @Mock private BrainWorkspaceRepository brainWorkspaceRepository;
    @Mock private KnowledgeNodeRepository  nodeRepository;
    @Mock private KnowledgeEdgeRepository  edgeRepository;
    @Mock private BrainAccessGuard         access;
    @Mock private BrainSeedingService      seeding;
    @Mock private BrainSearchService       search;
    @Mock private BrainLinkService         links;
    @InjectMocks private KnowledgeService service;

    private static final String SLUG = "taskforce-demo";
    private static final Long USER = 1L;
    private static final Long WS = 7L;

    private Workspace workspace() {
        Workspace ws = mock(Workspace.class);
        when(ws.getId()).thenReturn(WS);
        when(access.resolveAndAuthorize(SLUG, USER)).thenReturn(ws);
        return ws;
    }

    private KnowledgeNode node(Long id, Long parentId) {
        return KnowledgeNode.builder()
            .id(id).type(NodeType.NOTE).domain(NodeDomain.PROJET).status(NodeStatus.ACTIVE)
            .title("N" + id).versionLabel("v1").parentNodeId(parentId).metadata(new HashMap<>())
            .build();
    }

    private KnowledgeNode captureSaved() {
        ArgumentCaptor<KnowledgeNode> cap = ArgumentCaptor.forClass(KnowledgeNode.class);
        verify(nodeRepository).save(cap.capture());
        return cap.getValue();
    }

    @Test
    @DisplayName("createNode avec parentNodeId : la page est nichee sous le parent (valide meme-workspace)")
    void create_with_parent_nests_under_it() {
        workspace();
        when(brainWorkspaceRepository.findByWorkspaceId(WS)).thenReturn(Optional.empty());
        when(access.requireNode(50L, WS)).thenReturn(node(50L, null));
        when(nodeRepository.save(any())).thenAnswer(i -> i.getArgument(0));

        KnowledgeNodeResponse res = service.createNode(SLUG, USER, CreateKnowledgeNodeRequest.builder()
            .type("NOTE").domain("PROJET").title("Sous-page").parentNodeId(50L).build());

        assertThat(captureSaved().getParentNodeId()).isEqualTo(50L);
        assertThat(res.getParentNodeId()).isEqualTo(50L);
        verify(access).requireNode(50L, WS); // garde meme-workspace
    }

    @Test
    @DisplayName("createNode sans parent : page racine (parentNodeId null)")
    void create_without_parent_is_root() {
        workspace();
        when(brainWorkspaceRepository.findByWorkspaceId(WS)).thenReturn(Optional.empty());
        when(nodeRepository.save(any())).thenAnswer(i -> i.getArgument(0));

        service.createNode(SLUG, USER, CreateKnowledgeNodeRequest.builder()
            .type("NOTE").domain("PROJET").title("Racine").build());

        assertThat(captureSaved().getParentNodeId()).isNull();
    }

    @Test
    @DisplayName("updateNode : deplacer une page sous une autre (sans cycle) reparente")
    void update_moves_page_under_another() {
        workspace();
        KnowledgeNode target = node(10L, null);
        when(access.requireNode(10L, WS)).thenReturn(target);
        when(access.requireNode(20L, WS)).thenReturn(node(20L, null)); // nouveau parent = racine
        when(nodeRepository.save(any())).thenAnswer(i -> i.getArgument(0));

        service.updateNode(SLUG, 10L, USER, UpdateKnowledgeNodeRequest.builder().parentNodeId(20L).build());

        assertThat(target.getParentNodeId()).isEqualTo(20L);
    }

    @Test
    @DisplayName("updateNode : une page ne peut pas etre sa propre parente")
    void update_rejects_self_parent() {
        workspace();
        when(access.requireNode(10L, WS)).thenReturn(node(10L, null));

        assertThatThrownBy(() -> service.updateNode(SLUG, 10L, USER,
            UpdateKnowledgeNodeRequest.builder().parentNodeId(10L).build()))
            .isInstanceOf(IllegalArgumentException.class);

        verify(nodeRepository, never()).save(any());
    }

    @Test
    @DisplayName("moveNode : deplacer sous une page pose le parent + aligne le domaine")
    void move_under_page_sets_parent_and_domain() {
        workspace();
        KnowledgeNode target = node(10L, null);
        when(access.requireNode(10L, WS)).thenReturn(target);
        when(access.requireNode(20L, WS)).thenReturn(node(20L, null));
        when(nodeRepository.save(any())).thenAnswer(i -> i.getArgument(0));

        service.moveNode(SLUG, 10L, USER, MoveNodeRequest.builder().parentNodeId(20L).domain("ENGINEERING").build());

        assertThat(target.getParentNodeId()).isEqualTo(20L);
        assertThat(target.getDomain()).isEqualTo(NodeDomain.ENGINEERING);
    }

    @Test
    @DisplayName("moveNode : parentNodeId null = remonter a la racine du domaine (parent efface)")
    void move_to_root_clears_parent() {
        workspace();
        KnowledgeNode target = node(10L, 99L); // avait un parent
        when(access.requireNode(10L, WS)).thenReturn(target);
        when(nodeRepository.save(any())).thenAnswer(i -> i.getArgument(0));

        service.moveNode(SLUG, 10L, USER, MoveNodeRequest.builder().parentNodeId(null).build());

        assertThat(target.getParentNodeId()).isNull();
        assertThat(target.getDomain()).isEqualTo(NodeDomain.PROJET); // domaine inchange (req.domain null)
    }

    @Test
    @DisplayName("updateNode : reparenter sous un descendant est refuse (anti-cycle)")
    void update_rejects_cycle() {
        workspace();
        when(access.requireNode(10L, WS)).thenReturn(node(10L, null));
        // 20 a pour parent 10 -> mettre 10 sous 20 boucle
        when(access.requireNode(20L, WS)).thenReturn(node(20L, 10L));

        assertThatThrownBy(() -> service.updateNode(SLUG, 10L, USER,
            UpdateKnowledgeNodeRequest.builder().parentNodeId(20L).build()))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("cycle");

        verify(nodeRepository, never()).save(any());
    }
}
