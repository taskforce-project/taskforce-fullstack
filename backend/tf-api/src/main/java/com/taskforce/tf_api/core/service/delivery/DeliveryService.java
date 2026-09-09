package com.taskforce.tf_api.core.service.delivery;

import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.response.DeliveryRunResponse;
import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.model.DeliveryRun;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.DeliveryRunRepository;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.ProjectVisibilityGuard;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Orchestration de la délégation d'une tâche à un agent de livraison (TF-AGENT-DELIVERY slice 3).
 *
 * <p>Comme {@code AnalysisJobService} : cette classe crée/lit le run dans sa transaction mais ne
 * déclenche PAS le runner (@Async) elle-même — c'est le contrôleur qui lance {@link DeliveryRunner}
 * une fois le run committé, sinon le thread async pourrait démarrer avant le commit et ne pas voir
 * la ligne.</p>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class DeliveryService {

    private final DeliveryRunRepository runRepository;
    private final IssueRepository issueRepository;
    private final UserRepository userRepository;
    private final DeliveryAgentProviderRegistry registry;
    private final ProjectVisibilityGuard visibilityGuard;

    /**
     * Crée un run de délégation (QUEUED) pour une issue vers un provider disponible. Écriture sur
     * l'issue (LEAD/ADMIN/OWNER). Le contrôleur déclenche l'exécution après le commit.
     */
    @Transactional
    public DeliveryRunResponse delegate(String slug, Long issueId, String providerKey, String model, Long userId) {
        Issue issue = scopedIssue(slug, issueId);
        visibilityGuard.assertCanWrite(issue.getProject(), userId);

        DeliveryAgentProvider provider = registry.get(providerKey);
        if (provider == null) {
            throw new BusinessException("Provider inconnu : " + providerKey);
        }
        if (!provider.available()) {
            throw new BusinessException("Ce provider n'est pas encore disponible : " + providerKey);
        }

        String resolvedModel = (model != null && !model.isBlank())
            ? model.trim()
            : (provider.models().isEmpty() ? null : provider.models().get(0));

        User startedBy = userRepository.findById(userId).orElse(null);
        DeliveryRun run = DeliveryRun.builder()
            .issue(issue)
            .providerKey(provider.key())
            .model(resolvedModel)
            .status(DeliveryRunStatus.QUEUED)
            .startedBy(startedBy)
            .build();
        run = runRepository.save(run);

        log.info("Délégation issue {} -> provider {} (run {}, QUEUED)", issueId, provider.key(), run.getId());
        return toResponse(run);
    }

    /** Dernier run de délégation d'une issue (ou vide), pour afficher l'état courant. */
    @Transactional(readOnly = true)
    public Optional<DeliveryRunResponse> latestRun(String slug, Long issueId, Long userId) {
        Issue issue = scopedIssue(slug, issueId);
        visibilityGuard.assertCanView(issue.getProject(), userId);
        return runRepository.findTopByIssueIdOrderByCreatedAtDesc(issue.getId()).map(this::toResponse);
    }

    /** Mappe le run en DTO DANS la transaction (les accès paresseux issue/startedBy y sont sûrs). */
    private DeliveryRunResponse toResponse(DeliveryRun r) {
        return new DeliveryRunResponse(
            r.getId(),
            r.getIssue().getId(),
            r.getProviderKey(),
            r.getModel(),
            r.getStatus().name(),
            r.getSummary(),
            r.getResultUrl(),
            r.getError(),
            r.getStartedBy() != null ? r.getStartedBy().getId() : null,
            r.getCreatedAt(),
            r.getUpdatedAt());
    }

    /** Charge une issue en la scopant au workspace du chemin (cross-tenant -> 404, pas 403). */
    private Issue scopedIssue(String slug, Long issueId) {
        Issue issue = issueRepository.findById(issueId)
            .orElseThrow(() -> new ResourceNotFoundException("Issue introuvable"));
        if (issue.getProject() == null || issue.getProject().getWorkspace() == null
            || !slug.equals(issue.getProject().getWorkspace().getSlug())) {
            throw new ResourceNotFoundException("Issue introuvable");
        }
        return issue;
    }
}
