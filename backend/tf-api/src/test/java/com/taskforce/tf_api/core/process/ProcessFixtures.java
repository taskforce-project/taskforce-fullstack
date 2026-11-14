package com.taskforce.tf_api.core.process;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.Set;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.harness.rules.RulesFloor;

/**
 * Ce que les tests des processus partagent : le processus d'E20 tel que le code le publie, les règles que TaskForce
 * tient partout, et le dossier des contrats ({@code ../../contracts} depuis {@code backend/tf-api}, ou
 * {@code -Dcontracts.dir}).
 */
public final class ProcessFixtures {

    public static final String DEFAULT = "integrate-a-module";
    private static final ObjectMapper JSON = new ObjectMapper();

    private ProcessFixtures() {
    }

    /** « Intégrer un module », le premier workflow par défaut, lu de {@code resources/process/defaults}. */
    public static ProcessModel integrateAModule() {
        try (InputStream in = ProcessFixtures.class.getResourceAsStream("/process/defaults/" + DEFAULT + ".json")) {
            return ProcessJson.read(new String(in.readAllBytes(), StandardCharsets.UTF_8));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** Les règles que TaskForce tient partout : sa table et son socle. */
    public static Set<String> taskforceRules() {
        Set<String> ids = new HashSet<>();
        try (InputStream in = ProcessFixtures.class.getResourceAsStream("/harness/default.rules.json")) {
            JsonNode table = JSON.readTree(in);
            table.path("rules").forEach(r -> ids.add(r.path("id").asText()));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        RulesFloor.RULES.forEach(r -> ids.add(r.id()));
        return ids;
    }

    public static Path contracts() {
        return Path.of(System.getProperty("contracts.dir", "../../contracts"));
    }
}
