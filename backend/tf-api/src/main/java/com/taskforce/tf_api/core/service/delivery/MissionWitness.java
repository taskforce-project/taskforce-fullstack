package com.taskforce.tf_api.core.service.delivery;

import java.net.URI;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.support.TransactionTemplate;

import com.taskforce.tf_api.core.model.DeliveryRun;
import com.taskforce.tf_api.core.repository.DeliveryRunEvidenceRepository;
import com.taskforce.tf_api.core.repository.DeliveryRunRepository;
import com.taskforce.tf_api.core.repository.MissionDossierSealRepository;
import com.taskforce.tf_api.core.service.GitHubPullRequests;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.util.LogSafe;

import lombok.extern.slf4j.Slf4j;

/**
 * Le témoin du dossier d'une mission (R198 amendée, précision 5 ; point 9 de la séance n°30, « oui pour le témoin, le
 * moins cher ») : à la fin de la mission, la tête de sa chaîne s'écrit là où l'exploitant de TaskForce n'est pas seul à
 * écrire, d'abord dans la pull request de la mission. GitHub date le commentaire et garde l'historique de ses
 * modifications : un dossier réécrit ensuite ne retrouve plus cette tête dans sa chaîne.
 *
 * <p>Le commentaire porte toujours l'empreinte de tête scellée, et rien qui dise qui ou où (R159, B2 et M1) : un lien vers
 * la page de vérification seulement quand GitHub dit le dépôt privé, que l'instance n'est pas l'app de bureau et que son
 * adresse n'est pas celle de la machine ; dans le doute, pas de lien. Jamais le nom d'un espace, d'une personne ou d'un
 * hôte interne sur un dépôt public.</p>
 *
 * <p>Après le commit de la fin, hors de sa transaction : GitHub peut être lent ou injoignable, la mission est déjà close.
 * Un échec se retente (R159, L7), et un passage régulier écrit le témoin d'une mission scellée qui n'en a pas encore, si le
 * serveur a redémarré avant. Ce qui s'est passé entre au dossier, à la suite : le commentaire écrit, ou pourquoi il ne
 * l'est pas, et pour une mission sans pull request, une note qui le dit.</p>
 */
@Slf4j
@Component
public class MissionWitness {

    /** Les attentes avant chaque nouvel essai, quand GitHub ne répond pas. */
    static final List<Duration> RETRIES = List.of(Duration.ofSeconds(2), Duration.ofSeconds(10));
    /** Le passage régulier ne revient pas plus loin : au-delà, la mission a son témoin, ou la note qui dit pourquoi. */
    static final Duration SWEEP_WINDOW = Duration.ofDays(7);
    /** Il laisse au témoin de la fin le temps de s'écrire avant de le remplacer. */
    static final Duration SWEEP_GRACE = Duration.ofMinutes(5);

    private final DeliveryRunRepository runRepository;
    private final DeliveryRunEvidenceRepository evidenceRepository;
    private final MissionDossierSealRepository sealRepository;
    private final GitHubPullRequests pullRequests;
    private final MissionEvidenceService evidence;
    private final TransactionTemplate tx;
    private final String frontendUrl;
    private final boolean linkAllowed;
    private final List<Duration> retries;

    /** Le témoin comme avant la relecture R159 : un lien permis là où le dépôt est privé, les attentes par défaut. */
    public MissionWitness(DeliveryRunRepository runRepository, GitHubPullRequests pullRequests, MissionEvidenceService evidence,
                          PlatformTransactionManager transactionManager, String frontendUrl) {
        this(runRepository, null, null, pullRequests, evidence, transactionManager, frontendUrl, true, RETRIES);
    }

    @Autowired
    public MissionWitness(DeliveryRunRepository runRepository, DeliveryRunEvidenceRepository evidenceRepository,
                          MissionDossierSealRepository sealRepository, GitHubPullRequests pullRequests,
                          MissionEvidenceService evidence, PlatformTransactionManager transactionManager,
                          @Value("${app.frontend-url:http://localhost:3000}") String frontendUrl,
                          @Value("${delivery.evidence.witness-link:true}") boolean linkAllowed) {
        this(runRepository, evidenceRepository, sealRepository, pullRequests, evidence, transactionManager, frontendUrl,
            linkAllowed, RETRIES);
    }

    MissionWitness(DeliveryRunRepository runRepository, DeliveryRunEvidenceRepository evidenceRepository,
                   MissionDossierSealRepository sealRepository, GitHubPullRequests pullRequests, MissionEvidenceService evidence,
                   PlatformTransactionManager transactionManager, String frontendUrl, boolean linkAllowed, List<Duration> retries) {
        this.runRepository = runRepository;
        this.evidenceRepository = evidenceRepository;
        this.sealRepository = sealRepository;
        this.pullRequests = pullRequests;
        this.evidence = evidence;
        this.tx = new TransactionTemplate(transactionManager);
        this.frontendUrl = frontendUrl.endsWith("/") ? frontendUrl.substring(0, frontendUrl.length() - 1) : frontendUrl;
        this.linkAllowed = linkAllowed;
        this.retries = List.copyOf(retries);
    }

    /** Ce qu'il faut pour écrire le témoin d'une mission : sa pull request, et l'espace dont le jeton la commente. */
    record Target(Long workspaceId, String repo, int number, String pullRequest) {
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onSealed(MissionSealed sealed) {
        write(sealed);
    }

    /**
     * Le passage régulier (R159, L7) : les missions scellées des sept derniers jours dont le dossier n'a ni témoin ni note
     * qui dise pourquoi, parce que le serveur a redémarré avant l'écriture.
     */
    @Scheduled(fixedDelayString = "${delivery.evidence.witness-sweep-ms:900000}",
        initialDelayString = "${delivery.evidence.witness-sweep-initial-ms:120000}")
    public void sweep() {
        if (evidenceRepository == null || sealRepository == null) {
            return;
        }
        LocalDateTime now = LocalDateTime.now();
        List<Long> runs = tx.execute(status -> evidenceRepository.findUnwitnessed(now.minus(SWEEP_WINDOW), now.minus(SWEEP_GRACE)));
        for (Long runId : runs == null ? List.<Long>of() : runs) {
            sealRepository.findTopByRunIdOrderBySeqDesc(runId)
                .ifPresent(seal -> write(new MissionSealed(runId, seal.getRoot(), seal.getSeq(), seal.getKeyId())));
        }
    }

    /**
     * Écrit la tête du dossier dans la pull request de la mission, puis le dit au dossier. Avant de poster, et avant chaque
     * nouvel essai, il cherche cette tête dans les commentaires de la pull request : une réponse de GitHub perdue ne fait
     * jamais deux commentaires, et il n'en modifie jamais un (R159, second tour, M-a). Puis il a fini : le passage régulier
     * ne relance pas une mission dont la note ne s'écrit pas (N2).
     */
    void write(MissionSealed sealed) {
        Optional<Optional<Target>> found = tx.execute(status -> runRepository.findById(sealed.runId()).map(MissionWitness::target));
        if (found == null || found.isEmpty()) {
            return;
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("kind", "witness");
        Target target = found.get().orElse(null);
        if (target == null) {
            // Sans pull request, la tête ne s'écrit nulle part : la note le dit, le vérificateur n'a rien à deviner (L7).
            data.put("written", false);
            data.put("reason", "This mission has no pull request.");
            keep(sealed.runId(), data);
            return;
        }
        data.put("where", "github-pull-request");
        data.put("pullRequest", target.pullRequest());
        data.put("root", sealed.root());
        data.put("seq", sealed.seq());
        // La clé qui a scellé cette tête, écrite aussi dans le commentaire : publique, datée par GitHub (R159, second tour, N6).
        if (sealed.keyId() != null) data.put("key", sealed.keyId());
        String leftOut = linkLeftOut(target);
        data.put("pageLinked", leftOut == null);
        if (leftOut != null) data.put("pageLeftOut", leftOut);
        String link = leftOut == null ? tx.execute(status -> evidence.linkId(sealed.runId())) : null;
        String body = body(sealed, link);
        String reason = null;
        for (int attempt = 0; attempt <= retries.size(); attempt++) {
            try {
                Optional<String> existing = pullRequests.findComment(target.workspaceId(), target.repo(), target.number(), sealed.root());
                if (existing.isPresent()) {
                    data.put("written", true);
                    data.put("comment", existing.get());
                    reason = null;
                    log.info("Run {} : témoin déjà écrit sur {}", sealed.runId(), target.pullRequest());
                    break;
                }
                String url = pullRequests.comment(target.workspaceId(), target.repo(), target.number(), body).orElse(null);
                data.put("written", true);
                data.put("comment", url);
                reason = null;
                log.info("Run {} : témoin écrit sur {}", sealed.runId(), target.pullRequest());
                break;
            } catch (BusinessException | IllegalStateException e) {
                reason = e.getMessage();
                if (attempt < retries.size() && !pause(retries.get(attempt))) break;
            }
        }
        if (reason != null) {
            data.put("written", false);
            data.put("reason", reason);
            log.warn("Run {} : témoin non écrit sur {} : {}", sealed.runId(), target.pullRequest(), LogSafe.of(reason));
        }
        keep(sealed.runId(), data);
    }

    /**
     * Le témoin entre au dossier, puis il a fini : une note qui ne s'écrit pas met fin aux essais au lieu de les relancer
     * (R159, second tour, N2). Sans la fin posée, le passage régulier la retrouverait, et la reposterait sept jours durant.
     */
    private void keep(Long runId, Map<String, Object> data) {
        try {
            Optional<String> kept = tx.execute(status -> evidence.appendToDossier(runId, "note", MissionEvidenceService.Actor.SERVER, data));
            if (kept == null || kept.isEmpty()) log.warn("Run {} : le témoin n'est pas entré au dossier : il ne sera pas relancé", runId);
        } catch (RuntimeException e) {
            log.warn("Run {} : le témoin n'a pas pu entrer au dossier : {}", runId, LogSafe.of(e.getMessage()));
        }
        try {
            tx.executeWithoutResult(status -> evidence.witnessed(runId));
        } catch (RuntimeException e) {
            log.warn("Run {} : la fin du témoin n'a pas pu se noter : {}", runId, LogSafe.of(e.getMessage()));
        }
    }

    private static boolean pause(Duration wait) {
        try {
            Thread.sleep(wait.toMillis());
            return true;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    /** La pull request de la mission, si elle en a une. */
    private static Optional<Target> target(DeliveryRun run) {
        Matcher pr = DeliveryRunner.PULL_REQUEST.matcher(run.getResultUrl() == null ? "" : run.getResultUrl());
        if (!pr.matches()) return Optional.empty();
        var workspace = run.getIssue().getProject().getWorkspace();
        return Optional.of(new Target(workspace.getId(), pr.group(1), Integer.parseInt(pr.group(2)),
            "https://github.com/" + pr.group(1) + "/pull/" + pr.group(2)));
    }

    /**
     * Pourquoi le commentaire ne porte pas de lien, ou null s'il peut en porter un : l'app de bureau (sa page n'existe que
     * sur la machine), l'exploitant qui l'a coupé ({@code witness-link: false}, R159, second tour, M-b), une adresse de la
     * machine elle-même, un dépôt que GitHub ne dit pas privé, ou dont on ne sait rien.
     */
    String linkLeftOut(Target target) {
        if (!linkAllowed) return local(frontendUrl) ? "desktop-app" : "turned-off";
        if (local(frontendUrl)) return "local-address";
        String visibility = pullRequests.visibility(target.workspaceId(), target.repo()).orElse(null);
        if (visibility == null) return "visibility-unknown";
        return "private".equals(visibility) ? null : visibility + "-repository";
    }

    /** Une adresse qui ne mène qu'à la machine qui l'écrit. */
    static boolean local(String url) {
        String host;
        try {
            host = URI.create(url).getHost();
        } catch (IllegalArgumentException e) {
            return true;
        }
        if (host == null || host.isBlank()) return true;
        host = host.toLowerCase(Locale.ROOT);
        return host.equals("localhost") || host.endsWith(".localhost") || host.startsWith("127.") || host.equals("0.0.0.0")
            || host.equals("[::1]") || host.equals("::1");
    }

    /**
     * Le commentaire : l'empreinte de tête scellée et la clé qui l'a scellée, puis le lien de la page quand il est permis ;
     * rien d'autre (R212). Ni l'espace, ni le numéro de la mission, ni une personne (R159, second tour, M-b et N6).
     */
    String body(MissionSealed sealed, String linkId) {
        String head = "TaskForce evidence of this pull request: `" + sealed.root() + "` (event " + sealed.seq() + " of its record)"
            + (sealed.keyId() == null ? "." : ", sealed with the key `" + sealed.keyId() + "`.");
        return linkId == null ? head : head + "\nVerification page: " + pageUrl(linkId);
    }

    /**
     * La page de vérification, sur l'adresse publique de l'instance : un identifiant du dossier, opaque, et rien qui dise
     * l'espace ou la mission. La page demande de se connecter, et garde ses contrôles d'accès.
     */
    String pageUrl(String linkId) {
        return frontendUrl + "/verify/" + linkId;
    }
}
