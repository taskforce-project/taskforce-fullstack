package com.taskforce.tf_api.core.service.delivery;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.dto.response.DeliveryRunActivityResponse;
import com.taskforce.tf_api.core.dto.response.ProjectRunResponse;
import com.taskforce.tf_api.core.enums.DeliveryApprovalStatus;
import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.model.DeliveryRun;
import com.taskforce.tf_api.core.model.DeliveryRunEvent;
import com.taskforce.tf_api.core.repository.DeliveryRunApprovalRepository;
import com.taskforce.tf_api.core.repository.DeliveryRunEventRepository;

import lombok.RequiredArgsConstructor;

/**
 * L'étape en cours des missions (la vue du workflow, R166), que {@link MissionSteps} tire de leur chronologie et de leurs
 * demandes encore ouvertes : la page des missions d'un projet la donne pour chaque ligne, le topic des missions avec chaque
 * changement. Les demandes comptées sont celles que la page et « Waiting for you » montrent : en attente, pas échues, sur
 * une mission qui attend encore des réponses ({@link DeliveryRun#awaitsAnswers}). Rien ne s'écrit ici : une demande échue
 * ne compte plus, sans être close pour autant.
 */
@Component
@RequiredArgsConstructor
public class MissionStepReader {

    private final DeliveryRunEventRepository eventRepository;
    private final DeliveryRunApprovalRepository approvalRepository;
    private final LocalRunnerSettings settings;

    /** L'étape en cours d'une mission, de toute sa chronologie et de ses demandes encore ouvertes. */
    public ProjectRunResponse.Step stepOf(DeliveryRun run) {
        LocalDateTime now = LocalDateTime.now();
        boolean answers = run.awaitsAnswers(now.minus(settings.heartbeatTimeout()));
        return stepOf(run.getId(), run.getStatus(), answers ? openRequests(run.getId(), now) : List.of());
    }

    /**
     * L'étape d'une mission qu'un runner vient de réclamer, par une mise à jour en masse qui détache l'entité : la mission
     * est en cours et son runner vient de donner signe de vie.
     */
    public ProjectRunResponse.Step stepOfClaimed(Long runId, DeliveryRunStatus status) {
        boolean answers = status == DeliveryRunStatus.RUNNING;
        return stepOf(runId, status, answers ? openRequests(runId, LocalDateTime.now()) : List.of());
    }

    /**
     * Les étapes d'une page de missions, avec leurs demandes ouvertes telles que la page les montre. Une mission rendue en
     * est à « rendre » sans lire sa chronologie ; celles des autres se lisent en une requête.
     */
    public Map<Long, ProjectRunResponse.Step> stepsOf(Collection<DeliveryRun> runs,
                                                     Map<Long, List<DeliveryRunActivityResponse.Approval>> open) {
        List<Long> delivered = new ArrayList<>();
        List<Long> others = new ArrayList<>();
        for (DeliveryRun run : runs) (run.getStatus() == DeliveryRunStatus.DONE ? delivered : others).add(run.getId());
        Map<Long, DeliveryRunEvent> last = new HashMap<>();
        if (!delivered.isEmpty()) {
            for (DeliveryRunEvent event : eventRepository.findLastByRunIds(delivered)) last.put(event.getRun().getId(), event);
        }
        Map<Long, List<DeliveryRunEvent>> timelines = new HashMap<>();
        if (!others.isEmpty()) {
            for (DeliveryRunEvent event : eventRepository.findByRunIdInOrderByRunIdAscSeqAsc(others)) {
                timelines.computeIfAbsent(event.getRun().getId(), id -> new ArrayList<>()).add(event);
            }
        }
        Map<Long, ProjectRunResponse.Step> steps = new HashMap<>();
        for (DeliveryRun run : runs) {
            if (run.getStatus() == DeliveryRunStatus.DONE) {
                steps.put(run.getId(), step(MissionSteps.HANDOVER, last.get(run.getId())));
                continue;
            }
            List<MissionSteps.Request> requests = open.getOrDefault(run.getId(), List.of()).stream()
                .map(a -> new MissionSteps.Request(a.tool(), a.summary(), a.status()))
                .toList();
            steps.put(run.getId(), step(run.getStatus(), timelines.getOrDefault(run.getId(), List.of()), requests));
        }
        return steps;
    }

    private ProjectRunResponse.Step stepOf(Long runId, DeliveryRunStatus status, List<MissionSteps.Request> requests) {
        return step(status, eventRepository.findByRunIdOrderBySeqAsc(runId), requests);
    }

    /** Les demandes d'une mission qui attendent encore une réponse, la plus ancienne d'abord. */
    private List<MissionSteps.Request> openRequests(Long runId, LocalDateTime now) {
        return approvalRepository.findByRunIdInAndStatusOrderByCreatedAtAsc(List.of(runId), DeliveryApprovalStatus.PENDING)
            .stream()
            .filter(a -> a.getExpiresAt() == null || now.isBefore(a.getExpiresAt()))
            .map(a -> new MissionSteps.Request(a.getTool(), a.getSummary(), a.getStatus().name()))
            .toList();
    }

    private static ProjectRunResponse.Step step(DeliveryRunStatus status, List<DeliveryRunEvent> events,
                                                List<MissionSteps.Request> requests) {
        String key = MissionSteps.current(status == null ? null : status.name(),
            events.stream().map(e -> new MissionSteps.Event(e.getKind(), e.getTool(), e.getText())).toList(), requests);
        return step(key, events.isEmpty() ? null : events.get(events.size() - 1));
    }

    /** L'étape, avec le dernier événement de la chronologie quand il y en a un. */
    static ProjectRunResponse.Step step(String key, DeliveryRunEvent last) {
        return last == null ? new ProjectRunResponse.Step(key, null, null, null, null)
            : new ProjectRunResponse.Step(key, last.getSeq(), last.getKind(), last.getTool(), last.getCreatedAt());
    }
}
