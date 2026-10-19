package com.taskforce.tf_api.core.service.brain;

import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.taskforce.tf_api.core.enums.NodeDomain;
import com.taskforce.tf_api.core.enums.NodeStatus;
import com.taskforce.tf_api.core.enums.NodeType;
import com.taskforce.tf_api.core.model.KnowledgeNode;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.KnowledgeNodeRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.EmbeddingClient;
import com.taskforce.tf_api.util.AbstractIntegrationTest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

/**
 * {@link BrainSearchService} contre un vrai Postgres (pgvector, plein texte) : la recherche marche sans IA
 * (plein texte), ne compare que des vecteurs du même modèle, et une modification efface le vecteur périmé.
 */
@DisplayName("BrainSearchService (intégration Postgres)")
@Import(BrainSearchService.class)
class BrainSearchServiceIntegrationTest extends AbstractIntegrationTest {

    @Autowired private BrainSearchService service;
    @Autowired private KnowledgeNodeRepository nodeRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private JdbcTemplate jdbcTemplate;

    @MockitoBean private EmbeddingClient embeddingClient;
    @MockitoBean private BrainAccessGuard access;

    private Workspace ws;
    private KnowledgeNode postgres;
    private KnowledgeNode deploy;
    private KnowledgeNode archived;

    @BeforeEach
    void seed() {
        User owner = userRepository.save(User.builder()
            .keycloakId("kc-brain-it").email("brain@it.dev").displayName("Owner").isActive(true).build());
        ws = workspaceRepository.save(Workspace.builder().name("Brain WS").slug("ws-brain-it").owner(owner).build());
        postgres = node("Database choice", "We keep PostgreSQL with pgvector for the knowledge search.", NodeStatus.ACTIVE);
        deploy = node("Deployment runbook", "Rolling deploy of the backend on two virtual machines.", NodeStatus.ACTIVE);
        archived = node("Old database notes", "PostgreSQL tuning from last year.", NodeStatus.ARCHIVED);
        when(embeddingClient.currentModel()).thenReturn(null); // sans IA par défaut
    }

    private KnowledgeNode node(String title, String content, NodeStatus status) {
        return nodeRepository.save(KnowledgeNode.builder()
            .workspace(ws).type(NodeType.NOTE).domain(NodeDomain.ENGINEERING)
            .title(title).content(content).status(status).build());
    }

    private float[] vector(float first) {
        float[] v = new float[EmbeddingClient.DIMENSIONS];
        Arrays.fill(v, 0.001f);
        v[0] = first;
        return v;
    }

    private void storeVector(KnowledgeNode n, float first, String model) {
        jdbcTemplate.update("UPDATE knowledge_nodes SET embedding = CAST(? AS vector), embedding_model = ? WHERE id = ?",
            EmbeddingClient.toVectorLiteral(vector(first)), model, n.getId());
    }

    @ParameterizedTest(name = "« {0} » → {1}")
    @CsvSource({
        "postgresql, Database choice",
        "Postgres search, Database choice",
        "DEPLOY, Deployment runbook",
        "virtual machines, Deployment runbook",
    })
    @DisplayName("sans IA : recherche plein texte (préfixes, casse ignorée), notes archivées exclues")
    void full_text_without_ai(String query, String expectedTitle) {
        List<KnowledgeNode> hits = service.retrieveRelevant(ws.getId(), query, 5);

        assertThat(hits).extracting(KnowledgeNode::getTitle).first().isEqualTo(expectedTitle);
        assertThat(hits).extracting(KnowledgeNode::getId).doesNotContain(archived.getId());
    }

    @Test
    @DisplayName("sans IA : requête sans mot exploitable → aucun résultat, pas d'erreur SQL")
    void full_text_ignores_symbols() {
        assertThat(service.retrieveRelevant(ws.getId(), "!!! ' : & |", 5)).isEmpty();
    }

    @Test
    @DisplayName("score plein texte normalisé dans [0, 1)")
    void full_text_scores_are_normalized() {
        assertThat(service.retrieveRelevantScored(ws.getId(), "postgresql", 5))
            .allSatisfy(s -> assertThat(s.score()).isBetween(0.0, 1.0));
    }

    @Test
    @DisplayName("avec IA : seuls les vecteurs du modèle courant sont comparés")
    void semantic_only_compares_same_model() {
        storeVector(postgres, 1.0f, "old-model");
        storeVector(deploy, 1.0f, "bge-m3");
        when(embeddingClient.currentModel()).thenReturn("bge-m3");
        when(embeddingClient.embed(anyString())).thenReturn(vector(1.0f));

        List<KnowledgeNode> hits = service.retrieveRelevant(ws.getId(), "anything", 5);

        assertThat(hits).extracting(KnowledgeNode::getId).containsExactly(deploy.getId());
    }

    @Test
    @DisplayName("avec IA mais aucun vecteur du modèle courant → repli plein texte")
    void semantic_falls_back_to_text() {
        storeVector(postgres, 1.0f, "old-model");
        when(embeddingClient.currentModel()).thenReturn("bge-m3");
        when(embeddingClient.embed(anyString())).thenReturn(vector(1.0f));

        List<KnowledgeNode> hits = service.retrieveRelevant(ws.getId(), "runbook", 5);

        assertThat(hits).extracting(KnowledgeNode::getTitle).containsExactly("Deployment runbook");
    }

    @Test
    @DisplayName("markForReindex efface le vecteur et le nom du modèle")
    void mark_for_reindex() {
        storeVector(postgres, 1.0f, "bge-m3");

        service.markForReindex(postgres.getId());

        Boolean cleared = jdbcTemplate.queryForObject(
            "SELECT embedding IS NULL AND embedding_model IS NULL FROM knowledge_nodes WHERE id = ?",
            Boolean.class, postgres.getId());
        assertThat(cleared).isTrue();
    }

    @Test
    @DisplayName("mots de la requête : lettres et chiffres, minuscules, sans doublon, huit au plus")
    void terms() {
        assertThat(BrainSearchService.terms("Postgres, POSTGRES & pgvector: v2 a"))
            .containsExactly("postgres", "pgvector", "v2");
        assertThat(BrainSearchService.terms("one two three four five six seven eight nine")).hasSize(8);
        assertThat(BrainSearchService.terms(null)).isEmpty();
    }
}
