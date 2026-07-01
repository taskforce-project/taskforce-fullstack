package com.taskforce.tf_api.util;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import com.taskforce.tf_api.core.repository.WorkspaceRepository;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Vérifie le socle d'intégration (B-T4) : Postgres réel + Flyway applique toutes les migrations,
 * et une requête JPA s'exécute contre le schéma réel.
 * Sert aussi de garde-fou de dérive : {@code ddl-auto=validate} échoue si une entité ne mappe
 * plus le schéma Flyway (validé ici sur les 56 migrations).
 */
@DisplayName("Socle d'intégration (Postgres réel + Flyway)")
class IntegrationSocleTest extends AbstractIntegrationTest {

    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private WorkspaceRepository workspaceRepository;

    @Test
    @DisplayName("Flyway a appliqué les migrations avec succès")
    void flyway_migrations_applied() {
        Integer applied = jdbcTemplate.queryForObject(
            "SELECT count(*) FROM flyway_schema_history WHERE success = true", Integer.class);
        assertThat(applied).isNotNull().isGreaterThan(40);
    }

    @Test
    @DisplayName("l'extension pgvector est disponible")
    void pgvector_extension_present() {
        Integer vector = jdbcTemplate.queryForObject(
            "SELECT count(*) FROM pg_extension WHERE extname = 'vector'", Integer.class);
        assertThat(vector).isEqualTo(1);
    }

    @Test
    @DisplayName("une requête repository s'exécute contre le schéma réel")
    void repository_query_runs() {
        assertThat(workspaceRepository.findBySlug("does-not-exist-" + 42)).isEmpty();
    }
}
