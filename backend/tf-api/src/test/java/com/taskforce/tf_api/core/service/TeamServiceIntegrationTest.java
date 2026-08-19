package com.taskforce.tf_api.core.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;

import com.taskforce.tf_api.core.dto.request.AddTeamMemberRequest;
import com.taskforce.tf_api.core.dto.request.CreateTeamRequest;
import com.taskforce.tf_api.core.dto.request.UpdateTeamRequest;
import com.taskforce.tf_api.core.dto.response.TeamResponse;
import com.taskforce.tf_api.core.enums.TeamRole;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.TeamMemberRepository;
import com.taskforce.tf_api.core.repository.TeamRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.util.AbstractIntegrationTest;

import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Tests d'intégration — {@link TeamService} (repos réels, aucun collaborateur externe).
 * CRUD équipe (créateur = LEAD), membres (ajout + doublon), suppression.
 */
@DisplayName("TeamService (intégration Postgres)")
@Import(TeamService.class)
class TeamServiceIntegrationTest extends AbstractIntegrationTest {

    @Autowired private TeamService teamService;
    @Autowired private TeamRepository teamRepository;
    @Autowired private TeamMemberRepository teamMemberRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private UserRepository userRepository;

    private static final String SLUG = "ws-team-it";
    private User owner;

    @BeforeEach
    void seed() {
        owner = userRepository.save(User.builder()
            .keycloakId("kc-team").email("team@it.dev").displayName("Owner").isActive(true).build());
        workspaceRepository.save(Workspace.builder().name("Team WS").slug(SLUG).owner(owner).build());
    }

    private User persistUser(String name) {
        return userRepository.save(User.builder()
            .keycloakId("kc-" + name).email(name + "@it.dev").displayName(name).isActive(true).build());
    }

    private TeamResponse createTeam(String name) {
        CreateTeamRequest r = new CreateTeamRequest();
        ReflectionTestUtils.setField(r, "name", name);
        return teamService.createTeam(SLUG, owner.getId(), r);
    }

    @Test
    @DisplayName("createTeam : le créateur devient LEAD ; listTeams/getTeam le retrouvent")
    void should_create_team_with_lead() {
        TeamResponse team = createTeam("Backend");

        assertThat(team.getName()).isEqualTo("Backend");
        assertThat(teamService.listMembers(SLUG, team.getId())).hasSize(1);
        assertThat(teamService.listTeams(SLUG)).hasSize(1);
        assertThat(teamService.getTeam(SLUG, team.getId()).getId()).isEqualTo(team.getId());
    }

    @Test
    @DisplayName("addMember ajoute un membre puis refuse le doublon")
    void should_add_member_then_reject_duplicate() {
        TeamResponse team = createTeam("QA");
        User bob = persistUser("bob");

        AddTeamMemberRequest add = new AddTeamMemberRequest();
        ReflectionTestUtils.setField(add, "userId", bob.getId());
        ReflectionTestUtils.setField(add, "role", TeamRole.MEMBER);
        teamService.addMember(SLUG, team.getId(), add);

        assertThat(teamService.listMembers(SLUG, team.getId())).hasSize(2);
        assertThatThrownBy(() -> teamService.addMember(SLUG, team.getId(), add))
            .isInstanceOf(IllegalStateException.class);
    }

    @Test
    @DisplayName("updateTeam change le nom")
    void should_update_team() {
        TeamResponse team = createTeam("Old");
        UpdateTeamRequest upd = new UpdateTeamRequest();
        ReflectionTestUtils.setField(upd, "name", "New");

        assertThat(teamService.updateTeam(SLUG, team.getId(), upd).getName()).isEqualTo("New");
    }

    @Test
    @DisplayName("deleteTeam supprime l'équipe")
    void should_delete_team() {
        TeamResponse team = createTeam("Doomed");

        teamService.deleteTeam(SLUG, team.getId());

        assertThat(teamRepository.findById(team.getId())).isEmpty();
    }
}
