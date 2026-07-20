package com.taskforce.tf_api.core.dto.request;

import java.util.List;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * Réordonne les cartes du dashboard en une seule requête (drag & drop) : les positions 0..n sont
 * réécrites dans l'ordre de la liste. Les ids inconnus (carte supprimée entre-temps) sont ignorés.
 */
@Data
public class ReorderDashboardCardsRequest {

    @NotNull(message = "La liste des ids est obligatoire")
    private List<Long> orderedIds;
}
