package com.taskforce.tf_api.core.service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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
    private final GroqService groqService;
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    @Value("${ai.groq.smart-assign-model:llama-3.1-8b-instant}")
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
            semanticScores = fetchGroqScores(issueText, issue, candidates, metricsByUser);
        } catch (Exception ex) {
            fallbackUsed = true;
            log.warn("Smart assign Groq fallback triggered: {}", ex.getMessage());
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

    /**
     * Envoie l'issue + les candidats pré-filtrés à Groq et récupère un score
     * sémantique (0.0-1.0) pour chaque candidat.
     *
     * Le LLM retourne un JSON de la forme :
     * { "scores": [ { "candidate_id": 42, "score": 0.87, "reason": "..." }, ... ] }
     */
    private Map<Long, Double> fetchGroqScores(String issueText, Issue issue,
                                               List<User> candidates,
                                               Map<Long, CandidateMetrics> metricsByUser) {
        String systemPrompt = """
            You are a project management assistant.
            Given an issue and a list of team members, score each candidate
            on their suitability to be assigned this issue (score between 0.0 and 1.0).
            Consider their skills, current workload, and past performance.
            Respond ONLY with valid JSON in this exact format:
            {"scores":[{"candidate_id":1,"score":0.85,"reason":"Short explanation"},{...}]}
            """;

        StringBuilder userMsg = new StringBuilder();
        userMsg.append("Issue: ").append(issueText).append("\n");
        userMsg.append("Priority: ").append(issue.getPriority()).append("\n\n");
        userMsg.append("Team members:\n");
        for (User u : candidates) {
            CandidateMetrics m = metricsByUser.get(u.getId());
            userMsg.append(String.format(
                "- id:%d name:%s skills:%s openIssues:%d acceptRate:%.0f%%\n",
                u.getId(),
                Objects.toString(u.getDisplayName(), u.getEmail()),
                String.join(",", m.profileSkills()),
                m.openIssues(),
                m.historyStats().acceptedRate() * 100
            ));
        }

        String raw = groqService.chatCompletion(modelName, systemPrompt, userMsg.toString(), true);

        try {
            JsonNode root   = objectMapper.readTree(raw);
            JsonNode scores = root.path("scores");
            Map<Long, Double> result = new LinkedHashMap<>();
            for (JsonNode node : scores) {
                long   candidateId = node.path("candidate_id").asLong();
                double score       = node.path("score").asDouble(0.0);
                result.put(candidateId, Math.min(1.0, Math.max(0.0, score)));
            }
            return result;
        } catch (Exception ex) {
            log.warn("Cannot parse Groq scores response: {}", ex.getMessage());
            return Collections.emptyMap();
        }
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
                // semanticScores contient le score Groq qui intègre déjà sémantique + historique
                int semantic = toScore(semanticScores.getOrDefault(u.getId(), 0.0));

                int finalScore = clamp(
                    (int) Math.round(
                        semantic    * 0.55
                            + m.workloadScore()  * 0.25
                            + m.availability()   * 0.15
                            + m.labelScore()     * 0.05
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
