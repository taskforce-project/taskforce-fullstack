package com.taskforce.tf_api.core.service.agent;

import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.dto.request.SaveChartRequest;
import com.taskforce.tf_api.core.dto.response.SavedChartResponse;
import com.taskforce.tf_api.core.model.SavedChart;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.SavedChartRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;

/**
 * Graphes épinglés (« Custom ») d'un workspace : on persiste la <b>spec</b> (JSON {@code ChartSpec})
 * — jamais les données, recalculées à l'affichage. Portée workspace (visible par tous les membres).
 */
@Service
@RequiredArgsConstructor
public class SavedChartService {

    private final BrainAccessGuard     access;
    private final SavedChartRepository repository;
    private final UserRepository       userRepository;
    private final ObjectMapper         objectMapper;

    @Transactional(readOnly = true)
    public List<SavedChartResponse> list(String slug, Long userId) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        return repository.findByWorkspaceIdOrderByCreatedAtDesc(ws.getId()).stream()
            .map(this::toResponse).toList();
    }

    @Transactional
    public SavedChartResponse save(String slug, Long userId, SaveChartRequest request) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        if (request.getSpec() == null) {
            throw new BusinessException("La spec du graphe est obligatoire");
        }
        SavedChart chart = SavedChart.builder()
            .workspace(ws)
            .title(request.getTitle().trim())
            .specJson(writeJson(request.getSpec()))
            .createdByUser(userRepository.findById(userId).orElse(null))
            .build();
        return toResponse(repository.save(chart));
    }

    @Transactional
    public void delete(String slug, Long userId, Long chartId) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        SavedChart chart = repository.findByIdAndWorkspaceId(chartId, ws.getId())
            .orElseThrow(() -> new ResourceNotFoundException("Graphe épinglé introuvable: " + chartId));
        repository.delete(chart);
    }

    // -------------------------------------------------------------------------

    private SavedChartResponse toResponse(SavedChart chart) {
        return new SavedChartResponse(chart.getId(), chart.getTitle(), readJson(chart.getSpecJson()), chart.getCreatedAt());
    }

    private String writeJson(Map<String, Object> value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception ex) {
            return "{}";
        }
    }

    private Map<String, Object> readJson(String json) {
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {});
        } catch (Exception ex) {
            return Map.of();
        }
    }
}
