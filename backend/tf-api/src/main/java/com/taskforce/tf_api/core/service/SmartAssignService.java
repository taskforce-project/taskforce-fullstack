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
import com.taskforce.tf_api.core.dto.request.SmartAssignPreviewRequest;
import com.taskforce.tf_api.core.dto.response.BulkSmartAssignItemResponse;
import com.taskforce.tf_api.core.dto.response.SmartAssignCandidateResponse;
import com.taskforce.tf_api.core.dto.response.SmartAssignResponse;
import com.taskforce.tf_api.core.enums.IssuePriority;
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
    /** Points attribués à une tâche non estimée (calibré pour reproduire le scoring basé sur le nombre). */
    private static final int DEFAULT_STORY_POINTS = 3;

    private final WorkspaceRepository workspaceRepository;
    private final WorkspaceMemberRepository workspaceMemberRepository;
    private final ProjectRepository projectRepository;
    private final ProjectMemberRepository projectMemberRepository;
    private final IssueRepository issueRepository;
    private final LlmClient llm; // via l'AI Gateway → Qwen local (Groq était bloqué → fallback permanent)
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final AiMeter aiMeter; // gate quota + capture/enregistrement de la conso tokens du scoring LLM

    @Value("${ai.groq.smart-assign-model:llama-3.1-8b-instant}")
    private String modelName;

    // NB: read-write (PAS readOnly) — la méthode écrit ai_runs + assignment_events.
    // Sous readOnly, l'INSERT échouait (SQLSTATE 25006) et l'historique n'était jamais persisté.
    @Transactional
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

        List<String> issueLabels = issue.getLabels().stream()
            .map(l -> l.getName().toLowerCase())
            .toList();
        String issueText = buildIssueText(issue, issueLabels);

        SmartAssignResponse response = computeRecommendation(
            workspace, project, issueText, issueLabels, issue.getPriority(), issue.getStoryPoints(), true);

        SmartAssignCandidateResponse recommended = response.getRecommended();
        if (recommended != null) {
            logAssignmentEvent(workspace.getId(), issue.getId(), recommended.getUserId(), requestingUserId, recommended);
        }
        return response;
    }

    /**
     * Recommandation à la <b>création</b> d'une issue (dry-run) : l'issue n'existe pas encore,
     * on score les candidats à partir d'un brouillon (titre/description/labels/priorité).
     * Ne persiste aucun {@code assignment_events} (pas d'issue à référencer).
     */
    // read-write : computeRecommendation écrit ai_runs (logAiRun).
    @Transactional
    public SmartAssignResponse preview(String workspaceSlug, Long projectId,
                                       Long requestingUserId, SmartAssignPreviewRequest request) {
        Workspace workspace = workspaceRepository.findBySlug(workspaceSlug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace introuvable"));
        assertWorkspaceMember(workspace.getId(), requestingUserId);

        Project project = projectRepository.findById(projectId)
            .filter(p -> p.getWorkspace().getId().equals(workspace.getId()))
            .orElseThrow(() -> new ResourceNotFoundException("Projet introuvable"));

        List<String> issueLabels = request.getLabels() == null ? List.of()
            : request.getLabels().stream()
                .filter(Objects::nonNull)
                .map(l -> l.trim().toLowerCase())
                .filter(l -> !l.isEmpty())
                .distinct()
                .toList();

        IssuePriority priority = request.getPriority() != null ? request.getPriority() : IssuePriority.NONE;
        String issueText = buildText(request.getTitle(), request.getDescription(), issueLabels);

        return computeRecommendation(workspace, project, issueText, issueLabels, priority, null, true);
    }

    /**
     * Recommandation Smart Assign <b>en lot</b> (multi-assign) : pour chaque issue (typiquement
     * non assignée), renvoie le meilleur candidat. Réutilise {@link #computeRecommendation}.
     */
    @Transactional
    public List<BulkSmartAssignItemResponse> bulkRecommend(String workspaceSlug, Long projectId,
                                                           Long requestingUserId, List<Long> issueIds) {
        Workspace workspace = workspaceRepository.findBySlug(workspaceSlug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace introuvable"));
        assertWorkspaceMember(workspace.getId(), requestingUserId);

        Project project = projectRepository.findById(projectId)
            .filter(p -> p.getWorkspace().getId().equals(workspace.getId()))
            .orElseThrow(() -> new ResourceNotFoundException("Projet introuvable"));

        if (issueIds == null || issueIds.isEmpty()) {
            return List.of();
        }

        List<BulkSmartAssignItemResponse> results = new ArrayList<>();
        for (Long issueId : issueIds) {
            Issue issue = issueRepository.findById(issueId)
                .filter(i -> i.getProject().getId().equals(project.getId()))
                .orElse(null);
            if (issue == null) {
                continue;
            }
            List<String> labels = issue.getLabels().stream()
                .map(l -> l.getName().toLowerCase())
                .toList();
            SmartAssignResponse rec = computeRecommendation(
                workspace, project, buildIssueText(issue, labels), labels, issue.getPriority(), issue.getStoryPoints(), true);
            results.add(BulkSmartAssignItemResponse.builder()
                .issueId(issueId)
                .recommended(rec.getRecommended())
                .build());
        }
        return results;
    }

    /**
     * Classe les candidats pour une issue <b>existante</b> dans le cadre d'une redistribution (PROD-1.12).
     * Renvoie le meilleur candidat + alternatives, <b>sans persister d'{@code assignment_events}</b>
     * (c'est un preview ; seul un {@code ai_runs} est tracé par {@link #computeRecommendation}).
     *
     * <p>L'autorisation est à la charge de l'appelant : {@code RedistributionService} vérifie le rôle
     * manager (OWNER/ADMIN) avant d'invoquer cette méthode. Prend les entités déjà résolues pour
     * éviter une re-résolution workspace/projet.</p>
     */
    public SmartAssignResponse rankForRedistribution(Workspace workspace, Project project, Issue issue) {
        List<String> labels = issue.getLabels().stream()
            .map(l -> l.getName().toLowerCase())
            .toList();
        // Redistribution : ranking HEURISTIQUE (sans LLM) → rapide, pas d'appel IA par issue.
        return computeRecommendation(
            workspace, project, buildIssueText(issue, labels), labels, issue.getPriority(), issue.getStoryPoints(), false);
    }

    /**
     * Cœur partagé entre {@link #recommend} et {@link #preview} :
     * pré-filtre Java + scoring Groq (avec repli) + classement. Persiste un {@code ai_runs}.
     */
    private SmartAssignResponse computeRecommendation(Workspace workspace, Project project,
                                                      String issueText, List<String> issueLabels,
                                                      IssuePriority priority, Integer issueStoryPoints,
                                                      boolean useAi) {
        List<User> candidates = resolveCandidates(workspace, project);
        if (candidates.isEmpty()) {
            return SmartAssignResponse.builder()
                .recommended(null)
                .alternatives(List.of())
                .strategy("no-candidate")
                .fallbackUsed(true)
                .build();
        }

        Map<Long, CandidateMetrics> metricsByUser =
            buildCandidateMetrics(workspace, issueLabels, candidates, issueStoryPoints, priority, project.isGrowthMode());

        GroqResult groq = GroqResult.empty();
        boolean fallbackUsed = false;
        // `useAi=false` (redistribution) : on saute le LLM et on classe au heuristique Java pur —
        // sinon, un appel LLM par issue rendait la redistribution très lente (LLM local) → timeout.
        if (useAi) {
            try {
                // Métré : gate quota (au-dessus du plafond → repli heuristique, aucun token brûlé) + comptage réel.
                groq = aiMeter.metered(workspace.getId(),
                    () -> fetchGroqScores(issueText, priority, candidates, metricsByUser));
            } catch (Exception ex) {
                fallbackUsed = true;
                log.warn("Smart assign Groq fallback triggered: {}", ex.getMessage());
            }
        }

        List<SmartAssignCandidateResponse> ranked =
            rankCandidates(candidates, metricsByUser, groq.scores(), groq.reasons());
        SmartAssignCandidateResponse recommended = ranked.isEmpty() ? null : ranked.getFirst();
        List<SmartAssignCandidateResponse> alternatives = ranked.size() <= 1
            ? List.of()
            : ranked.subList(1, Math.min(ranked.size(), 5));

        logAiRun(workspace.getId(), fallbackUsed, ranked.size());

        return SmartAssignResponse.builder()
            .recommended(recommended)
            .alternatives(alternatives)
            .strategy(!useAi ? "java-rules (heuristique, sans IA)"
                : fallbackUsed ? "java-fallback" : "java-rules + ai-semantic + ai-history")
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
        return buildText(issue.getTitle(), issue.getDescription(), labels);
    }

    private String buildText(String title, String description, List<String> labels) {
        StringBuilder sb = new StringBuilder();
        sb.append(Objects.toString(title, ""));
        sb.append(" ");
        sb.append(Objects.toString(description, ""));
        if (labels != null && !labels.isEmpty()) {
            sb.append(" labels: ").append(String.join(", ", labels));
        }
        return sb.toString().trim();
    }

    private Map<Long, CandidateMetrics> buildCandidateMetrics(Workspace workspace, List<String> issueLabels, List<User> candidates,
                                                              Integer issueStoryPoints, IssuePriority priority, boolean growthMode) {
        Long workspaceId = workspace.getId();
        Map<Long, CandidateMetrics> result = new LinkedHashMap<>();
        for (User candidate : candidates) {
            // Charge CROSS-PROJETS (PROD-1.8) : on compte la charge réelle du candidat sur tout le
            // workspace, pas seulement le projet courant — un membre surchargé ailleurs reste surchargé.
            List<Issue> candidateIssues = issueRepository.findByWorkspaceSlugAndAssigneeId(workspace.getSlug(), candidate.getId());
            List<Issue> openList = candidateIssues.stream()
                .filter(i -> i.getStatus().getCategory() != IssueStatusCategory.COMPLETED
                    && i.getStatus().getCategory() != IssueStatusCategory.CANCELLED)
                .toList();
            int openIssues = openList.size();

            // Charge pondérée par la TAILLE des tâches (story points), pas seulement leur nombre.
            // Défaut 3 pts si non estimée → reproduit exactement l'ancien comportement basé sur le
            // nombre (multiplicateurs 4 et 10/3) ; affine dès que les tâches sont estimées. Cf. PROD-1.8.
            int openPoints = openList.stream()
                .mapToInt(i -> {
                    Integer sp = i.getStoryPoints();
                    return (sp != null && sp > 0) ? sp : DEFAULT_STORY_POINTS;
                })
                .sum();

            // Capacité déclarée (PROD-1.8 Phase 2) : 40h/sem = référence (facteur 4).
            // Plus de capacité → la charge pèse moins sur la disponibilité ; moins → elle pèse plus.
            ProfileExtras extras = fetchProfileExtras(workspaceId, candidate.getId());
            int loadFactor = 4;
            if (extras.capacityHours() != null && extras.capacityHours() > 0) {
                loadFactor = Math.max(1, Math.round(4f * 40f / extras.capacityHours()));
            }
            int availability = Math.max(0, 100 - openPoints * loadFactor);
            int workloadScore = Math.max(0, 100 - (openPoints * 10) / 3);

            List<String> profileSkills = fetchProfileSkills(workspaceId, candidate.getId());
            List<String> matchedSkills = issueLabels.stream()
                .filter(profileSkills::contains)
                .distinct()
                .toList();
            int labelMatches = matchedSkills.size();
            int labelScore = issueLabels.isEmpty() ? 50 : Math.min(100, labelMatches * 35);

            HistoryStats historyStats = fetchHistoryStats(workspaceId, candidate.getId());
            int targetMatches = (int) issueLabels.stream().filter(extras.targetSkills()::contains).distinct().count();
            int growthScore = computeGrowthScore(growthMode, issueStoryPoints, priority,
                availability, labelMatches, targetMatches, extras.growthEnabled(), workspaceId, candidate.getId());
            CandidateMetrics metrics = new CandidateMetrics(
                openIssues,
                availability,
                workloadScore,
                labelMatches,
                labelScore,
                profileSkills,
                matchedSkills,
                historyStats,
                extras.capacityHours(),
                extras.seniority(),
                growthScore,
                extras.targetSkills()
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

    private ProfileExtras fetchProfileExtras(Long workspaceId, Long userId) {
        List<ProfileExtras> rows = jdbcTemplate.query(
            """
            SELECT capacity_hours_per_week, seniority,
                   growth_enabled, growth_target_skills::text AS growth_target_skills
            FROM member_skill_profiles
            WHERE workspace_id = ? AND user_id = ?
            """,
            (rs, rowNum) -> new ProfileExtras(
                rs.getObject("capacity_hours_per_week", Integer.class),
                rs.getString("seniority"),
                rs.getBoolean("growth_enabled"),
                parseJsonStringArray(rs.getString("growth_target_skills"))
            ),
            workspaceId,
            userId
        );
        return rows.isEmpty() ? new ProfileExtras(null, null, false, List.of()) : rows.getFirst();
    }

    /** Parse un tableau JSON de tags en liste minuscule (target skills). */
    private List<String> parseJsonStringArray(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            JsonNode root = objectMapper.readTree(json);
            List<String> out = new ArrayList<>();
            if (root.isArray()) {
                root.forEach(n -> out.add(n.asText().toLowerCase()));
            }
            return out;
        } catch (Exception ex) {
            return List.of();
        }
    }

    /**
     * Score « montée en compétence » (PROD-1.8 Phase 3). Renvoie 0 sauf si TOUS les garde-fous passent :
     * mode growth activé · issue estimée · pas URGENT · marge de capacité · adjacence compétence ·
     * complexité 1 à 3 points au-dessus de l'habituel du candidat (stretch, pas saut).
     */
    private int computeGrowthScore(boolean growthMode, Integer issueStoryPoints, IssuePriority priority,
                                   int availability, int labelMatches, int targetMatches, boolean growthEnabled,
                                   Long workspaceId, Long userId) {
        if (!growthMode) return 0;
        if (issueStoryPoints == null || issueStoryPoints <= 0) return 0;
        if (priority == IssuePriority.URGENT) return 0;   // jamais de stretch sur l'urgent
        if (availability < 60) return 0;                  // besoin de marge

        // Adjacence compétence (Inc C) : un membre « en développement » ne progresse que vers ses
        // compétences cibles ; sinon (mode projet seul, auto) on retombe sur l'adjacence générique.
        int score;
        if (growthEnabled) {
            if (targetMatches < 1) return 0;
            score = 100;                                  // growth intentionnel, ciblé
        } else {
            if (labelMatches < 1) return 0;
            score = 80;                                   // growth auto (mode projet)
        }

        double usual = fetchUsualComplexity(workspaceId, userId);
        if (issueStoryPoints >= usual + 1 && issueStoryPoints <= usual + 3) {
            return score;
        }
        return 0;
    }

    /** Complexité « habituelle » = moyenne des story points des issues complétées du candidat (0 si aucune). */
    private double fetchUsualComplexity(Long workspaceId, Long userId) {
        Double avg = jdbcTemplate.queryForObject(
            """
            SELECT COALESCE(AVG(i.story_points), 0)
            FROM issues i
            JOIN projects p        ON p.id = i.project_id
            JOIN issue_statuses s  ON s.id = i.status_id
            WHERE p.workspace_id = ? AND i.assignee_id = ?
              AND i.story_points IS NOT NULL
              AND s.category::text = 'COMPLETED'
            """,
            Double.class,
            workspaceId,
            userId
        );
        return avg != null ? avg : 0.0;
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
    private GroqResult fetchGroqScores(String issueText, IssuePriority priority,
                                       List<User> candidates,
                                       Map<Long, CandidateMetrics> metricsByUser) {
        String systemPrompt = """
            You are a project management assistant.
            Given an issue and a list of team members, score each candidate
            on their suitability to be assigned this issue (score between 0.0 and 1.0).
            Consider their skills, current workload, and past performance.
            Some candidates are flagged growthStretch:yes — this issue is a healthy "stretch"
            slightly above their usual complexity and matches a skill they are growing toward
            (see targets). When that is the case, you may modestly favor giving them the learning
            opportunity, and mention it in the reason — but never at the expense of delivery on
            urgent or critical work.
            Respond ONLY with valid JSON in this exact format:
            {"scores":[{"candidate_id":1,"score":0.85,"reason":"Short explanation"},{...}]}
            """;

        StringBuilder userMsg = new StringBuilder();
        userMsg.append("Issue: ").append(issueText).append("\n");
        userMsg.append("Priority: ").append(priority).append("\n\n");
        userMsg.append("Team members:\n");
        for (User u : candidates) {
            CandidateMetrics m = metricsByUser.get(u.getId());
            userMsg.append(String.format(
                "- id:%d name:%s skills:%s seniority:%s capacity:%sh/w openIssues:%d acceptRate:%.0f%% growthStretch:%s targets:%s\n",
                u.getId(),
                Objects.toString(u.getDisplayName(), u.getEmail()),
                String.join(",", m.profileSkills()),
                Objects.toString(m.seniority(), "n/a"),
                m.capacityHours() != null ? m.capacityHours().toString() : "n/a",
                m.openIssues(),
                m.historyStats().acceptedRate() * 100,
                m.growthScore() > 0 ? "yes" : "no",
                m.targetSkills().isEmpty() ? "-" : String.join(",", m.targetSkills())
            ));
        }

        // Tier "fast" (8B) : le smart-assign doit rester réactif (notamment en preview à la création).
        String raw = llm.chatCompletion(modelName, systemPrompt, userMsg.toString(), true, "fast");

        try {
            JsonNode root   = objectMapper.readTree(raw);
            JsonNode scores = root.path("scores");
            Map<Long, Double> result  = new LinkedHashMap<>();
            Map<Long, String> reasons = new LinkedHashMap<>();
            for (JsonNode node : scores) {
                long   candidateId = node.path("candidate_id").asLong();
                double score       = node.path("score").asDouble(0.0);
                result.put(candidateId, Math.min(1.0, Math.max(0.0, score)));
                String reason = node.path("reason").asText("").trim();
                if (!reason.isEmpty()) {
                    reasons.put(candidateId, reason);
                }
            }
            return new GroqResult(result, reasons);
        } catch (Exception ex) {
            log.warn("Cannot parse Groq scores response: {}", ex.getMessage());
            return GroqResult.empty();
        }
    }

    /** Synthèse Java d'un « pourquoi » quand Groq n'a pas fourni d'explication (repli). */
    private String buildFallbackReason(CandidateMetrics m, int historical) {
        List<String> parts = new ArrayList<>();
        if (!m.matchedSkills().isEmpty()) {
            parts.add("compétences : " + String.join(", ", m.matchedSkills()));
        }
        if (m.availability() >= 70) {
            parts.add("forte disponibilité");
        }
        if (m.openIssues() <= 2) {
            parts.add("charge faible (" + m.openIssues() + " en cours)");
        }
        if (historical >= 65) {
            parts.add("bon historique de livraison");
        }
        if (parts.isEmpty()) {
            parts.add(m.openIssues() + " tâche(s) en cours · disponibilité " + m.availability() + "%");
        }
        return parts.stream().reduce((a, b) -> a + " · " + b).orElse("");
    }

    private List<SmartAssignCandidateResponse> rankCandidates(
        List<User> candidates,
        Map<Long, CandidateMetrics> metricsByUser,
        Map<Long, Double> semanticScores,
        Map<Long, String> reasons
    ) {
        return candidates.stream()
            .map(u -> {
                CandidateMetrics m = metricsByUser.get(u.getId());
                // semanticScores contient le score Groq qui intègre déjà sémantique + historique
                int semantic = toScore(semanticScores.getOrDefault(u.getId(), 0.0));
                int historical = toScore(m.historyStats().resolvedRate());

                // PROD-1.8 : l'historique (taux de résolution réussie) entre désormais dans le score
                // (auparavant calculé mais pondéré à 0). Poids ∑ = 1.0.
                int base = (int) Math.round(
                    semantic    * 0.45
                        + m.workloadScore()  * 0.22
                        + historical         * 0.15
                        + m.availability()   * 0.10
                        + m.labelScore()     * 0.08
                );
                // PROD-1.8 Phase 3 : bonus « montée en compétence » BORNÉ (+15 max) — nudge, ne domine pas.
                // Growth ciblé (membre opt-in, score 100) → +15 ; growth auto mode projet (score 80) → +12.
                int growthBonus = Math.min(15, (int) Math.round(m.growthScore() * 0.15));
                int finalScore = clamp(base + growthBonus);

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
                if (growthBonus > 0) {
                    factors.add("🌱 Tâche stretch (montée en compétence)");
                }

                String groqReason = reasons.get(u.getId());
                String reason = (groqReason != null && !groqReason.isBlank())
                    ? groqReason
                    : buildFallbackReason(m, historical);

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
                    .reason(reason)
                    .matchedSkills(m.matchedSkills())
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
        List<String> matchedSkills,
        HistoryStats historyStats,
        Integer capacityHours,
        String seniority,
        int growthScore,
        List<String> targetSkills
    ) {}

    /** Signaux de profil additionnels (PROD-1.8 Phase 2/3). */
    private record ProfileExtras(Integer capacityHours, String seniority,
                                 boolean growthEnabled, List<String> targetSkills) {}

    /** Scores sémantiques + explications renvoyés par Groq. */
    private record GroqResult(Map<Long, Double> scores, Map<Long, String> reasons) {
        static GroqResult empty() {
            return new GroqResult(Collections.emptyMap(), Collections.emptyMap());
        }
    }
}
