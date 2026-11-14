package com.taskforce.tf_api.core.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDateTime;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import com.taskforce.tf_api.core.model.ProcessDefinition;
import com.taskforce.tf_api.core.model.ProcessVersion;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.process.ProcessFingerprint;
import com.taskforce.tf_api.core.process.ProcessJson;
import com.taskforce.tf_api.core.process.ProcessModel;
import com.taskforce.tf_api.util.AbstractIntegrationTest;

/**
 * Les versions des processus contre un vrai Postgres (V132) : changer une version publiée échoue en base, comme dans le
 * service ; une version ne s'efface pas seule, mais part avec son projet ; une clé ne change pas ; le modèle revient de
 * sa colonne JSON avec la même empreinte ; la liste des versions se lit sans les modèles.
 *
 * <p>Chaque refus de la base se joue sous un point de sauvegarde : une erreur ne laisse pas la transaction du test
 * inutilisable pour la suite.</p>
 */
@DisplayName("Les versions des processus (intégration Postgres)")
class ProcessVersionRepositoryIntegrationTest extends AbstractIntegrationTest {

    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private ProjectRepository projectRepository;
    @Autowired private ProcessDefinitionRepository definitions;
    @Autowired private ProcessVersionRepository versions;
    @Autowired private JdbcTemplate jdbc;

    private User lea;
    private Project project;
    private ProcessDefinition definition;
    private ProcessModel model;

    @BeforeEach
    void seed() {
        lea = userRepository.save(User.builder().keycloakId("kc-lea").email("lea@it.dev").displayName("Lea").isActive(true)
            .build());
        Workspace ws = workspaceRepository.save(Workspace.builder().name("IT").slug("ws-process-it").owner(lea).build());
        project = projectRepository.save(Project.builder().workspace(ws).name("Billing").identifier("BIL").createdBy(lea)
            .build());
        definition = definitions.saveAndFlush(ProcessDefinition.builder().workspace(ws).project(project)
            .processKey("integrate-a-module").createdBy(lea).createdAt(LocalDateTime.now()).build());
        model = new ProcessModel(ProcessModel.FORMAT, "integrate-a-module", "Integrate a module", null, null, List.of(
            new ProcessModel.Step("start", ProcessModel.START, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null)), null);
    }

    private ProcessVersion publish(int number, String name) {
        return versions.saveAndFlush(ProcessVersion.builder().definition(definition).version(number).name(name)
            .model(ProcessJson.toMap(model)).digest(ProcessFingerprint.of(model)).createdBy(lea)
            .createdAt(LocalDateTime.now()).build());
    }

    /** Une écriture que la base refuse, avec ce message ; la transaction du test reste utilisable après. */
    private void refused(String sql, String message, Object... args) {
        jdbc.execute("SAVEPOINT refused");
        try {
            assertThatThrownBy(() -> jdbc.update(sql, args)).as(sql).hasMessageContaining(message);
        } finally {
            jdbc.execute("ROLLBACK TO SAVEPOINT refused");
        }
    }

    @Test
    @DisplayName("le modèle revient de sa colonne JSON avec la même empreinte")
    void the_model_comes_back() {
        ProcessVersion v = publish(1, "Integrate a module");

        ProcessVersion read = versions.findByDefinitionIdAndVersion(definition.getId(), 1).orElseThrow();

        assertThat(ProcessFingerprint.of(ProcessJson.fromMap(read.getModel()))).isEqualTo(v.getDigest());
    }

    @Test
    @DisplayName("changer une version publiée échoue en base : son modèle, son nom, son empreinte, son numéro, sa date")
    void a_published_version_never_changes() {
        ProcessVersion v = publish(1, "Integrate a module");

        for (String change : List.of("name = 'Renamed'", "digest = 'sha256:" + "0".repeat(64) + "'", "version = 5",
            "model = '{}'::jsonb", "created_at = now() - interval '1 day'")) {
            refused("UPDATE process_versions SET " + change + " WHERE id = ?",
                "A published version of a process never changes", v.getId());
        }
    }

    @Test
    @DisplayName("une version ne s'efface pas seule ; elle part avec son projet, et sa définition aussi")
    void a_version_is_never_deleted_on_its_own() {
        ProcessVersion v = publish(1, "Integrate a module");

        refused("DELETE FROM process_versions WHERE id = ?", "is never deleted on its own", v.getId());
        jdbc.update("DELETE FROM projects WHERE id = ?", project.getId());

        assertThat(jdbc.queryForObject("SELECT count(*) FROM process_versions WHERE id = ?", Integer.class, v.getId()))
            .isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM process_definitions WHERE id = ?", Integer.class,
            definition.getId())).isZero();
    }

    @Test
    @DisplayName("l'auteur d'une version peut s'effacer : la version reste, sans lui")
    void the_author_may_go() {
        ProcessVersion v = publish(1, "Integrate a module");

        jdbc.update("UPDATE process_versions SET created_by = NULL WHERE id = ?", v.getId());

        assertThat(jdbc.queryForObject("SELECT created_by FROM process_versions WHERE id = ?", Long.class, v.getId()))
            .isNull();
    }

    @Test
    @DisplayName("une définition garde sa clé ; un numéro de version ne sert qu'une fois ; une clé a sa forme")
    void the_key_stays_and_numbers_are_unique() {
        publish(1, "Integrate a module");

        refused("UPDATE process_definitions SET process_key = 'other' WHERE id = ?",
            "A process keeps its key and its project", definition.getId());
        refused("INSERT INTO process_versions (definition_id, version, name, model, digest) VALUES (?, 1, 'Again', "
            + "'{}'::jsonb, 'sha256:" + "0".repeat(64) + "')", "uq_process_versions_version", definition.getId());
        refused("INSERT INTO process_definitions (workspace_id, project_id, process_key) VALUES (?, ?, 'Not A Key')",
            "ck_process_definitions_key", project.getWorkspace().getId(), project.getId());
        refused("INSERT INTO process_versions (definition_id, version, name, model, digest) VALUES (?, 2, 'Again', "
            + "'{}'::jsonb, 'md5:x')", "ck_process_versions_digest", definition.getId());
    }

    @Test
    @DisplayName("la liste des versions se lit sans les modèles, la plus récente d'abord, avec leur auteur")
    void rows_without_models() {
        publish(1, "Integrate a module");
        publish(2, "Integrate the billing module");

        List<ProcessVersionRepository.Row> rows = versions.listRows(project.getId());

        assertThat(rows).extracting(ProcessVersionRepository.Row::getVersion).containsExactly(2, 1);
        assertThat(rows.get(0).getName()).isEqualTo("Integrate the billing module");
        assertThat(rows.get(0).getAuthorId()).isEqualTo(lea.getId());
        assertThat(rows.get(0).getDefinitionId()).isEqualTo(definition.getId());
        assertThat(versions.findFirstByDefinitionIdOrderByVersionDesc(definition.getId())).get()
            .extracting(ProcessVersion::getVersion).isEqualTo(2);
        assertThat(definitions.findByProjectIdAndProcessKey(project.getId(), "integrate-a-module")).isPresent();
        assertThat(definitions.findByProjectIdOrderByCreatedAtAscIdAsc(project.getId())).hasSize(1);
    }
}
