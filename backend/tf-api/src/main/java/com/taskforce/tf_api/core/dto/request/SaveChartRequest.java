package com.taskforce.tf_api.core.dto.request;

import java.util.Map;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Épingle un graphe : son titre + sa spec ({@code ChartSpec} du front, en structure JDK pour rester
 * neutre vis-à-vis du sérialiseur). La spec ne contient jamais de données — elles sont recalculées.
 */
@Data
public class SaveChartRequest {

    @NotBlank(message = "The title is required")
    @Size(max = 200, message = "The title can't exceed 200 characters")
    private String title;

    private Map<String, Object> spec;
}
