package com.taskforce.tf_api.core.repository;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.jpa.test.autoconfigure.TestEntityManager;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.ProjectObjective;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.util.AbstractIntegrationTest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * L'objectif d'un projet contre un <b>vrai Postgres</b> (V133) : la migration s'applique, Hibernate valide le mapping, la
 * colonne JSON des critères se relit dans l'ordre, la table refuse un objectif sans critère ou avec plus de cinq, et le
 * projet supprimé emporte son objectif, quand la personne supprimée ne laisse que son nom vide.
 */
@DisplayName("Objectif d'un projet (intégration Postgres)")
class ProjectObjectiveRepositoryIntegrationTest extends AbstractIntegrationTest {

    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private ProjectRepository projectRepository;
    @Autowired private ProjectObjectiveRepository objectives;
    @Autowired private TestEntityManager em;
    @Autowired private JdbcTemplate jdbc;

    private User owner;
    private User editor;
    private Project project;

    @BeforeEach
    void seed() {
        owner = userRepository.save(User.builder().keycloakId("kc-obj-o").email("owner@it.dev").displayName("Owner").isActive(true).build());
        editor = userRepository.save(User.builder().keycloakId("kc-obj-e").email("editor@it.dev").displayName("Editor").isActive(true).build());
        Workspace ws = workspaceRepository.save(Workspace.builder().name("IT").slug("ws-objective-it").owner(owner).build());
        project = projectRepository.saveAndFlush(Project.builder().workspace(ws).name("Website").identifier("WEB").createdBy(owner).build());
    }

    private ProjectObjective objective(List<String> criteria) {
        return ProjectObjective.builder().projectId(project.getId()).goal("Ship the beta to ten teams")
            .targetDate(LocalDate.of(2026, 12, 31)).criteria(criteria).updatedBy(editor)
            .updatedAt(LocalDateTime.now().truncatedTo(ChronoUnit.SECONDS)).build();
    }

    @Test
    @DisplayName("la migration s'applique et l'objectif se relit tel qu'il a été écrit, critères dans l'ordre")
    void round_trips() {
        ProjectObjective written = objectives.saveAndFlush(objective(List.of("Ten teams use it weekly", "No open P1 bug", "Docs")));
        em.clear();

        ProjectObjective read = objectives.findById(project.getId()).orElseThrow();

        assertThat(read.getGoal()).isEqualTo("Ship the beta to ten teams");
        assertThat(read.getTargetDate()).isEqualTo(LocalDate.of(2026, 12, 31));
        assertThat(read.getCriteria()).containsExactly("Ten teams use it weekly", "No open P1 bug", "Docs");
        assertThat(read.getUpdatedBy().getId()).isEqualTo(editor.getId());
        assertThat(read.getUpdatedAt()).isEqualTo(written.getUpdatedAt());
        assertThat(jdbc.queryForObject("SELECT jsonb_typeof(criteria) FROM project_objectives WHERE project_id = ?",
            String.class, project.getId())).isEqualTo("array");
    }

    @Test
    @DisplayName("sans date visée, l'objectif se garde sans date ; le remplacer garde une seule ligne")
    void without_a_target_date_and_replaced() {
        ProjectObjective first = objective(List.of("One"));
        first.setTargetDate(null);
        objectives.saveAndFlush(first);
        em.clear();

        ProjectObjective again = objectives.findById(project.getId()).orElseThrow();
        assertThat(again.getTargetDate()).isNull();
        again.setGoal("Open the beta");
        again.setCriteria(List.of("Two", "Three"));
        objectives.saveAndFlush(again);
        em.clear();

        assertThat(objectives.count()).isEqualTo(1);
        assertThat(objectives.findById(project.getId()).orElseThrow().getCriteria()).containsExactly("Two", "Three");
    }

    @ParameterizedTest(name = "critères {0} : refusés par la table")
    @ValueSource(strings = {"[]", "[\"1\", \"2\", \"3\", \"4\", \"5\", \"6\"]", "\"one\"", "{\"a\": 1}"})
    @DisplayName("la table refuse un objectif sans critère, avec plus de cinq, ou dont les critères ne sont pas une liste")
    void the_table_refuses_bad_criteria(String criteria) {
        assertThatThrownBy(() -> jdbc.update("INSERT INTO project_objectives (project_id, goal, criteria, updated_at) "
                + "VALUES (?, 'Ship it', ?::jsonb, now())", project.getId(), criteria))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("le projet supprimé emporte son objectif ; la personne supprimée laisse l'objectif sans auteur")
    void follows_its_project_and_forgets_its_author() {
        objectives.saveAndFlush(objective(List.of("One")));

        jdbc.update("DELETE FROM users WHERE id = ?", editor.getId());
        em.clear();
        ProjectObjective orphan = objectives.findById(project.getId()).orElseThrow();
        assertThat(orphan.getUpdatedBy()).isNull();

        jdbc.update("DELETE FROM projects WHERE id = ?", project.getId());
        em.clear();
        assertThat(objectives.findById(project.getId())).isEmpty();
    }
}
