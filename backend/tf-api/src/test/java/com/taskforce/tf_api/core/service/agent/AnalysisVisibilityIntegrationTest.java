package com.taskforce.tf_api.core.service.agent;

import java.util.EnumMap;
import java.util.Locale;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.dto.response.AnalysisJobResponse;
import com.taskforce.tf_api.core.enums.AnalysisDepth;
import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.AnalysisJobRepository;
import com.taskforce.tf_api.core.repository.DecisionBriefRepository;
import com.taskforce.tf_api.core.repository.DecisionPriorityRepository;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.core.service.ProjectVisibilityGuard;
import com.taskforce.tf_api.core.service.RealtimeAuthorizationService;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;
import com.taskforce.tf_api.util.AbstractIntegrationTest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

/**
 * L'analyse IA d'un projet, contre un vrai Postgres : la lancer et la suivre en direct suivent la visibilité du projet
 * ({@code ProjectVisibilityGuard}). Un projet privé reste à ses membres et aux propriétaires et admins de l'espace ;
 * avant, n'importe quel membre pouvait lancer une analyse dessus, et le canal de l'espace montrait à tous le nom du
 * projet et la question du modèle.
 */
@DisplayName("Analyse d'un projet : la lancer et la suivre en direct, seulement si l'on voit le projet (intégration Postgres)")
@Import({ProjectVisibilityGuard.class, RealtimeAuthorizationService.class, BrainAccessGuard.class})
class AnalysisVisibilityIntegrationTest extends AbstractIntegrationTest {

    private static final String SLUG = "ws-analysis-visibility";

    /** Qui agit : un admin de l'espace, un membre du projet privé, un membre de l'espace qui n'en est pas. */
    enum Reader { ADMIN, MEMBER, OUTSIDER }

    enum Visibility { PUBLIC, PRIVATE }

    @Autowired private BrainAccessGuard access;
    @Autowired private ProjectVisibilityGuard visibilityGuard;
    @Autowired private RealtimeAuthorizationService realtime;
    @Autowired private AnalysisJobRepository jobRepository;
    @Autowired private DecisionBriefRepository briefRepository;
    @Autowired private DecisionPriorityRepository priorityRepository;
    @Autowired private ProjectRepository projectRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private IssueRepository issueRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private WorkspaceMemberRepository workspaceMemberRepository;
    @Autowired private JdbcTemplate jdbc;

    private final SimpMessagingTemplate messaging = mock(SimpMessagingTemplate.class);
    private final Map<Reader, User> people = new EnumMap<>(Reader.class);
    private final Map<Visibility, Long> projects = new EnumMap<>(Visibility.class);
    private AnalysisJobService service;

    @BeforeEach
    void seed() {
        User owner = person(Reader.ADMIN);
        Workspace ws = workspaceRepository.save(Workspace.builder().name("Analysis visibility").slug(SLUG).owner(owner).build());
        join(ws, owner, WorkspaceRole.OWNER);
        join(ws, person(Reader.MEMBER), WorkspaceRole.MEMBER);
        join(ws, person(Reader.OUTSIDER), WorkspaceRole.MEMBER);

        for (Visibility visibility : Visibility.values()) {
            projects.put(visibility, jdbc.queryForObject("INSERT INTO projects (workspace_id, name, identifier, created_by, "
                + "is_public) VALUES (?, ?, ?, ?, ?) RETURNING id", Long.class, ws.getId(), "Project " + visibility,
                visibility.name().substring(0, 3), owner.getId(), visibility == Visibility.PUBLIC));
        }
        jdbc.update("INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, 'MEMBER')",
            projects.get(Visibility.PRIVATE), id(Reader.MEMBER));

        service = new AnalysisJobService(access, jobRepository, briefRepository, priorityRepository, projectRepository,
            userRepository, issueRepository, mock(IssueService.class), messaging, new ObjectMapper(), visibilityGuard);
    }

    private User person(Reader reader) {
        String name = reader.name().toLowerCase(Locale.ROOT);
        User user = userRepository.save(User.builder().keycloakId("kc-analysis-" + name)
            .email(name + "@analysis-visibility.dev").displayName(name).isActive(true).build());
        people.put(reader, user);
        return user;
    }

    private void join(Workspace ws, User user, WorkspaceRole role) {
        workspaceMemberRepository.save(WorkspaceMember.builder().workspace(ws).user(user).role(role).build());
    }

    private Long id(Reader reader) {
        return people.get(reader).getId();
    }

    @ParameterizedTest(name = "{0}, projet {1} : lance et suit l''analyse = {2}")
    @CsvSource({
        "MEMBER,   PRIVATE, true",
        "OUTSIDER, PRIVATE, false",
        "ADMIN,    PRIVATE, true",
        "MEMBER,   PUBLIC,  true",
        "OUTSIDER, PUBLIC,  true",
    })
    @DisplayName("lancer une analyse et s'abonner à son flux : la même règle que voir le projet")
    void launch_and_live_updates_follow_project_visibility(Reader reader, Visibility visibility, boolean allowed) {
        long projectId = projects.get(visibility);
        String stream = "/topic/projects." + projectId + ".analysis";

        // Suivre en direct : le flux d'analyse du projet s'ouvre comme son board (StompAuthInterceptor).
        assertThat(realtime.canSubscribeProject(id(reader), projectId)).isEqualTo(allowed);

        if (allowed) {
            AnalysisJobResponse job = service.launch(SLUG, projectId, id(reader), AnalysisDepth.QUICK);

            assertThat(job.projectId()).isEqualTo(projectId);
            verify(messaging).convertAndSend(eq(stream), any(AnalysisJobResponse.class));
        } else {
            assertThatThrownBy(() -> service.launch(SLUG, projectId, id(reader), AnalysisDepth.QUICK))
                .isInstanceOf(ResourceNotFoundException.class)
                .hasMessage("Project not found");
            assertThat(jdbc.queryForObject("SELECT count(*) FROM analysis_job WHERE project_id = ?", Long.class, projectId))
                .isZero();
            verifyNoInteractions(messaging);
        }
        verify(messaging, never()).convertAndSend(startsWith("/topic/analysis."), any(Object.class));
    }
}
