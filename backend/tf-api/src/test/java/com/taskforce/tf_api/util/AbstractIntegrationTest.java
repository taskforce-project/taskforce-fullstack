package com.taskforce.tf_api.util;

import org.springframework.boot.autoconfigure.ImportAutoConfiguration;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.flyway.autoconfigure.FlywayAutoConfiguration;
import org.springframework.boot.jdbc.autoconfigure.JdbcTemplateAutoConfiguration;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.test.context.ActiveProfiles;

/**
 * Socle des tests d'intégration DB (B-T4).
 *
 * <p>S'exécute contre un <b>vrai Postgres</b> (image {@code pgvector/pgvector} — les migrations
 * utilisent l'extension {@code vector} + {@code uuid-ossp}), applique <b>toutes les migrations
 * Flyway</b>, puis laisse Hibernate <b>valider</b> le mapping entités↔schéma
 * ({@code ddl-auto=validate}, comme en prod). On charge volontairement une tranche minimale
 * ({@link DataJpaTest} : JPA + repositories + Flyway) — <b>aucun client externe</b>
 * (Keycloak/Stripe/MinIO/SMTP), ce qui évite les échecs de context-load.</p>
 *
 * <p>{@link ImportAutoConfiguration} (et non {@code @Import}) réintègre Flyway + JdbcTemplate dans
 * la tranche {@code @DataJpaTest} : c'est indispensable pour que Flyway soit traité comme une
 * <b>auto-configuration</b> (ordering + post-processor faisant dépendre l'{@code EntityManagerFactory}
 * de la migration). Avec un simple {@code @Import}, Hibernate valide <i>avant</i> Flyway → échec sur
 * DB vide.</p>
 *
 * <p><b>Environnement d'exécution</b> — la datasource vient des variables d'env
 * {@code SPRING_DATASOURCE_URL/USERNAME/PASSWORD} ({@code application-it.yml}). Faute de JDK local,
 * on lance un Postgres <i>sibling</i> sur un réseau Docker partagé + le conteneur Maven sur le même
 * réseau (cf. {@code scripts/it.ps1}). <b>Pourquoi pas Testcontainers ?</b> son docker-java embarqué
 * (TC 1.20.x) est incompatible avec le proxy Docker Desktop 29 <i>depuis un conteneur</i> (HTTP 400).
 * Le résultat est équivalent (vrai PG + vrai Flyway) ; on rebranchera {@code @Testcontainers} le jour
 * où les tests tournent sur un JDK hôte.</p>
 *
 * <p>Chaque test s'exécute dans une transaction rollbackée par {@code @DataJpaTest}.</p>
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ImportAutoConfiguration({FlywayAutoConfiguration.class, JdbcTemplateAutoConfiguration.class})
@ActiveProfiles("it")
public abstract class AbstractIntegrationTest {
}
