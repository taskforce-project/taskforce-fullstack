package com.taskforce.tf_api.core.service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.dto.response.SmartAssignCandidateResponse;
import com.taskforce.tf_api.core.dto.response.SmartAssignResponse;
import com.taskforce.tf_api.core.enums.IssueStatusCategory;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.ProjectMember;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.ProjectMemberRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@Slf4j
public class SmartAssignService {

    private static final String FEATURE_NAME = "smart_assign";

    private final WorkspaceRepository workspaceRepository;
    private final WorkspaceMemberRepository workspaceMemberRepository;
    private final ProjectRepository projectRepository;
    private final ProjectMemberRepository projectMemberRepository;
    private final IssueRepository issueRepository;
    private final RestTemplate restTemplate;
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    @Value("${ai.service-url:http://localhost:8000}")
    private String aiServiceUrl;

    @Value("${ai.groq.model:llama-3.1-8b-instant}")
    private String modelName;

    @Transactional(readOnly = true)
    public SmartAssignResponse recommend(String workspaceSlug, Long projectId, Long issueId, Long requestingUserId) {
        Workspace workspace = workspaceRepository.findBySlug(workspaceSlug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace introuvable"));
        assertWorkspaceMember(workspace.getId(), requestingUserId);

        Project project = projectRepository.findById(projectId)
            .filter(p -> p.getWorkspace().getId().equals(workspace.getId()))
            .orElseThrow(() -> new ResourceNotFoundException("Projet introuvable"));

        Issue issue = issueRepository.findById(issueId)
            .filter(i -> i.getProject().getId().equals(project.getId()))
            .orElseThrow(() -> new ResourceNotFoundException("Issue introuvable"));

        List<User> candidates = resolveCandidates(workspace, project);
        if (candidates.isEmpty()) {
            return SmartAssignResponse.builder()
                .recommended(null)
                .alternatives(List.of())
                .strategy("no-candidate")
                .fallbackUsed(true)
                .build();
        }

        List<String> issueLabels = issue.getLabels().stream()
            .map(l -> l.getName().toLowerCase())
            .toList();

        String issueText = buildIssueText(issue, issueLabels);
        Map<Long, CandidateMetrics> metricsByUser = buildCandidateMetrics(project.getId(), workspace.getId(), issueLabels, candidates);

        Map<Long, Double> semanticScores = Collections.emptyMap();
        Map<Long, Double> historicalScores = Collections.emptyMap();
        boolean fallbackUsed = false;

        try {
            semanticScores = fetchSemanticScores(issueText, candidates, metricsByUser);
            historicalScores = fetchHistoricalScores(candidates, metricsByUser);
        } catch (Exception ex) {
            fallbackUsed = true;
            log.warn("Smart assign AI fallback triggered: {}", ex.getMessage());
        }

        List<SmartAssignCandidateResponse> ranked = rankCandidates(candidates, metricsByUser, semanticScores, historicalScores);
        SmartAssignCandidateResponse recommended = ranked.isEmpty() ? null : ranked.getFirst();
        List<SmartAssignCandidateResponse> alternatives = ranked.size() <= 1
            ? List.of()
            : ranked.subList(1, Math.min(ranked.size(), 5));

        logAiRun(workspace.getId(), fallbackUsed, ranked.size());
        if (recommended != null) {
            logAssignmentEvent(workspace.getId(), issue.getId(), recommended.getUserId(), requestingUserId, recommended);
        }

        return SmartAssignResponse.builder()
            .recommended(recommended)
            .alternatives(alternatives)
            .strategy(fallbackUsed ? "java-fallback" : "java-rules + ai-semantic + ai-history")
            .fallbackUsed(fallbackUsed)
            .build();
    }

    private void assertWorkspaceMember(Long workspaceId, Long userId) {
        if (!workspaceMemberRepository.existsByWorkspaceIdAndUserId(workspaceId, userId)) {
            throw new ResourceNotFoundException("Accès refusé au workspace");
        }
    }

    private List<User> resolveCandidates(Workspace workspace, Project project) {
        if (project.isPublic()) {
            return workspaceMemberRepository.findByWorkspaceId(workspace.getId()).stream()
                .map(WorkspaceMember::getUser)
                .filter(u -> Boolean.TRUE.equals(u.getIsActive()))
                .toList();
        }
        return projectMemberRepository.findByProjectId(project.getId()).stream()
            .map(ProjectMember::getUser)
            .filter(u -> Boolean.TRUE.equals(u.getIsActive()))
            .toList();
    }

    private String buildIssueText(Issue issue, List<String> labels) {
        StringBuilder sb = new StringBuilder();
        sb.append(Objects.toString(issue.getTitle(), ""));
        sb.append(" ");
        sb.append(Objects.toString(issue.getDescription(), ""));
        if (!labels.isEmpty()) {
            sb.append(" labels: ").append(String.join(", ", labels));
        }
        return sb.toString().trim();
    }

    private Map<Long, CandidateMetrics> buildCandidateMetrics(Long projectId, Long workspaceId, List<String> issueLabels, List<User> candidates) {
        Map<Long, CandidateMetrics> result = new LinkedHashMap<>();
        for (User candidate : candidates) {
            List<Issue> candidateIssues = issueRepository.findByProjectIdAndAssigneeIdOrderBySequenceNumberDesc(projectId, candidate.getId());
            int openIssues = (int) candidateIssues.stream()
                .filter(i -> i.getStatus().getCategory() != IssueStatusCategory.COMPLETED
                    && i.getStatus().getCategory() != IssueStatusCategory.CANCELLED)
                .count();

            int availability = Math.max(0, 100 - openIssues * 12);
            int workloadScore = Math.max(0, 100 - openIssues * 10);

            List<String> profileSkills = fetchProfileSkills(workspaceId, candidate.getId());
            int labelMatches = (int) issueLabels.stream().filter(profileSkills::contains).count();
            int labelScore = issueLabels.isEmpty() ? 50 : Math.min(100, labelMatches * 35);

            HistoryStats historyStats = fetchHistoryStats(workspaceId, candidate.getId());
            CandidateMetrics metrics = new CandidateMetrics(
                openIssues,
                availability,
                workloadScore,
                labelMatches,
                labelScore,
                profileSkills,
                historyStats
            );
            result.put(candidate.getId(), metrics);
        }
        return result;
    }

    private List<String> fetchProfileSkills(Long workspaceId, Long userId) {
        List<String> rows = jdbcTemplate.query(
            """
            SELECT skills_json::text
            FROM member_skill_profiles
            WHERE workspace_id = ? AND user_id = ?
            """,
            (rs, rowNum) -> rs.getString(1),
            workspaceId,
            userId
        );

        if (rows.isEmpty()) {
            return List.of();
        }

        try {
            JsonNode root = objectMapper.readTree(rows.getFirst());
            List<String> skills = new ArrayList<>();
            if (root.isArray()) {
                root.forEach(n -> skills.add(n.asText().toLowerCase()));
            } else if (root.isObject()) {
                root.fieldNames().forEachRemaining(name -> skills.add(name.toLowerCase()));
            }
            return skills;
        } catch (Exception ex) {
            log.debug("Unable to parse member_skill_profiles.skills_json for user {}: {}", userId, ex.getMessage());
            return List.of();
        }
    }

    private HistoryStats fetchHistoryStats(Long workspaceId, Long userId) {
        List<HistoryStats> rows = jdbcTemplate.query(
            """
            SELECT
                COUNT(*)::int AS total,
                COALESCE(AVG(CASE WHEN accepted IS TRUE THEN 1.0 ELSE 0.0 END), 0.0) AS accepted_rate,
                COALESCE(AVG(CASE WHEN resolved_successfully IS TRUE THEN 1.0 ELSE 0.0 END), 0.0) AS resolved_rate
            FROM assignment_events
            WHERE workspace_id = ? AND assignee_user_id = ?
            """,
            (rs, rowNum) -> new HistoryStats(
                rs.getInt("total"),
                rs.getDouble("accepted_rate"),
                rs.getDouble("resolved_rate")
            ),
            workspaceId,
            userId
        );
        return rows.isEmpty() ? new HistoryStats(0, 0.0, 0.0) : rows.getFirst();
    }

    @SuppressWarnings("unchecked")
    private Map<Long, Double> fetchSemanticScores(String issueText, List<User> candidates, Map<Long, CandidateMetrics> metricsByUser) {
        List<Map<String, Object>> payloadCandidates = candidates.stream()
            .map(u -> {
                CandidateMetrics m = metricsByUser.get(u.getId());
                String candidateText = String.format(
                    "%s %s skills:%s",
                    Objects.toString(u.getDisplayName(), u.getEmail()),
                    u.getEmail(),
                    String.join(",", m.profileSkills())
                );
                return Map.<String, Object>of(
                    "candidate_id", u.getId(),
                    "text", candidateText
                );
            })
            .toList();

        Map<String, Object> payload = Map.of(
            "issue_text", issueText,
            "candidates", payloadCandidates
        );

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, Object>> request = new HttpEntity<>(payload, headers);

        Map<String, Object> response = restTemplate.postForObject(
            aiServiceUrl + "/v1/smart-assign/semantic-score",
            request,
            Map.class
        );

        if (response == null || !response.containsKey("scores")) {
            return Collections.emptyMap();
        }

        List<Map<String, Object>> scores = (List<Map<String, Object>>) response.get("scores");
        return scores.stream().collect(Collectors.toMap(
            s -> Long.valueOf(String.valueOf(s.get("candidate_id"))),
            s -> Double.valueOf(String.valueOf(s.get("score"))),
            (a, b) -> a
        ));
    }

    @SuppressWarnings("unchecked")
    private Map<Long, Double> fetchHistoricalScores(List<User> candidates, Map<Long, CandidateMetrics> metricsByUser) {
        List<Map<String, Object>> payloadCandidates = candidates.stream()
            .map(u -> {
                CandidateMetrics m = metricsByUser.get(u.getId());
                return Map.<String, Object>of(
                    "candidate_id", u.getId(),
                    "features", Map.of(
                        "past_assignments", m.historyStats().totalAssignments(),
                        "accepted_rate", m.historyStats().acceptedRate(),
                        "resolved_rate", m.historyStats().resolvedRate(),
                        "workload_score", m.workloadScore(),
                        "availability", m.availability(),
                        "label_match_score", m.labelScore()
                    )
                );
            })
            .toList();

        Map<String, Object> payload = Map.of("candidates", payloadCandidates);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, Object>> request = new HttpEntity<>(payload, headers);

        Map<String, Object> response = restTemplate.postForObject(
            aiServiceUrl + "/v1/smart-assign/history-rank",
            request,
            Map.class
        );

        if (response == null || !response.containsKey("scores")) {
            return Collections.emptyMap();
        }

        List<Map<String, Object>> scores = (List<Map<String, Object>>) response.get("scores");
        return scores.stream().collect(Collectors.toMap(
            s -> Long.valueOf(String.valueOf(s.get("candidate_id"))),
            s -> Double.valueOf(String.valueOf(s.get("score"))),
            (a, b) -> a
        ));
    }

    private List<SmartAssignCandidateResponse> rankCandidates(
        List<User> candidates,
        Map<Long, CandidateMetrics> metricsByUser,
        Map<Long, Double> semanticScores,
        Map<Long, Double> historicalScores
    ) {
        return candidates.stream()
            .map(u -> {
                CandidateMetrics m = metricsByUser.get(u.getId());
                int semantic = toScore(semanticScores.getOrDefault(u.getId(), 0.0));
                int historical = toScore(historicalScores.getOrDefault(u.getId(), 0.0));

                int finalScore = clamp(
                    (int) Math.round(
                        semantic * 0.45
                            + m.workloadScore() * 0.2
                            + m.availability() * 0.15
                            + m.labelScore() * 0.1
                            + historical * 0.1
                    )
                );

                List<String> factors = new ArrayList<>();
                if (m.labelMatchCount() > 0) {
                    factors.add(m.labelMatchCount() + " label match" + (m.labelMatchCount() > 1 ? "es" : ""));
                }
                if (m.availability() >= 70) {
                    factors.add("High availability");
                }
                if (m.openIssues() <= 2) {
                    factors.add("Low workload");
                }
                if (historical >= 65) {
                    factors.add("Strong delivery history");
                }

                return SmartAssignCandidateResponse.builder()
                    .userId(u.getId())
                    .email(u.getEmail())
                    .displayName(u.getDisplayName())
                    .avatarUrl(u.getAvatarUrl())
                    .score(finalScore)
                    .semanticScore(semantic)
                    .historicalScore(historical)
                    .workloadScore(m.workloadScore())
                    .availability(m.availability())
                    .openIssues(m.openIssues())
                    .labelMatchCount(m.labelMatchCount())
                    .factors(factors)
                    .build();
            })
            .sorted((a, b) -> Integer.compare(b.getScore(), a.getScore()))
            .limit(5)
            .toList();
    }

    private int clamp(int score) {
        return Math.max(0, Math.min(100, score));
    }

    private int toScore(double value) {
        return clamp((int) Math.round(value * 100.0));
    }

    private void logAiRun(Long workspaceId, boolean fallbackUsed, int candidateCount) {
        Map<String, Object> meta = new HashMap<>();
        meta.put("candidateCount", candidateCount);
        meta.put("fallbackUsed", fallbackUsed);

        try {
            jdbcTemplate.update(
                """
                INSERT INTO ai_runs
                    (workspace_id, feature_name, provider, model_name, latency_ms, status, fallback_used, request_hash, meta_json)
                VALUES
                    (?, ?, ?, ?, ?, ?, ?, md5(random()::text || clock_timestamp()::text), ?::jsonb)
                """,
                workspaceId,
                FEATURE_NAME,
                "internal-ai-service",
                modelName,
                null,
                fallbackUsed ? "FALLBACK" : "SUCCESS",
                fallbackUsed,
                toJson(meta)
            );
        } catch (Exception ex) {
            log.warn("Unable to persist ai_runs for smart assign: {}", ex.getMessage());
        }
    }

    private void logAssignmentEvent(Long workspaceId, Long issueId, Long assigneeUserId, Long assignedByUserId,
                                    SmartAssignCandidateResponse candidate) {
        Map<String, Object> features = new HashMap<>();
        features.put("score", candidate.getScore());
        features.put("semanticScore", candidate.getSemanticScore());
        features.put("historicalScore", candidate.getHistoricalScore());
        features.put("workloadScore", candidate.getWorkloadScore());
        features.put("availability", candidate.getAvailability());
        features.put("labelMatchCount", candidate.getLabelMatchCount());

        try {
            jdbcTemplate.update(
                """
                INSERT INTO assignment_events
                    (workspace_id, issue_id, assignee_user_id, assigned_by_user_id, decision_source, accepted, resolved_successfully, features_json)
                VALUES
                    (?, ?, ?, ?, 'SMART_ASSIGN', NULL, NULL, ?::jsonb)
                """,
                workspaceId,
                issueId,
                assigneeUserId,
                assignedByUserId,
                toJson(features)
            );
        } catch (Exception ex) {
            log.warn("Unable to persist assignment_events for smart assign: {}", ex.getMessage());
        }
    }

    private String toJson(Map<String, Object> value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception ex) {
            return "{}";
        }
    }

    private record HistoryStats(int totalAssignments, double acceptedRate, double resolvedRate) {}

    private record CandidateMetrics(
        int openIssues,
        int availability,
        int workloadScore,
        int labelMatchCount,
        int labelScore,
        List<String> profileSkills,
        HistoryStats historyStats
    ) {}
}
