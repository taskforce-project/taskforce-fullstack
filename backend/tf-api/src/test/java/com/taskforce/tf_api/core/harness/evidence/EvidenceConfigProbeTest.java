package com.taskforce.tf_api.core.harness.evidence;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStream;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.yaml.snakeyaml.Yaml;

/**
 * La sonde M3 de la relecture R159 de #551, écrite pour tourner aussi sur le code d'avant le correctif (68964f2d), où elle
 * échoue : par défaut, le serveur signait avec une clé tirée à chaque démarrage. Il garde maintenant sa clé dans un
 * fichier de son volume de données, comme l'app de bureau ; l'app de bureau n'écrit pas de lien dans la pull request (M1).
 */
@DisplayName("La configuration de la clé, sonde M3 de la relecture R159 (#551)")
class EvidenceConfigProbeTest {

    @SuppressWarnings("unchecked")
    private static Map<String, Object> evidence(String profile) throws IOException {
        try (InputStream in = EvidenceConfigProbeTest.class.getResourceAsStream("/application-" + profile + ".yml")) {
            Map<String, Object> yaml = new Yaml().load(in);
            Map<String, Object> delivery = (Map<String, Object>) yaml.get("delivery");
            return (Map<String, Object>) delivery.get("evidence");
        }
    }

    @Test
    @DisplayName("le serveur garde sa clé dans un fichier de son volume de données, par défaut")
    void the_server_keeps_its_key_in_its_data_volume() throws IOException {
        assertThat(String.valueOf(evidence("prod").get("default-key-file"))).contains("/var/lib/taskforce/evidence/signing-key.pem");
    }
}
