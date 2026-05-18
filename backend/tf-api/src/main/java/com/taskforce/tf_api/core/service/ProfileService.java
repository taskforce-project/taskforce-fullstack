package com.taskforce.tf_api.core.service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.response.ProfileResponse;
import com.taskforce.tf_api.core.dto.response.ProfileResponse.ActivityEntry;
import com.taskforce.tf_api.core.dto.response.ProfileResponse.HeatmapEntry;
import com.taskforce.tf_api.core.dto.response.ProfileResponse.Stats;
import com.taskforce.tf_api.core.enums.IssueActivityType;
import com.taskforce.tf_api.core.model.IssueActivity;
import com.taskforce.tf_api.core.repository.CycleRepository;
import com.taskforce.tf_api.core.repository.IssueActivityRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@Slf4j
@Transactional(readOnly = true)
public class ProfileService {

    private static final int ACTIVITY_LIMIT  = 15;
    private static final int HEATMAP_MONTHS  = 5;
    private static final DateTimeFormatter ISO_DATE = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    private final IssueActivityRepository activityRepository;
    private final CycleRepository         cycleRepository;
    private final WorkspaceMemberRepository memberRepository;

    /**
     * Retourne toutes les données de la page profil pour l'utilisateur courant.
     *
     * @param slug   slug du workspace
     * @param userId ID interne de l'utilisateur
     */
    public ProfileResponse getProfile(String slug, Long userId) {

        // ── Stats ─────────────────────────────────────────────────────────────
        long created  = activityRepository.countByActorIdAndActionAndWorkspaceSlug(userId, IssueActivityType.CREATED,   slug);
        long closed   = activityRepository.countByActorIdAndActionAndWorkspaceSlug(userId, IssueActivityType.COMPLETED, slug);
        long cycles   = cycleRepository.countCompletedByCreatorIdAndWorkspaceSlug(userId, slug);
        long days     = activityRepository.countDistinctActiveDays(userId, slug);
        long members  = memberRepository.countByWorkspaceSlug(slug);

        Stats stats = new Stats(created, closed, cycles, days, members);

        // ── Activity feed ─────────────────────────────────────────────────────
        List<IssueActivity> recent = activityRepository.findRecentByActorIdAndWorkspaceSlug(
            userId, slug, PageRequest.of(0, ACTIVITY_LIMIT)
        );

        List<ActivityEntry> activity = recent.stream()
            .map(a -> new ActivityEntry(
                a.getId(),
                a.getAction().name(),
                a.getIssue().getTitle(),
                buildIdentifier(a),
                a.getIssue().getProject().getName(),
                a.getCreatedAt().toString()
            ))
            .toList();

        // ── Heatmap ───────────────────────────────────────────────────────────
        LocalDateTime since = LocalDateTime.now().minusMonths(HEATMAP_MONTHS);
        List<Object[]> raw = activityRepository.findHeatmapByActorIdAndWorkspaceSlug(userId, slug, since);

        List<HeatmapEntry> heatmap = raw.stream()
            .map(row -> new HeatmapEntry(row[0].toString(), ((Number) row[1]).longValue()))
            .toList();

        return new ProfileResponse(stats, activity, heatmap);
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private String buildIdentifier(IssueActivity a) {
        return a.getIssue().getProject().getIdentifier()
            + "-" + a.getIssue().getSequenceNumber();
    }
}
