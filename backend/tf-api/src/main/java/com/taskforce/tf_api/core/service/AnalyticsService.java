package com.taskforce.tf_api.core.service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Service;

import com.taskforce.tf_api.core.dto.response.AnalyticsKpisResponse;
import com.taskforce.tf_api.core.dto.response.BurndownPointResponse;
import com.taskforce.tf_api.core.dto.response.ThroughputPointResponse;
import com.taskforce.tf_api.core.model.Cycle;
import com.taskforce.tf_api.core.model.CycleIssue;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.CycleIssueRepository;
import com.taskforce.tf_api.core.repository.CycleRepository;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class AnalyticsService {

    private final WorkspaceRepository  workspaceRepository;
    private final ProjectRepository    projectRepository;
    private final IssueRepository      issueRepository;
    private final CycleRepository      cycleRepository;
    private final CycleIssueRepository cycleIssueRepository;

    // -------------------------------------------------------------------------
    // KPIs
    // -------------------------------------------------------------------------

    public AnalyticsKpisResponse getKpis(String slug, Long userId) {
        Workspace ws = findWorkspace(slug);
        List<Long> projectIds = getProjectIds(ws.getId());

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
    // Throughput (8 dernières semaines)
    // -------------------------------------------------------------------------

    public List<ThroughputPointResponse> getThroughput(String slug, Long userId) {
        Workspace ws = findWorkspace(slug);
        List<Long> projectIds = getProjectIds(ws.getId());

        List<ThroughputPointResponse> result = new ArrayList<>();
        LocalDateTime now = LocalDateTime.now();

        for (int i = 7; i >= 0; i--) {
            LocalDateTime weekEnd   = now.minusWeeks(i);
            LocalDateTime weekStart = weekEnd.minusWeeks(1);
            String label = "S" + (8 - i);

            if (projectIds.isEmpty()) {
                result.add(new ThroughputPointResponse(label, 0, 0));
            } else {
                long opened   = issueRepository.countCreatedBetween(projectIds, weekStart, weekEnd);
                long resolved = issueRepository.countCompletedBetween(projectIds, weekStart, weekEnd);
                result.add(new ThroughputPointResponse(label, opened, resolved));
            }
        }
        return result;
    }

    // -------------------------------------------------------------------------
    // Burndown (cycle actif)
    // -------------------------------------------------------------------------

    public List<BurndownPointResponse> getBurndown(String slug, Long userId) {
        List<Cycle> activeCycles = cycleRepository.findActiveByWorkspaceSlug(slug);
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
