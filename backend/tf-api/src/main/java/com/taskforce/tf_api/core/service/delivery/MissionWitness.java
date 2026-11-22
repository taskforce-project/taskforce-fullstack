package com.taskforce.tf_api.core.service.delivery;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.support.TransactionTemplate;

import com.taskforce.tf_api.core.repository.DeliveryRunRepository;
import com.taskforce.tf_api.core.service.GitHubPullRequests;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.util.LogSafe;

import lombok.extern.slf4j.Slf4j;

/**
 * Le témoin du dossier d'une mission (R198 amendée, précision 5 ; point 9 de la séance n°30, « oui pour le témoin, le
 * moins cher ») : à la fin de la mission, la tête de sa chaîne s'écrit là où l'exploitant de TaskForce n'est pas seul à
 * écrire, d'abord dans la pull request de la mission. GitHub date le commentaire et garde l'historique de ses
 * modifications : un dossier réécrit ensuite ne retrouve plus cette tête dans sa chaîne. Rien d'autre ne s'ajoute à la
 * pull request que cette empreinte et le lien de la page de vérification.
 *
 * <p>Après le commit de la fin, hors de sa transaction : GitHub peut être lent ou injoignable, la mission est déjà
 * close. Ce qui s'est passé entre au dossier, à la suite : le commentaire écrit, ou pourquoi il ne l'est pas. Une mission
 * sans pull request n'a pas de témoin ; la page le dit.</p>
 */
@Slf4j
@Component
public class MissionWitness {

    private final DeliveryRunRepository runRepository;
    private final GitHubPullRequests pullRequests;
    private final MissionEvidenceService evidence;
    private final TransactionTemplate tx;
    private final String frontendUrl;

    public MissionWitness(DeliveryRunRepository runRepository, GitHubPullRequests pullRequests, MissionEvidenceService evidence,
                          PlatformTransactionManager transactionManager,
                          @Value("${app.frontend-url:http://localhost:3000}") String frontendUrl) {
        this.runRepository = runRepository;
        this.pullRequests = pullRequests;
        this.evidence = evidence;
        this.tx = new TransactionTemplate(transactionManager);
        this.frontendUrl = frontendUrl.endsWith("/") ? frontendUrl.substring(0, frontendUrl.length() - 1) : frontendUrl;
    }

    /** Ce qu'il faut pour écrire le témoin d'une mission : sa pull request et l'adresse de sa page. */
    record Target(Long workspaceId, String slug, String repo, int number, String pullRequest) {
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onSealed(MissionSealed sealed) {
        write(sealed);
    }

    /** Écrit la tête du dossier dans la pull request de la mission, puis le dit au dossier. */
    void write(MissionSealed sealed) {
        Target target = tx.execute(status -> runRepository.findById(sealed.runId()).map(run -> {
            Matcher pr = DeliveryRunner.PULL_REQUEST.matcher(run.getResultUrl() == null ? "" : run.getResultUrl());
            if (!pr.matches()) return null;
            var workspace = run.getIssue().getProject().getWorkspace();
            return new Target(workspace.getId(), workspace.getSlug(), pr.group(1), Integer.parseInt(pr.group(2)),
                "https://github.com/" + pr.group(1) + "/pull/" + pr.group(2));
        }).orElse(null));
        if (target == null) {
            return;
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("kind", "witness");
        data.put("where", "github-pull-request");
        data.put("pullRequest", target.pullRequest());
        data.put("root", sealed.root());
        data.put("seq", sealed.seq());
        try {
            String url = pullRequests.comment(target.workspaceId(), target.repo(), target.number(), body(target, sealed)).orElse(null);
            data.put("written", true);
            data.put("comment", url);
            log.info("Run {} : témoin écrit sur {}", sealed.runId(), target.pullRequest());
        } catch (BusinessException | IllegalStateException e) {
            data.put("written", false);
            data.put("reason", e.getMessage());
            log.warn("Run {} : témoin non écrit sur {} : {}", sealed.runId(), target.pullRequest(), LogSafe.of(e.getMessage()));
        }
        try {
            tx.executeWithoutResult(status -> evidence.appendToDossier(sealed.runId(), "note", MissionEvidenceService.Actor.SERVER, data));
        } catch (RuntimeException e) {
            log.warn("Run {} : le témoin n'a pas pu entrer au dossier : {}", sealed.runId(), LogSafe.of(e.getMessage()));
        }
    }

    /** Le commentaire : l'empreinte de tête et le lien de la page, rien d'autre (R212). */
    String body(Target target, MissionSealed sealed) {
        return "TaskForce evidence of this pull request: `" + sealed.root() + "` (event " + sealed.seq() + " of mission "
            + sealed.runId() + ").\nVerification page: " + pageUrl(target.slug(), sealed.runId());
    }

    /** La page de vérification de la mission, dans l'app. */
    String pageUrl(String slug, Long runId) {
        return frontendUrl + "/" + slug + "/missions/" + runId + "/verification";
    }
}
