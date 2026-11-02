package com.taskforce.tf_api.core.service.brain;

import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Stream;
import java.util.stream.StreamSupport;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.taskforce.tf_api.core.dto.request.CreateKnowledgeNodeRequest;
import com.taskforce.tf_api.core.dto.request.MoveNodeRequest;
import com.taskforce.tf_api.core.dto.request.UpdateKnowledgeNodeRequest;
import com.taskforce.tf_api.core.dto.response.AssistantAnswer;
import com.taskforce.tf_api.core.dto.response.BrainOverviewResponse;
import com.taskforce.tf_api.core.dto.response.KnowledgeNodeResponse;
import com.taskforce.tf_api.core.dto.response.KnowledgeSearchHit;
import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.security.DeliverySessionFilter;
import com.taskforce.tf_api.core.security.PersonalTokenAuthenticator;
import com.taskforce.tf_api.core.service.AiUsageService;
import com.taskforce.tf_api.core.service.AnalyticsService;
import com.taskforce.tf_api.core.service.AuthorizationService;
import com.taskforce.tf_api.core.service.EmbeddingClient;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.core.service.KnowledgeService;
import com.taskforce.tf_api.core.service.LlmClient;
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.core.service.ProjectVisibilityGuard;
import com.taskforce.tf_api.core.service.SmartAssignService;
import com.taskforce.tf_api.core.service.agent.AgentContext;
import com.taskforce.tf_api.core.service.agent.AgentService;
import com.taskforce.tf_api.core.service.agent.AgentToolRegistry;
import com.taskforce.tf_api.core.service.agent.CortexGate;
import com.taskforce.tf_api.core.service.agent.CortexRecordService;
import com.taskforce.tf_api.core.service.agent.CortexUndo;
import com.taskforce.tf_api.core.service.agent.tools.SearchBrainTool;
import com.taskforce.tf_api.core.service.mcp.WorkspaceMcpService;
import com.taskforce.tf_api.core.service.mcpserver.IssueGestures;
import com.taskforce.tf_api.core.service.mcpserver.McpServerService;
import com.taskforce.tf_api.core.service.mcpserver.TaskforceMcpTools;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;
import com.taskforce.tf_api.shared.security.JwtIdentityResolver;
import com.taskforce.tf_api.util.AbstractIntegrationTest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.params.provider.Arguments.arguments;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Brain OS et projets privés, contre un vrai Postgres : une note rattachée à un projet ne sort que pour qui voit ce
 * projet, par chaque chemin de lecture. La recherche de l'API, Cortex (sa recherche automatique et son outil
 * {@code search_brain}), l'outil MCP {@code brain_search} avec un jeton personnel ou une session déléguée, la vue
 * d'ensemble et les pages suivent la même table de vérité. Le filtre est dans la requête : la personne reçoit autant de
 * notes qu'elle en demande.
 */
@DisplayName("Brain OS : une note d'un projet privé ne sort que pour qui voit ce projet (intégration Postgres)")
@Import({BrainSearchService.class, BrainAccessGuard.class, ProjectVisibilityGuard.class, KnowledgeService.class})
class BrainVisibilityIntegrationTest extends AbstractIntegrationTest {

    private static final String SLUG = "ws-brain-visibility";
    private static final String MODEL = "bge-m3";

    /** Qui lit : un admin de l'espace, un membre du projet privé, un membre de l'espace qui n'en est pas. */
    enum Reader { ADMIN, MEMBER, OUTSIDER }

    /** Avec quel jeton le client MCP appelle : le jeton personnel de la personne, ou une session qu'elle a déléguée. */
    enum Token { PERSONAL, DELEGATED }

    enum Mode { TEXT, SEMANTIC }

    /**
     * Une note par façon d'être rattachée, ou non, à un projet ; chaque note du projet privé l'est d'une seule façon.
     * Chaque note porte un mot à elle, le premier de son titre, pour qu'une recherche la trouve seule.
     */
    enum Note {
        WORKSPACE_NOTE("Zephyr charter", false),    // note de l'espace, sans projet
        PUBLIC_PROJECT("Quasar roadmap", false),    // dossier du projet public (refType PROJECT)
        PUBLIC_PAGE("Lumen guide", false),          // page rangée sous le dossier du projet public
        PRIVATE_FOLDER("Nebula folder", true),      // dossier du projet privé (refType PROJECT)
        PRIVATE_SECTION("Photon section", true),    // page rangée sous ce dossier, sans référence
        PRIVATE_SUBPAGE("Quark runbook", true),     // page rangée deux niveaux sous le dossier, sans référence
        PRIVATE_PAGE("Pulsar architecture", true),  // refId sans refType, comme les notes de l'ingestion
        PRIVATE_RETRO("Comet retro", true),         // rétro d'un cycle du projet privé (refType CYCLE)
        PRIVATE_SPEC("Meteor spec", true),          // spec d'une issue du projet privé (refType ISSUE)
        PRIVATE_METADATA("Aurora notes", true);     // rattachée par metadata.projectId seulement

        final String title;
        final String word;
        final boolean ofPrivateProject;

        Note(String title, boolean ofPrivateProject) {
            this.title = title;
            this.word = title.split(" ")[0].toLowerCase(Locale.ROOT);
            this.ofPrivateProject = ofPrivateProject;
        }

        boolean readBy(Reader reader) {
            return !ofPrivateProject || reader != Reader.OUTSIDER;
        }
    }

    /** La table de vérité de tous les chemins de lecture : qui lit quelle note. */
    static Stream<Arguments> readings() {
        return Stream.of(
            arguments(Reader.MEMBER, Note.WORKSPACE_NOTE, true),
            arguments(Reader.MEMBER, Note.PUBLIC_PROJECT, true),
            arguments(Reader.MEMBER, Note.PUBLIC_PAGE, true),
            arguments(Reader.MEMBER, Note.PRIVATE_FOLDER, true),
            arguments(Reader.MEMBER, Note.PRIVATE_SECTION, true),
            arguments(Reader.MEMBER, Note.PRIVATE_SUBPAGE, true),
            arguments(Reader.MEMBER, Note.PRIVATE_PAGE, true),
            arguments(Reader.MEMBER, Note.PRIVATE_RETRO, true),
            arguments(Reader.MEMBER, Note.PRIVATE_SPEC, true),
            arguments(Reader.MEMBER, Note.PRIVATE_METADATA, true),
            arguments(Reader.OUTSIDER, Note.WORKSPACE_NOTE, true),
            arguments(Reader.OUTSIDER, Note.PUBLIC_PROJECT, true),
            arguments(Reader.OUTSIDER, Note.PUBLIC_PAGE, true),
            arguments(Reader.OUTSIDER, Note.PRIVATE_FOLDER, false),
            arguments(Reader.OUTSIDER, Note.PRIVATE_SECTION, false),
            arguments(Reader.OUTSIDER, Note.PRIVATE_SUBPAGE, false),
            arguments(Reader.OUTSIDER, Note.PRIVATE_PAGE, false),
            arguments(Reader.OUTSIDER, Note.PRIVATE_RETRO, false),
            arguments(Reader.OUTSIDER, Note.PRIVATE_SPEC, false),
            arguments(Reader.OUTSIDER, Note.PRIVATE_METADATA, false),
            arguments(Reader.ADMIN, Note.PRIVATE_SUBPAGE, true),
            arguments(Reader.ADMIN, Note.PRIVATE_SPEC, true));
    }

    /** La même table, pour chaque jeton du serveur MCP. */
    static Stream<Arguments> readingsByToken() {
        return readings().flatMap(row -> Stream.of(Token.values())
            .map(token -> arguments(token, row.get()[0], row.get()[1], row.get()[2])));
    }

    @Autowired private BrainSearchService search;
    @Autowired private BrainAccessGuard access;
    @Autowired private KnowledgeService knowledge;
    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private WorkspaceMemberRepository workspaceMemberRepository;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private Environment environment;

    @MockitoBean private EmbeddingClient embeddingClient;
    @MockitoBean private BrainSeedingService seeding;
    @MockitoBean private BrainLinkService links;

    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
    private final Map<Reader, User> people = new EnumMap<>(Reader.class);
    private final Map<Note, Long> notes = new EnumMap<>(Note.class);
    private Workspace ws;
    private long publicProject;
    private long privateProject;
    private AgentService cortex;
    private SearchBrainTool searchBrainTool;
    private McpServerService mcp;

    @BeforeEach
    void seed() {
        User owner = person(Reader.ADMIN);
        ws = workspaceRepository.save(Workspace.builder().name("Brain visibility").slug(SLUG).owner(owner).build());
        join(owner, WorkspaceRole.OWNER);
        join(person(Reader.MEMBER), WorkspaceRole.MEMBER);
        join(person(Reader.OUTSIDER), WorkspaceRole.MEMBER);

        publicProject = project("Quasar", "QSR", true);
        privateProject = project("Nebula", "NEB", false);
        jdbc.update("INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, 'MEMBER')",
            privateProject, id(Reader.MEMBER));
        long status = id("INSERT INTO issue_statuses (project_id, name, category, is_default) "
            + "VALUES (?, 'Todo', 'UNSTARTED', true)", privateProject);
        long privateIssue = id("INSERT INTO issues (project_id, sequence_number, title, status_id, reporter_id) "
            + "VALUES (?, 1, 'Secret plan', ?, ?)", privateProject, status, owner.getId());
        long privateCycle = id("INSERT INTO cycles (project_id, name, created_by) VALUES (?, 'Sprint 1', ?)",
            privateProject, owner.getId());

        note(Note.WORKSPACE_NOTE, null, null, "{}", null);
        long publicFolder = note(Note.PUBLIC_PROJECT, "PROJECT", publicProject, "{}", null);
        note(Note.PUBLIC_PAGE, null, null, "{}", publicFolder);
        long folder = note(Note.PRIVATE_FOLDER, "PROJECT", privateProject, "{}", null);
        long section = note(Note.PRIVATE_SECTION, null, null, "{}", folder);
        note(Note.PRIVATE_SUBPAGE, null, null, "{}", section);
        note(Note.PRIVATE_PAGE, null, privateProject, "{}", null);
        note(Note.PRIVATE_RETRO, "CYCLE", privateCycle, "{}", null);
        note(Note.PRIVATE_SPEC, "ISSUE", privateIssue, "{}", null);
        note(Note.PRIVATE_METADATA, null, null, "{\"projectId\": " + privateProject + "}", null);

        when(embeddingClient.currentModel()).thenReturn(null); // sans IA par défaut : plein texte

        LlmClient llm = mock(LlmClient.class);
        when(llm.isConfigured()).thenReturn(false); // Cortex répond par les notes trouvées
        cortex = new AgentService(access, search, mock(AgentToolRegistry.class), llm, mapper, mock(AiUsageService.class),
            mock(WorkspaceMcpService.class), mock(AuthorizationService.class), mock(CortexGate.class),
            mock(CortexRecordService.class), mock(CortexUndo.class),
            mock(com.taskforce.tf_api.core.service.agent.ScreenContext.class));
        searchBrainTool = new SearchBrainTool(search, access);
        // Les gestes sur une issue ne servent pas ici : les arguments de brain_search passent tels quels.
        IssueGestures gestures = mock(IssueGestures.class);
        when(gestures.withIds(any(), any(), any())).thenAnswer(inv -> inv.getArgument(2));
        TaskforceMcpTools tools = new TaskforceMcpTools(mapper, mock(ProjectService.class), mock(IssueService.class),
            mock(SmartAssignService.class), search, mock(AnalyticsService.class), cortex, gestures,
            mock(com.taskforce.tf_api.core.service.mcpserver.ProjectGestures.class));
        mcp = new McpServerService(tools, mapper, userRepository, new JwtIdentityResolver(environment));
    }

    // ------------------------------------------------------------------ fixture

    private User person(Reader reader) {
        String name = reader.name().toLowerCase(Locale.ROOT);
        User user = userRepository.save(User.builder().keycloakId("kc-brain-" + name)
            .email(name + "@brain-visibility.dev").displayName(name).isActive(true).build());
        people.put(reader, user);
        return user;
    }

    private void join(User user, WorkspaceRole role) {
        workspaceMemberRepository.save(WorkspaceMember.builder().workspace(ws).user(user).role(role).build());
    }

    private Long id(Reader reader) {
        return people.get(reader).getId();
    }

    private long id(String insert, Object... args) {
        return jdbc.queryForObject(insert + " RETURNING id", Long.class, args);
    }

    private long project(String name, String identifier, boolean isPublic) {
        return id("INSERT INTO projects (workspace_id, name, identifier, created_by, is_public) VALUES (?, ?, ?, ?, ?)",
            ws.getId(), name, identifier, id(Reader.ADMIN), isPublic);
    }

    /** Une note : son mot, puis « plan », une fois, ou quatre pour une note du projet privé (elle passe devant). */
    private long note(Note note, String refType, Long refId, String metadata, Long parent) {
        String content = note.word + (note.ofPrivateProject ? " plan plan plan plan" : " plan");
        long id = insertNode(note.title, content, refType, refId, metadata, parent);
        notes.put(note, id);
        return id;
    }

    private long insertNode(String title, String content, String refType, Long refId, String metadata, Long parent) {
        return id("INSERT INTO knowledge_nodes (workspace_id, type, domain, title, content, status, ref_type, ref_id, "
            + "metadata, parent_node_id, created_by) VALUES (?, 'NOTE', 'ENGINEERING', ?, ?, 'ACTIVE', ?, ?, "
            + "CAST(? AS jsonb), ?, ?)", ws.getId(), title, content, refType, refId, metadata, parent,
            String.valueOf(id(Reader.ADMIN)));
    }

    /** Vecteurs : les notes du projet privé tout contre la requête, puis la note de l'espace et celles du projet public. */
    private void useVectors() {
        Map<Note, float[]> directions = new HashMap<>();
        directions.put(Note.WORKSPACE_NOTE, vector(0.8f, 0.6f));
        directions.put(Note.PUBLIC_PROJECT, vector(0.6f, 0.8f));
        directions.put(Note.PUBLIC_PAGE, vector(0f, 1f));
        for (Note note : Note.values()) {
            float[] v = directions.getOrDefault(note, vector(1f, 0f));
            jdbc.update("UPDATE knowledge_nodes SET embedding = CAST(? AS vector), embedding_model = ? WHERE id = ?",
                EmbeddingClient.toVectorLiteral(v), MODEL, notes.get(note));
        }
        when(embeddingClient.currentModel()).thenReturn(MODEL);
        when(embeddingClient.embed(anyString())).thenReturn(vector(1f, 0f));
    }

    private static float[] vector(float x, float y) {
        float[] v = new float[EmbeddingClient.DIMENSIONS];
        v[0] = x;
        v[1] = y;
        return v;
    }

    private static List<String> titles(List<KnowledgeSearchHit> hits) {
        return hits.stream().map(hit -> hit.getNode().getTitle()).toList();
    }

    private static List<String> titlesOf(Stream<Note> readable) {
        return readable.map(note -> note.title).toList();
    }

    private Jwt principal(Token token, Reader reader) {
        Jwt.Builder jwt = Jwt.withTokenValue("t").header("alg", "none").claim("email", people.get(reader).getEmail());
        return switch (token) {
            case PERSONAL -> jwt.claim(PersonalTokenAuthenticator.TOKEN_CLAIM, 3L).build();
            // Run et issue fictifs : la recherche est une lecture, que la portée admet quelle que soit l'issue du run.
            case DELEGATED -> jwt.claim(DeliverySessionFilter.RUN_CLAIM, 100L)
                .claim(DeliverySessionFilter.WORKSPACE_CLAIM, SLUG)
                .claim(DeliverySessionFilter.PROJECT_CLAIM, publicProject)
                .claim(DeliverySessionFilter.ISSUE_CLAIM, 1L)
                .build();
        };
    }

    private JsonNode brainSearchOverMcp(Jwt principal, String query) {
        ObjectNode message = mapper.createObjectNode().put("jsonrpc", "2.0").put("id", 1).put("method", "tools/call");
        message.putObject("params").put("name", "brain_search")
            .set("arguments", mapper.createObjectNode().put("query", query).put("topK", 20));
        return mcp.handle(SLUG, principal, message).orElseThrow().path("result");
    }

    // ------------------------------------------------------------------ recherche de l'API (et du front)

    @ParameterizedTest(name = "{0} cherche « {1} » : lue = {2}")
    @MethodSource("readings")
    @DisplayName("recherche plein texte : une note d'un projet privé ne sort que pour qui voit le projet")
    void search_full_text(Reader reader, Note note, boolean read) {
        List<KnowledgeSearchHit> hits = search.search(SLUG, id(reader), note.word, 50, null);

        assertThat(titles(hits)).isEqualTo(read ? List.of(note.title) : List.of());
    }

    @ParameterizedTest(name = "{0}")
    @EnumSource(Reader.class)
    @DisplayName("recherche sémantique : exactement les notes que la personne lit")
    void search_semantic(Reader reader) {
        useVectors();

        List<KnowledgeSearchHit> hits = search.search(SLUG, id(reader), "anything", 50, null);

        assertThat(titles(hits)).containsExactlyInAnyOrderElementsOf(
            titlesOf(Stream.of(Note.values()).filter(note -> note.readBy(reader))));
    }

    @ParameterizedTest(name = "{0}, recherche {1}")
    @CsvSource({"MEMBER, TEXT", "OUTSIDER, TEXT", "MEMBER, SEMANTIC", "OUTSIDER, SEMANTIC"})
    @DisplayName("le filtre est dans la requête : deux notes demandées, deux notes lues, même quand les plus proches sont cachées")
    void top_k_counts_only_readable_notes(Reader reader, Mode mode) {
        if (mode == Mode.SEMANTIC) useVectors();

        List<String> titles = titles(search.search(SLUG, id(reader), "plan", 2, null));

        // Les notes du projet privé passent devant : un membre les reçoit, les autres reçoivent les suivantes.
        List<String> expectedPool = titlesOf(Stream.of(Note.values())
            .filter(note -> reader == Reader.MEMBER ? note.ofPrivateProject : !note.ofPrivateProject));
        assertThat(titles).hasSize(2).allMatch(expectedPool::contains);
        if (mode == Mode.SEMANTIC && reader == Reader.OUTSIDER) {
            assertThat(titles).containsExactly(Note.WORKSPACE_NOTE.title, Note.PUBLIC_PROJECT.title);
        }
    }

    @ParameterizedTest(name = "{0} : lue = {1}")
    @CsvSource({"ADMIN, true", "MEMBER, false", "OUTSIDER, false"})
    @DisplayName("une note rattachée à un projet supprimé reste cachée, sauf aux propriétaires et admins")
    void note_of_a_deleted_project_stays_hidden(Reader reader, boolean read) {
        insertNode("Relic notes", "relic", "PROJECT", Long.MAX_VALUE, "{}", null);

        assertThat(titles(search.search(SLUG, id(reader), "relic", 50, null)))
            .isEqualTo(read ? List.of("Relic notes") : List.of());
    }

    // ------------------------------------------------------------------ Cortex

    @ParameterizedTest(name = "{0} demande « {1} » : lue = {2}")
    @MethodSource("readings")
    @DisplayName("Cortex : sa recherche automatique et son outil search_brain ne citent que ce que la personne lit")
    void cortex_reads_like_the_person(Reader reader, Note note, boolean read) {
        AssistantAnswer answer = cortex.run(SLUG, id(reader), note.word);
        String tool = searchBrainTool.execute(Map.of("query", note.word, "topK", 20),
            new AgentContext(SLUG, ws.getId(), id(reader)));

        assertThat(answer.sources()).extracting(AssistantAnswer.AssistantSource::title)
            .isEqualTo(read ? List.of(note.title) : List.of());
        if (read) {
            assertThat(tool).contains(note.title);
        } else {
            assertThat(tool).isEqualTo("No relevant note found.");
        }
    }

    @ParameterizedTest(name = "analyse du projet {0} : notes du projet privé lues = {1}")
    @CsvSource({"PUBLIC, false", "PRIVATE, true"})
    @DisplayName("l'analyse d'un projet ne lit que ce que voit tout son public")
    void project_analysis_reads_what_its_audience_reads(String project, boolean privateNotesRead) {
        BrainViewer audience = access.projectAudience(ws.getId(), "PUBLIC".equals(project) ? publicProject : privateProject);

        List<String> titles = search.retrieveRelevant(audience, "plan", 20).stream().map(n -> n.getTitle()).toList();

        assertThat(titles).containsExactlyInAnyOrderElementsOf(titlesOf(Stream.of(Note.values())
            .filter(note -> privateNotesRead || !note.ofPrivateProject)));
    }

    // ------------------------------------------------------------------ serveur MCP

    @ParameterizedTest(name = "jeton {0} de {1}, brain_search « {2} » : lue = {3}")
    @MethodSource("readingsByToken")
    @DisplayName("MCP brain_search : les droits de la personne du jeton, personnel ou délégué")
    void mcp_brain_search_reads_like_the_token_owner(Token token, Reader reader, Note note, boolean read) {
        JsonNode result = brainSearchOverMcp(principal(token, reader), note.word);

        assertThat(result.path("isError").asBoolean()).isFalse();
        List<String> titles = StreamSupport.stream(result.path("structuredContent").path("hits").spliterator(), false)
            .map(hit -> hit.path("node").path("title").asText())
            .toList();
        assertThat(titles).isEqualTo(read ? List.of(note.title) : List.of());
    }

    // ------------------------------------------------------------------ vue d'ensemble et pages (API REST)

    @ParameterizedTest(name = "{0}")
    @EnumSource(Reader.class)
    @DisplayName("vue d'ensemble : les pages et les liens que la personne lit, rien d'autre")
    void overview_shows_only_readable_pages_and_links(Reader reader) {
        String edge = "INSERT INTO knowledge_edges (workspace_id, from_node_id, to_node_id, relation_type, created_by) "
            + "VALUES (?, ?, ?, 'RELATES_TO', 'test')";
        jdbc.update(edge, ws.getId(), notes.get(Note.WORKSPACE_NOTE), notes.get(Note.PUBLIC_PROJECT));
        jdbc.update(edge, ws.getId(), notes.get(Note.WORKSPACE_NOTE), notes.get(Note.PRIVATE_FOLDER));

        BrainOverviewResponse overview = knowledge.getOverview(SLUG, id(reader));

        List<String> readable = titlesOf(Stream.of(Note.values()).filter(note -> note.readBy(reader)));
        assertThat(overview.getNodes()).extracting(KnowledgeNodeResponse::getTitle).containsExactlyInAnyOrderElementsOf(readable);
        assertThat(overview.getTotalNodes()).isEqualTo(readable.size());
        assertThat(overview.getEdges()).hasSize(reader == Reader.OUTSIDER ? 1 : 2);
    }

    enum PageOperation { UPDATE, MOVE, DELETE, NEST_UNDER }

    @ParameterizedTest(name = "{1} : {0} sur une page du projet privé → permis = {2}")
    @CsvSource({
        "UPDATE,     OUTSIDER, false",
        "MOVE,       OUTSIDER, false",
        "DELETE,     OUTSIDER, false",
        "NEST_UNDER, OUTSIDER, false",
        "UPDATE,     MEMBER,   true",
        "MOVE,       MEMBER,   true",
        "DELETE,     MEMBER,   true",
        "NEST_UNDER, MEMBER,   true",
    })
    @DisplayName("pages : une page d'un projet privé répond 404 à qui ne voit pas le projet, comme une page absente")
    void private_page_answers_not_found(PageOperation operation, Reader reader, boolean allowed) {
        Long page = notes.get(Note.PRIVATE_SUBPAGE);
        Function<PageOperation, Object> run = op -> switch (op) {
            case UPDATE -> knowledge.updateNode(SLUG, page, id(reader), UpdateKnowledgeNodeRequest.builder().build());
            case MOVE -> knowledge.moveNode(SLUG, page, id(reader), MoveNodeRequest.builder().build());
            case DELETE -> {
                knowledge.deleteNode(SLUG, page, id(reader));
                yield page;
            }
            case NEST_UNDER -> knowledge.createNode(SLUG, id(reader), CreateKnowledgeNodeRequest.builder()
                .type("NOTE").domain("ENGINEERING").title("Hidden child").parentNodeId(notes.get(Note.PRIVATE_FOLDER)).build());
        };

        if (allowed) {
            assertThatCode(() -> run.apply(operation)).doesNotThrowAnyException();
        } else {
            assertThatThrownBy(() -> run.apply(operation)).isInstanceOf(ResourceNotFoundException.class)
                .hasMessage("Page not found: " + (operation == PageOperation.NEST_UNDER ? notes.get(Note.PRIVATE_FOLDER) : page));
            assertThat(jdbc.queryForObject("SELECT count(*) FROM knowledge_nodes WHERE id = ?", Long.class, page)).isEqualTo(1);
        }
    }
}
