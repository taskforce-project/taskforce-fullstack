package com.taskforce.tf_api.core.service.agent.tools;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.dto.response.ProjectResponse;
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.core.service.agent.AgentContext;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/** Le projet d'une demande à Cortex, par sa clé ou son nom, résolu par le code, jamais deviné (R48, séance n°8). */
@ExtendWith(MockitoExtension.class)
@DisplayName("ProjectResolver")
class ProjectResolverTest {

    private static final AgentContext CTX = new AgentContext("acme", 1L, 7L);

    @Mock private ProjectService projectService;

    private ProjectResolver resolver() {
        when(projectService.listProjects("acme", 7L)).thenReturn(List.of(
            project(3L, "TF", "TaskForce"),
            project(5L, "API", "API Platform"),
            project(8L, "WEB", "Web App"),
            project(9L, "NEXT", "Web App Next")));
        return new ProjectResolver(projectService);
    }

    private static ProjectResponse project(Long id, String key, String name) {
        return ProjectResponse.builder().id(id).identifier(key).name(name).build();
    }

    @ParameterizedTest(name = "« {0} » désigne {1}")
    @CsvSource({
        "TF,        TF",   // la clé
        "tf,        TF",   // sans tenir compte de la casse
        "TaskForce, TF",   // le nom
        "taskforce, TF",
        "platform,  API",  // une partie du nom, quand un seul projet la porte
        "Web App,   WEB",  // le nom exact l'emporte sur celui qui le contient
    })
    void finds_the_project(String asked, String key) {
        ProjectResolver.Resolution r = resolver().resolve(asked, CTX);

        assertThat(r.found()).isTrue();
        assertThat(r.project().getIdentifier()).isEqualTo(key);
        assertThat(r.problem()).isNull();
    }

    @ParameterizedTest(name = "« {0} » : {1}, avec {2}")
    @CsvSource(delimiter = '|', value = {
        "app    | Several projects match | NEXT (Web App Next)",  // deux noms le contiennent : Cortex demande
        "Mobile | No project matches     | TF (TaskForce)",
        "16     | No project matches     | TF (TaskForce)",       // un numéro n'est jamais un identifiant
        "''     | The project is missing | TF (TaskForce)",
    })
    void says_what_to_ask_instead_of_guessing(String asked, String problem, String choice) {
        ProjectResolver.Resolution r = resolver().resolve(asked, CTX);

        assertThat(r.found()).isFalse();
        assertThat(r.problem()).startsWith(problem).contains(choice);
    }

    @Test
    @DisplayName("aucun projet dans l'espace : le dit, sans choix à proposer")
    void no_project_at_all() {
        when(projectService.listProjects("acme", 7L)).thenReturn(List.of());

        ProjectResolver.Resolution r = new ProjectResolver(projectService).resolve("TF", CTX);

        assertThat(r.found()).isFalse();
        assertThat(r.problem()).contains("no project in this workspace");
    }
}
