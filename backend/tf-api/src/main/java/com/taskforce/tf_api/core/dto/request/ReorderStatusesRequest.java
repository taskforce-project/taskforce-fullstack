package com.taskforce.tf_api.core.dto.request;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * Payload pour réordonner les statuts d'un projet en une seule requête.
 * Envoyé lors du drag & drop d'une colonne kanban.
 *
 * Exemple :
 * { "statuses": [ { "id": 1, "position": 0 }, { "id": 3, "position": 1 }, { "id": 2, "position": 2 } ] }
 */
@Data
public class ReorderStatusesRequest {

    @NotEmpty
    @Valid
    private List<StatusPosition> statuses;

    @Data
    public static class StatusPosition {
        @NotNull
        private Long id;
        @NotNull
        private Short position;
    }
}
