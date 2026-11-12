package com.taskforce.tf_api.core.service.agent;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.function.Predicate;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.response.CortexSourcesResponse;
import com.taskforce.tf_api.core.dto.response.CortexSourcesResponse.Source;
import com.taskforce.tf_api.core.enums.NodeStatus;
import com.taskforce.tf_api.core.enums.NodeType;
import com.taskforce.tf_api.core.model.ConnectorConnection;
import com.taskforce.tf_api.core.model.Integration;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.ConnectorConnectionRepository;
import com.taskforce.tf_api.core.repository.IntegrationRepository;
import com.taskforce.tf_api.core.repository.IssueCommentRepository;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.KnowledgeNodeRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;
import com.taskforce.tf_api.core.service.brain.BrainViewer;
import com.taskforce.tf_api.core.service.mcp.WorkspaceMcpService;

import lombok.RequiredArgsConstructor;

/**
 * Ce que Cortex peut lire dans un espace, pour la personne qui demande (R125, séance n°18) : les projets qu'elle voit,
 * leurs issues et leurs commentaires, les notes et les documents du Brain OS qu'elle lit, les connecteurs de l'espace.
 * Chaque source est comptée, avec la date de son dernier changement.
 *
 * <ul>
 *   <li>Les droits sont ceux des lectures de Cortex : un projet privé ne compte que pour qui le voit
 *       ({@code ProjectVisibilityGuard}), une note rattachée à un tel projet aussi ({@link BrainViewer}).</li>
 *   <li>Les issues archivées ne comptent pas, ni leurs commentaires : Cortex ne les lit plus.</li>
 *   <li>Une note ({@code NOTE}) est écrite par une personne ou par Cortex ; les autres pages du Brain OS (les fiches de
 *       projet, les décisions, les synthèses de l'ingestion) sont ses documents.</li>
 * </ul>
 *
 * <p>Rien d'une activité : on compte des contenus, jamais des gestes de l'agent (R57).</p>
 */
@Service
@RequiredArgsConstructor
public class CortexSourcesService {

    static final String PROJECTS = "projects";
    static final String ISSUES = "issues";
    static final String COMMENTS = "comments";
    static final String NOTES = "notes";
    static final String DOCUMENTS = "documents";
    static final String CONNECTORS = "connectors";

    private final BrainAccessGuard access;
    private final ProjectRepository projects;
    private final IssueRepository issues;
    private final IssueCommentRepository comments;
    private final KnowledgeNodeRepository nodes;
    private final IntegrationRepository integrations;
    private final ConnectorConnectionRepository connections;
    private final WorkspaceMcpService mcp;

    /** Les sources de Cortex dans l'espace, pour un de ses membres : dans l'ordre où le volet « Progress » les montre. */
    @Transactional(readOnly = true)
    public CortexSourcesResponse sources(String slug, Long userId) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        BrainViewer viewer = access.viewer(ws.getId(), userId);
        Set<Long> visible = viewer.seesAll() ? Set.of() : Set.copyOf(viewer.visibleProjectIds());
        Predicate<Long> sees = projectId -> viewer.seesAll() || visible.contains(projectId);

        List<Project> shown = projects.findByWorkspaceIdOrderByCreatedAtDesc(ws.getId()).stream()
            .filter(project -> sees.test(project.getId()))
            .toList();
        Set<Long> hidden = access.hiddenNodeIds(viewer);
        List<KnowledgeNodeRepository.SourceRow> read = nodes.findSourceRowsByWorkspaceIdAndStatus(ws.getId(),
                NodeStatus.ACTIVE).stream()
            .filter(node -> !hidden.contains(node.getId()))
            .toList();
        List<KnowledgeNodeRepository.SourceRow> notes = read.stream().filter(node -> node.getType() == NodeType.NOTE).toList();
        List<KnowledgeNodeRepository.SourceRow> documents = read.stream()
            .filter(node -> node.getType() != NodeType.NOTE)
            .toList();

        return new CortexSourcesResponse(List.of(
            new Source(PROJECTS, shown.size(), latest(shown.stream().map(Project::getUpdatedAt))),
            byProject(ISSUES, issues.countByProject(ws.getId()), sees),
            byProject(COMMENTS, comments.countByProject(ws.getId()), sees),
            new Source(NOTES, notes.size(), latest(notes.stream().map(KnowledgeNodeRepository.SourceRow::getUpdatedAt))),
            new Source(DOCUMENTS, documents.size(),
                latest(documents.stream().map(KnowledgeNodeRepository.SourceRow::getUpdatedAt))),
            connectors(ws.getId(), userId)));
    }

    /** Ce que portent les projets que la personne voit : la somme de leurs lignes, et le plus récent changement. */
    private static Source byProject(String key, List<IssueRepository.ProjectCount> rows, Predicate<Long> sees) {
        List<IssueRepository.ProjectCount> seen = rows.stream()
            .filter(row -> row.getProjectId() != null && sees.test(row.getProjectId()))
            .toList();
        long total = seen.stream().mapToLong(row -> row.getTotal() == null ? 0 : row.getTotal()).sum();
        return new Source(key, total, latest(seen.stream().map(IssueRepository.ProjectCount::getChangedAt)));
    }

    /**
     * Les connecteurs que Cortex lit pour cette personne : les intégrations natives de l'espace, datées de leur
     * connexion, et les serveurs MCP qu'elle utilise (les siens, ceux que l'espace partage ; séance n°22, R154), datés
     * de leur dernier changement. Un même outil compte une fois.
     */
    private Source connectors(Long workspaceId, Long userId) {
        Set<String> keys = new HashSet<>();
        List<LocalDateTime> dates = new ArrayList<>();
        for (Integration integration : integrations.findByWorkspaceId(workspaceId)) {
            keys.add(integration.getProvider().name().toLowerCase(Locale.ROOT));
            dates.add(integration.getConnectedAt());
        }
        Set<String> servers = mcp.connectedServers(workspaceId, userId).stream()
            .map(WorkspaceMcpService.ConnectedServer::connectorKey)
            .collect(Collectors.toSet());
        for (ConnectorConnection connection : connections.findUsable(workspaceId, userId)) {
            if (servers.contains(connection.getConnectorKey())) dates.add(connection.getUpdatedAt());
        }
        keys.addAll(servers);
        return new Source(CONNECTORS, keys.size(), latest(dates.stream()));
    }

    private static LocalDateTime latest(Stream<LocalDateTime> dates) {
        return dates.filter(Objects::nonNull).max(Comparator.naturalOrder()).orElse(null);
    }
}
