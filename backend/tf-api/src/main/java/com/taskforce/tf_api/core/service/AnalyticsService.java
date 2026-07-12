package com.taskforce.tf_api.core.service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.dto.response.AiInsightResponse;
import com.taskforce.tf_api.core.dto.response.AnalyticsKpisResponse;
import com.taskforce.tf_api.core.dto.response.BurndownPointResponse;
import com.taskforce.tf_api.core.dto.response.MemberCapacityResponse;
import com.taskforce.tf_api.core.dto.response.ThroughputPointResponse;
import com.taskforce.tf_api.core.dto.response.WorkloadResponse;
import com.taskforce.tf_api.core.model.Cycle;
import com.taskforce.tf_api.core.model.CycleIssue;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.enums.PlanFeature;
import com.taskforce.tf_api.core.enums.PlanType;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.CycleIssueRepository;
import com.taskforce.tf_api.core.repository.CycleRepository;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class AnalyticsService {

    private final WorkspaceRepository       workspaceRepository;
    private final WorkspaceMemberRepository  workspaceMemberRepository;
    private final ProjectRepository          projectRepository;
    private final IssueRepository            issueRepository;
    private final CycleRepository            cycleRepository;
    private final CycleIssueRepository       cycleIssueRepository;
    private final GroqService                groqService;
    private final ObjectMapper               objectMapper;
    private final AuthorizationService       authorizationService;
    private final PlanFeatureService         planFeatureService;
    private final UserRepository             userRepository;
    private final JdbcTemplate               jdbcTemplate;

    @Value("${ai.groq.assistant-model:llama-3.3-70b-versatile}")
    private String assistantModel;

    /** Résout le workspace par slug ET vérifie que l'appelant en est membre (RBAC, PROD-3.2). */
    private Workspace requireWorkspaceMember(String slug, Long userId) {
        Workspace ws = findWorkspace(slug);
        authorizationService.requireMember(ws.getId(), userId);
        return ws;
    }

    /** Gating d'une fonctionnalité selon le plan du COMPTE (propriétaire du workspace) → 409 si non couvert. */
    private void requireFeature(String slug, PlanFeature feature) {
        PlanType plan = workspaceRepository.findOwnerPlanBySlug(slug).orElse(PlanType.FREE);
        planFeatureService.requireFeature(plan, feature);
    }

    /** Réponse "upgrade" quand le plan ne couvre pas les AI insights (PROD-4.4). */
    private List<AiInsightResponse> upgradeInsights() {
        return List.of(AiInsightResponse.builder()
            .agent("Taskforce")
            .agentColor("#a78bfa")
            .category("Upgrade")
            .urgency("low")
            .confidence(100)
            .action("Passer à Pro")
            .insight("Les AI insights sont disponibles à partir du plan Pro. Passez à Pro pour activer les recommandations IA.")
            .build());
    }

    // -------------------------------------------------------------------------
    // KPIs
    // -------------------------------------------------------------------------

    public AnalyticsKpisResponse getKpis(String slug, Long userId, Long projectId) {
        Workspace ws = requireWorkspaceMember(slug, userId);
        List<Long> projectIds = resolveProjectIds(ws.getId(), projectId);

        if (projectIds.isEmpty()) {
            return new AnalyticsKpisResponse(0, 0, 0.0, 0.0, 0, 0, 0);
        }

        LocalDateTime now = LocalDateTime.now();
        LocalDateTime m0  = now.withDayOfMonth(1).truncatedTo(ChronoUnit.DAYS);
        LocalDateTime m1  = m0.minusMonths(1);
        LocalDateTime w0  = now.minusDays(7);
        LocalDateTime w1  = w0.minusDays(7);

        // Tasks resolved this month vs last month
        long resolvedThis = issueRepository.countCompletedBetween(projectIds, m0, now);
        long resolvedLast = issueRepository.countCompletedBetween(projectIds, m1, m0);
        int  resolvedDelta = delta(resolvedThis, resolvedLast);

        // Avg resolution days this month vs last month
        double avgThis  = avgResolutionDays(issueRepository.findCompletedBetween(projectIds, m0, now));
        double avgLast  = avgResolutionDays(issueRepository.findCompletedBetween(projectIds, m1, m0));
        double avgDelta = round2(avgThis - avgLast);

        // Sprint velocity: last 7 days vs previous 7 days
        long velocityThis  = issueRepository.countCompletedBetween(projectIds, w0, now);
        long velocityLast  = issueRepository.countCompletedBetween(projectIds, w1, w0);
        int  velocityDelta = delta(velocityThis, velocityLast);

        // Active cycles across workspace
        long activeCycles = cycleRepository.findActiveByWorkspaceSlug(slug).size();

        return new AnalyticsKpisResponse(
            resolvedThis, resolvedDelta,
            round2(avgThis), avgDelta,
            velocityThis, velocityDelta,
            activeCycles
        );
    }

    // -------------------------------------------------------------------------
    // Throughput — bucket "WEEK" (8 dernières semaines, défaut) ou "DAY"
    // (30 derniers jours, pour la courbe « tendance sur 1 mois » du dashboard).
    // -------------------------------------------------------------------------

    private static final DateTimeFormatter DAY_LABEL = DateTimeFormatter.ofPattern("dd/MM");

    public List<ThroughputPointResponse> getThroughput(String slug, Long userId, Long projectId, String bucket) {
        Workspace ws = requireWorkspaceMember(slug, userId);
        requireFeature(slug, PlanFeature.ADVANCED_ANALYTICS);
        List<Long> projectIds = resolveProjectIds(ws.getId(), projectId);

        boolean daily = "DAY".equalsIgnoreCase(bucket);
        return daily ? buildThroughput(projectIds, 30, true) : buildThroughput(projectIds, 8, false);
    }

    /** Construit {@code points} buckets glissants (jour ou semaine) du plus ancien au plus récent. */
    private List<ThroughputPointResponse> buildThroughput(List<Long> projectIds, int points, boolean daily) {
        List<ThroughputPointResponse> result = new ArrayList<>();
        LocalDateTime now = LocalDateTime.now();

        for (int i = points - 1; i >= 0; i--) {
            LocalDateTime end   = daily ? now.minusDays(i)      : now.minusWeeks(i);
            LocalDateTime start = daily ? end.minusDays(1)      : end.minusWeeks(1);
            String label = daily ? end.format(DAY_LABEL) : "S" + (points - i);

            if (projectIds.isEmpty()) {
                result.add(new ThroughputPointResponse(label, 0, 0));
            } else {
                long opened   = issueRepository.countCreatedBetween(projectIds, start, end);
                long resolved = issueRepository.countCompletedBetween(projectIds, start, end);
                result.add(new ThroughputPointResponse(label, opened, resolved));
            }
        }
        return result;
    }

    // -------------------------------------------------------------------------
    // Burndown (cycle actif)
    // -------------------------------------------------------------------------

    public List<BurndownPointResponse> getBurndown(String slug, Long userId, Long projectId) {
        requireWorkspaceMember(slug, userId);
        requireFeature(slug, PlanFeature.ADVANCED_ANALYTICS);
        List<Cycle> activeCycles = cycleRepository.findActiveByWorkspaceSlug(slug);
        if (projectId != null) {
            activeCycles = activeCycles.stream()
                .filter(c -> c.getProject() != null && c.getProject().getId().equals(projectId))
                .toList();
        }
        if (activeCycles.isEmpty()) {
            return List.of();
        }

        Cycle cycle = activeCycles.get(0);
        LocalDate startDate = cycle.getStartDate();
        LocalDate endDate   = cycle.getEndDate();

        if (startDate == null || endDate == null) {
            return List.of();
        }

        List<CycleIssue> cycleIssues = cycleIssueRepository.findByCycleId(cycle.getId());
        long total = cycleIssues.size();
        long days  = ChronoUnit.DAYS.between(startDate, endDate) + 1;

        List<BurndownPointResponse> result = new ArrayList<>();
        LocalDate today = LocalDate.now();

        for (long d = 0; d < days; d++) {
            LocalDate dayDate = startDate.plusDays(d);
            if (dayDate.isAfter(today)) {
                break;
            }
            LocalDateTime endOfDay = dayDate.atTime(23, 59, 59);

            long completed = cycleIssues.stream()
                .filter(ci -> ci.getIssue().getCompletedAt() != null
                    && !ci.getIssue().getCompletedAt().isAfter(endOfDay))
                .count();

            long remaining = total - completed;
            long ideal     = Math.max(0, total - Math.round(total * (d + 1.0) / days));

            result.add(new BurndownPointResponse(dayDate.toString(), remaining, ideal));
        }
        return result;
    }

    // -------------------------------------------------------------------------
    // Capacity (issues ouvertes par membre)
    // -------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<MemberCapacityResponse> getCapacity(String slug, Long userId, Long projectId) {
        Workspace ws = requireWorkspaceMember(slug, userId);
        requireFeature(slug, PlanFeature.ADVANCED_ANALYTICS);
        List<Long> projectIds = resolveProjectIds(ws.getId(), projectId);

        // Build map: userId → open issue count
        // Cast via Number to handle both Long and Integer returns from JPQL aggregates
        Map<Long, Long> openCounts = new HashMap<>();
        if (!projectIds.isEmpty()) {
            issueRepository.countOpenIssuesGroupedByAssignee(projectIds)
                .forEach(row -> openCounts.put(
                    ((Number) row[0]).longValue(),
                    ((Number) row[1]).longValue()
                ));
        }

        List<WorkspaceMember> members = workspaceMemberRepository.findByWorkspaceId(ws.getId());
        return members.stream()
            .map(m -> new MemberCapacityResponse(
                m.getUser().getId(),
                m.getUser().getDisplayName() != null ? m.getUser().getDisplayName() : m.getUser().getEmail(),
                m.getUser().getAvatarUrl(),
                openCounts.getOrDefault(m.getUser().getId(), 0L)
            ))
            .toList();
    }

    // -------------------------------------------------------------------------
    // Workload heatmap (US-022) — charge par échéance, membre × jour
    // -------------------------------------------------------------------------

    private static final int WORKLOAD_DEFAULT_DAYS = 14;
    private static final int WORKLOAD_MIN_DAYS     = 1;
    private static final int WORKLOAD_MAX_DAYS     = 30;

    @Transactional(readOnly = true)
    public WorkloadResponse getWorkload(String slug, Long userId, Integer days) {
        Workspace ws = requireWorkspaceMember(slug, userId);
        requireFeature(slug, PlanFeature.ADVANCED_ANALYTICS);

        // Fenêtre [from, to) bornée 1..30 jours (défaut 14).
        int window = days == null ? WORKLOAD_DEFAULT_DAYS
            : Math.max(WORKLOAD_MIN_DAYS, Math.min(WORKLOAD_MAX_DAYS, days));
        LocalDate from = LocalDate.now();
        LocalDate to   = from.plusDays(window);

        List<Long> projectIds = getProjectIds(ws.getId());

        // counts[userId][date] = nb d'échéances ouvertes ce jour-là
        Map<Long, Map<String, Long>> counts = new HashMap<>();
        Map<Long, Long> totals = new HashMap<>();
        if (!projectIds.isEmpty()) {
            issueRepository.countOpenIssuesByAssigneeAndDueDate(projectIds, from, to)
                .forEach(row -> {
                    Long   uid   = ((Number) row[0]).longValue();
                    String day   = (String) row[1];
                    long   count = ((Number) row[2]).longValue();
                    counts.computeIfAbsent(uid, k -> new HashMap<>()).put(day, count);
                    totals.merge(uid, count, Long::sum);
                });
        }

        // Capacité h/sem par membre depuis member_skill_profiles (accès JDBC, table non mappée JPA).
        Map<Long, Integer> capacities = loadCapacities(ws.getId());

        // Série de dates continue (toutes les dates de [from, to)).
        List<String> dateSeries = new ArrayList<>();
        for (int d = 0; d < window; d++) {
            dateSeries.add(from.plusDays(d).toString());
        }

        List<WorkspaceMember> members = workspaceMemberRepository.findByWorkspaceId(ws.getId());
        List<WorkloadResponse.MemberWorkload> memberLoads = members.stream()
            .map(m -> {
                Long uid = m.getUser().getId();
                Map<String, Long> byDay = counts.getOrDefault(uid, Map.of());
                List<WorkloadResponse.DayLoad> daySeries = dateSeries.stream()
                    .map(date -> new WorkloadResponse.DayLoad(date, byDay.getOrDefault(date, 0L)))
                    .toList();
                return new WorkloadResponse.MemberWorkload(
                    uid,
                    m.getUser().getDisplayName() != null ? m.getUser().getDisplayName() : m.getUser().getEmail(),
                    m.getUser().getAvatarUrl(),
                    totals.getOrDefault(uid, 0L),
                    capacities.get(uid),
                    daySeries
                );
            })
            .toList();

        return new WorkloadResponse(from.toString(), to.toString(), memberLoads);
    }

    /** Capacité hebdo déclarée par membre (member_skill_profiles), cf. MemberSkillProfileService. */
    private Map<Long, Integer> loadCapacities(Long workspaceId) {
        Map<Long, Integer> map = new HashMap<>();
        try {
            jdbcTemplate.query(
                "SELECT user_id, capacity_hours_per_week FROM member_skill_profiles WHERE workspace_id = ?",
                rs -> {
                    Integer cap = rs.getObject("capacity_hours_per_week", Integer.class);
                    if (cap != null) {
                        map.put(rs.getLong("user_id"), cap);
                    }
                },
                workspaceId
            );
        } catch (Exception e) {
            // Profils indisponibles → capacité null pour tous (non bloquant).
        }
        return map;
    }

    // -------------------------------------------------------------------------
    // AI Insights (Groq)
    // -------------------------------------------------------------------------

    // Pas de @Transactional englobante : lectures indépendantes + appel Groq.
    // Une tx readOnly se faisait marquer rollback-only par une écriture interne → 500 au commit (FIX-006).
    public List<AiInsightResponse> generateInsights(String slug, Long userId) {
      // Résolution + autz HORS du try : un 404/403 ne doit pas être avalé par le fallback.
      Workspace ws = requireWorkspaceMember(slug, userId);

      // Feature gating (PROD-4.4) : les AI insights sont une fonctionnalité PRO+.
      PlanType plan = userRepository.findById(userId).map(User::getPlanType).orElse(PlanType.FREE);
      if (!planFeatureService.has(plan, PlanFeature.AI_INSIGHTS)) {
        return upgradeInsights();
      }

      try {
        List<Long> projectIds = getProjectIds(ws.getId());

        // Build context for the LLM
        long memberCount = workspaceMemberRepository.findByWorkspaceId(ws.getId()).size();
        long projectCount = projectIds.size();

        LocalDateTime now = LocalDateTime.now();
        LocalDateTime w0  = now.minusDays(7);
        LocalDateTime w1  = w0.minusDays(7);
        LocalDateTime m0  = now.withDayOfMonth(1).truncatedTo(ChronoUnit.DAYS);

        long openIssues    = projectIds.stream()
            .mapToLong(issueRepository::countOpenIssues)
            .sum();
        long resolvedMonth = projectIds.isEmpty() ? 0 : issueRepository.countCompletedBetween(projectIds, m0, now);
        long velocityThis  = projectIds.isEmpty() ? 0 : issueRepository.countCompletedBetween(projectIds, w0, now);
        long velocityLast  = projectIds.isEmpty() ? 0 : issueRepository.countCompletedBetween(projectIds, w1, w0);
        long activeCycles  = cycleRepository.findActiveByWorkspaceSlug(slug).size();

        String context = String.format(
            "Workspace: %s | Members: %d | Projects: %d | Open issues: %d | Resolved this month: %d | " +
            "Sprint velocity this week: %d | Last week: %d | Active cycles: %d",
            ws.getName(), memberCount, projectCount, openIssues, resolvedMonth,
            velocityThis, velocityLast, activeCycles
        );

        String systemPrompt =
            "You are a C-suite AI advisor embedded in a project management tool. " +
            "Analyze the workspace metrics and generate exactly 3 actionable insights. " +
            "Each insight must be from a different executive perspective (operations, product, engineering) " +
            "and include a concrete recommendation. " +
            "Respond ONLY with valid JSON in this exact schema:\n" +
            "{\"insights\":[{" +
            "\"agent\":\"COO\",\"agentColor\":\"#0a84ff\"," +
            "\"category\":\"Operations\",\"urgency\":\"high\"," +
            "\"confidence\":85,\"action\":\"Adjust sprint scope\"," +
            "\"insight\":\"...\"" +
            "}]}\n" +
            "Urgency must be one of: low, medium, high. Confidence is 50-95. Keep insight under 150 chars.";

        try {
            String raw = groqService.chatCompletion(assistantModel, systemPrompt, context, true);
            JsonNode root = objectMapper.readTree(raw);
            JsonNode arr  = root.path("insights");
            if (!arr.isArray() || arr.isEmpty()) return fallbackInsights();

            List<AiInsightResponse> result = new ArrayList<>();
            for (JsonNode n : arr) {
                result.add(AiInsightResponse.builder()
                    .agent(n.path("agent").asText("AI"))
                    .agentColor(n.path("agentColor").asText("#a78bfa"))
                    .category(n.path("category").asText("General"))
                    .urgency(n.path("urgency").asText("medium"))
                    .confidence(Math.max(50, Math.min(95, n.path("confidence").asInt(70))))
                    .action(n.path("action").asText("Review"))
                    .insight(n.path("insight").asText(""))
                    .build());
            }
            return result;
        } catch (Exception e) {
            return fallbackInsights();
        }
      } catch (ResourceNotFoundException e) {
        throw e; // 404 légitime (workspace introuvable)
      } catch (Exception e) {
        // Toute autre erreur (DB, lazy, Groq…) → fallback gracieux, jamais de 500
        return fallbackInsights();
      }
    }

    private List<AiInsightResponse> fallbackInsights() {
        return List.of(
            AiInsightResponse.builder()
                .agent("COO").agentColor("#0a84ff").category("Operations")
                .urgency("medium").confidence(70)
                .action("Review open issues").insight("Check open issues and team workload to optimize sprint delivery.")
                .build()
        );
    }

    // -------------------------------------------------------------------------
    // Helpers privés
    // -------------------------------------------------------------------------

    private Workspace findWorkspace(String slug) {
        return workspaceRepository.findBySlug(slug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace introuvable: " + slug));
    }

    private List<Long> getProjectIds(Long workspaceId) {
        return projectRepository.findByWorkspaceIdOrderByCreatedAtDesc(workspaceId)
            .stream().map(p -> p.getId()).toList();
    }

    /** Filtre analytics par projet (PROD-1.7) : si projectId valide du workspace → ce seul projet, sinon tous. */
    private List<Long> resolveProjectIds(Long workspaceId, Long projectId) {
        List<Long> all = getProjectIds(workspaceId);
        if (projectId != null && all.contains(projectId)) {
            return List.of(projectId);
        }
        return all;
    }

    private double avgResolutionDays(List<Issue> issues) {
        return issues.stream()
            .filter(i -> i.getCompletedAt() != null)
            .mapToLong(i -> ChronoUnit.HOURS.between(i.getCreatedAt(), i.getCompletedAt()))
            .average()
            .orElse(0.0) / 24.0;
    }

    private int delta(long current, long previous) {
        if (previous == 0) {
            return current > 0 ? 100 : 0;
        }
        return (int) Math.round((current - previous) * 100.0 / previous);
    }

    private double round2(double d) {
        return Math.round(d * 100.0) / 100.0;
    }
}
