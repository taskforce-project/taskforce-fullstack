package com.taskforce.tf_api.core.service.delivery;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.model.DeliveryRun;
import com.taskforce.tf_api.core.repository.DeliveryRunRepository;
import com.taskforce.tf_api.core.service.MergedPullRequests;

import lombok.RequiredArgsConstructor;

/**
 * La décision de fin prise hors de TaskForce (R212, rubrique 6 : qui, quand, et où) : la pull request d'une mission
 * fusionnée sur GitHub. Le dossier de la mission la garde avec le compte GitHub qui a fusionné et l'heure que GitHub
 * donne, à la suite de sa chaîne, qui se scelle de nouveau. Une mission dont la personne a déjà tranché le résultat dans
 * TaskForce ne reçoit rien : son geste est déjà au dossier.
 */
@Component
@RequiredArgsConstructor
public class MissionMerges {

    static final String WHERE_GITHUB = "github";

    private final DeliveryRunRepository runs;
    private final MissionEvidenceService evidence;

    @EventListener
    @Transactional
    public void onMerged(MergedPullRequests.PullRequestMerged merged) {
        if (merged.issueId() == null || merged.repo() == null) return;
        for (DeliveryRun run : runs.findByIssueIdOrderByCreatedAtDesc(merged.issueId())) {
            if (run.getStatus() != DeliveryRunStatus.DONE || run.getOutcome() != null || !opened(run, merged)) continue;
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("decision", "MERGE");
            data.put("where", WHERE_GITHUB);
            data.put("pullRequest", "https://github.com/" + merged.repo() + "/pull/" + merged.number());
            // Le compte GitHub qui a fusionné est une personne : il n'entre que par son empreinte, son nom à côté de la chaîne,
            // effaçable (R159, M6).
            String login = merged.mergedBy() == null || merged.mergedBy().isBlank() ? null : merged.mergedBy().strip();
            data.put("by", evidence.text(run, "login", login));
            data.put("mergedAt", merged.mergedAt());
            evidence.appendAfterEnd(run, "human.decision", new MissionEvidenceService.Actor("person", "github"), data);
            return;
        }
    }

    /** La mission a-t-elle ouvert cette pull request-là ? */
    private static boolean opened(DeliveryRun run, MergedPullRequests.PullRequestMerged merged) {
        Matcher pr = DeliveryRunner.PULL_REQUEST.matcher(run.getResultUrl() == null ? "" : run.getResultUrl());
        return pr.matches() && pr.group(1).equalsIgnoreCase(merged.repo()) && Integer.parseInt(pr.group(2)) == merged.number();
    }
}
