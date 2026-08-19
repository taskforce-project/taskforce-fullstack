package com.taskforce.tf_api.core.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import com.taskforce.tf_api.shared.exception.BusinessException;

import lombok.extern.slf4j.Slf4j;

/**
 * Client REST vers l'API <b>Plane Cloud</b> (auth par clé : header {@code X-API-Key}).
 *
 * <p>Sert la <b>jambe « observe »</b> de la boucle OODA : on lit les projets et work-items d'un
 * workspace Plane pour les ingérer dans le Brain OS. Lecture seule (aucune écriture côté Plane).
 * Endpoints : {@code /api/v1/workspaces/{ws}/projects/} et {@code …/projects/{id}/work-items/}.
 */
@Component
@Slf4j
public class PlaneClient {

    private final RestTemplate http;

    @Value("${integrations.plane.api-base:https://api.plane.so}")
    private String apiBase;

    /** Garde-fou pagination : au plus N pages de 100 (évite une boucle infinie sur un gros workspace). */
    private static final int MAX_PAGES = 20;
    private static final int PER_PAGE = 100;

    public PlaneClient() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5_000);
        factory.setReadTimeout(30_000);
        this.http = new RestTemplate(factory);
    }

    /** Un projet Plane (id + nom). */
    public record PlaneProject(String id, String name) {}

    /** Un work-item Plane normalisé (champs utiles à l'ingestion). */
    public record PlaneWorkItem(
        String id, String name, String description,
        String priority, String state, Integer sequenceId, String updatedAt
    ) {}

    /** Liste les projets du workspace Plane. Lève {@link BusinessException} si la clé/host est invalide. */
    @SuppressWarnings("unchecked")
    public List<PlaneProject> listProjects(String apiKey, String planeWorkspace) {
        List<PlaneProject> out = new ArrayList<>();
        for (Map<String, Object> row : getPaginated(apiKey,
                base(planeWorkspace) + "/projects/")) {
            out.add(new PlaneProject(str(row.get("id")), str(row.get("name"))));
        }
        return out;
    }

    /** Liste les work-items (issues) d'un projet Plane, normalisés pour l'ingestion. */
    @SuppressWarnings("unchecked")
    public List<PlaneWorkItem> listWorkItems(String apiKey, String planeWorkspace, String projectId) {
        List<PlaneWorkItem> out = new ArrayList<>();
        for (Map<String, Object> row : getPaginated(apiKey,
                base(planeWorkspace) + "/projects/" + projectId + "/work-items/")) {
            out.add(new PlaneWorkItem(
                str(row.get("id")),
                str(row.get("name")),
                firstNonNull(row, "description_stripped", "description", "description_html"),
                str(row.get("priority")),
                stateName(row.get("state")),
                intOrNull(row.get("sequence_id")),
                str(row.get("updated_at"))
            ));
        }
        return out;
    }

    // -------------------------------------------------------------------------

    private String base(String planeWorkspace) {
        return apiBase.replaceAll("/+$", "") + "/api/v1/workspaces/" + planeWorkspace.trim();
    }

    /** Suit la pagination curseur de Plane ({@code results} + {@code next_cursor}) jusqu'à épuisement. */
    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> getPaginated(String apiKey, String url) {
        List<Map<String, Object>> all = new ArrayList<>();
        String cursor = null;
        for (int page = 0; page < MAX_PAGES; page++) {
            String pageUrl = UriComponentsBuilder.fromUriString(url)
                .queryParam("per_page", PER_PAGE)
                .queryParamIfPresent("cursor", java.util.Optional.ofNullable(cursor))
                .build(true).toUriString();
            Map<String, Object> body = get(apiKey, pageUrl);
            Object results = body.get("results");
            if (results instanceof List<?> list) {
                for (Object o : list) if (o instanceof Map<?, ?> m) all.add((Map<String, Object>) m);
            }
            boolean more = Boolean.TRUE.equals(body.get("next_page_results"));
            cursor = str(body.get("next_cursor"));
            if (!more || cursor == null || cursor.isBlank()) break;
        }
        return all;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> get(String apiKey, String url) {
        HttpHeaders headers = new HttpHeaders();
        headers.set("X-API-Key", apiKey);
        headers.set("Accept", "application/json");
        try {
            ResponseEntity<Map<String, Object>> resp = http.exchange(
                url, HttpMethod.GET, new HttpEntity<>(headers),
                new org.springframework.core.ParameterizedTypeReference<Map<String, Object>>() {});
            return resp.getBody() != null ? resp.getBody() : Map.of();
        } catch (Exception ex) {
            log.warn("Appel Plane échoué ({}): {}", url, ex.getMessage());
            throw new BusinessException("Appel à Plane échoué (clé API ou workspace invalide ?)");
        }
    }

    private String stateName(Object state) {
        if (state instanceof Map<?, ?> m) return str(m.get("name"));
        return str(state);
    }

    private String firstNonNull(Map<String, Object> row, String... keys) {
        for (String k : keys) {
            String v = str(row.get(k));
            if (v != null && !v.isBlank()) return v;
        }
        return null;
    }

    private String str(Object o) {
        return o != null ? String.valueOf(o) : null;
    }

    private Integer intOrNull(Object o) {
        return o instanceof Number n ? n.intValue() : null;
    }
}
