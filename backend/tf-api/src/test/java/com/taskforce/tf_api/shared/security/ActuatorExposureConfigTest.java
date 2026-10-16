package com.taskforce.tf_api.shared.security;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.config.YamlPropertiesFactoryBean;
import org.springframework.core.io.ClassPathResource;

import java.util.Properties;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Contrat d'exposition de l'actuator (OSS-1.3).
 *
 * <p>En prod, les métriques et Prometheus vivent sur un port de gestion séparé, jamais publié : un hébergeur
 * qui expose le port de l'API (8080) ne les rend pas publiques. Les sondes {@code /livez} et {@code /readyz}
 * restent servies par le port de l'API pour les healthchecks des conteneurs. Le test lit les fichiers de
 * configuration livrés, sans démarrer l'application (qui exigerait Keycloak et MinIO).</p>
 */
class ActuatorExposureConfigTest {

    private static Properties load(String file) {
        YamlPropertiesFactoryBean yaml = new YamlPropertiesFactoryBean();
        yaml.setResources(new ClassPathResource(file));
        return yaml.getObject();
    }

    @ParameterizedTest(name = "{0} : {1} = {2}")
    @CsvSource({
        "application-prod.yml, management.server.port, '${MANAGEMENT_PORT:8081}'",
        "application-prod.yml, management.endpoint.health.show-details, never",
        "application.yml, management.endpoint.health.probes.enabled, true",
        "application.yml, management.endpoint.health.probes.add-additional-paths, true",
    })
    void configurationLivree(String file, String key, String expected) {
        assertThat(String.valueOf(load(file).get(key))).isEqualTo(expected);
    }
}
