package com.taskforce.tf_api.core.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Path;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * La référence d'API des processus telle qu'elle est publiée ({@code fern/openapi/openapi.json}, régénérée depuis le
 * serveur) : une étape y décrit les étapes qu'elle tient, et la publication ses deux réponses. Le dossier se lit à
 * {@code ../../fern} depuis {@code backend/tf-api}, ou là où {@code -Dfern.dir} l'indique.
 */
@DisplayName("La référence d'API des processus")
class ProcessApiReferenceTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String PUBLICATION = "#/components/schemas/ApiResponseProcessPublication";

    private static JsonNode spec() throws IOException {
        Path fern = Path.of(System.getProperty("fern.dir", "../../fern"));
        return JSON.readTree(fern.resolve("openapi/openapi.json").toFile());
    }

    @Test
    @DisplayName("une étape décrit les étapes qu'elle tient : une phase ses étapes, une zone ses étapes d'agent")
    void a_step_holds_steps() throws IOException {
        JsonNode steps = spec().path("components").path("schemas").path("ProcessStep").path("properties")
            .path("steps");

        assertThat(steps.path("type").asText()).isEqualTo("array");
        assertThat(steps.path("items").path("$ref").asText()).isEqualTo("#/components/schemas/ProcessStep");
    }

    @Test
    @DisplayName("les téléchargements BPMN disent leur type, application/xml")
    void the_bpmn_downloads_say_their_type() throws IOException {
        JsonNode paths = spec().path("paths");
        for (String path : new String[] {"/api/workspaces/{slug}/processes/defaults/{key}/bpmn",
            "/api/workspaces/{slug}/projects/{projectId}/processes/{key}/versions/{version}/bpmn"}) {
            JsonNode content = paths.path(path).path("get").path("responses").path("200").path("content");

            assertThat(content.has("application/xml")).as(path).isTrue();
            assertThat(content.has("*/*")).as(path).isFalse();
        }
    }

    @Test
    @DisplayName("publier répond 201 avec la version, ou 422 avec les refus : jamais 200")
    void publishing_answers_201_or_422() throws IOException {
        JsonNode responses = spec().path("paths").path("/api/workspaces/{slug}/projects/{projectId}/processes")
            .path("post").path("responses");

        assertThat(responses.has("200")).isFalse();
        for (String code : new String[] {"201", "422"}) {
            assertThat(responses.path(code).path("description").asText()).as(code).isNotBlank();
            assertThat(responses.path(code).path("content").findValue("$ref").asText()).as(code)
                .isEqualTo(PUBLICATION);
        }
    }
}
