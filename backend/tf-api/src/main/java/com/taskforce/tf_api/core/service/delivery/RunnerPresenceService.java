package com.taskforce.tf_api.core.service.delivery;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Service;

/**
 * Ce que les runners disent de leur poste quand ils réclament une tâche (R37, séance n°7 du Conseil) : Claude Code
 * déconnecté, absent ou trop ancien. Le 29/10/2026, la recette a vu quatre missions partir puis échouer au démarrage,
 * Claude Code n'étant plus connecté : l'agent n'est plus proposé tant qu'un tel problème demeure.
 *
 * <p>En mémoire : un runner réclame toutes les quelques secondes, l'état se reconstruit seul après un redémarrage. Un
 * signalement de plus de deux minutes ne compte plus (le runner est arrêté, ou réparé). Avec plusieurs runners, un seul
 * prêt suffit.</p>
 */
@Service
public class RunnerPresenceService {

    static final Duration FRESH = Duration.ofMinutes(2);

    private final Clock clock;
    private final Map<Long, Map<String, Report>> reports = new ConcurrentHashMap<>();

    public RunnerPresenceService() {
        this(Clock.systemUTC());
    }

    RunnerPresenceService(Clock clock) {
        this.clock = clock;
    }

    /** Le runner {@code clientId} de la personne dit ce qui l'empêche de lancer l'agent ({@code null} : rien). */
    public void report(Long userId, String clientId, String problem) {
        reports.computeIfAbsent(userId, id -> new ConcurrentHashMap<>()).put(clientId, new Report(problem, clock.instant()));
    }

    /** Le problème signalé par ses runners récents quand aucun n'est prêt ; vide sinon, ou sans nouvelles récentes. */
    public Optional<String> problem(Long userId) {
        Map<String, Report> byRunner = reports.get(userId);
        if (byRunner == null) return Optional.empty();
        Instant since = clock.instant().minus(FRESH);
        List<Report> fresh = byRunner.values().stream().filter(report -> report.at().isAfter(since)).toList();
        if (fresh.isEmpty() || fresh.stream().anyMatch(report -> report.problem() == null)) return Optional.empty();
        return Optional.of(fresh.get(0).problem());
    }

    private record Report(String problem, Instant at) {}
}
