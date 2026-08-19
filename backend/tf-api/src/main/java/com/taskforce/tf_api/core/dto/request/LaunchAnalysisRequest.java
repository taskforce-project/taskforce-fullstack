package com.taskforce.tf_api.core.dto.request;

import com.taskforce.tf_api.core.enums.AnalysisDepth;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

/** Lance un workflow d'analyse sur un projet. */
@Data
public class LaunchAnalysisRequest {

    @NotNull(message = "Le projet est obligatoire")
    private Long projectId;

    /** QUICK par défaut ; DEEP active le raisonnement long et la clarification (HITL). */
    private AnalysisDepth depth = AnalysisDepth.QUICK;
}
