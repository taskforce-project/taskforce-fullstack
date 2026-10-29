package com.taskforce.tf_api.core.service.delivery;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.model.DeliveryRun;
import com.taskforce.tf_api.core.repository.DeliveryRunRepository;

/**
 * Claude Code exécuté par un <b>runner local</b>, sur le poste de l'utilisateur (ADR-013).
 *
 * <p>Provider <b>« pull »</b> ({@link #pullBased()}) : le backend ne peut pas appeler une machine locale,
 * donc rien n'est dispatché. Le run reste {@code QUEUED} jusqu'à ce que le runner le réclame
 * ({@link LocalRunnerService#claim}), travaille, puis poste son résultat. {@link #poll} ne sert qu'à
 * détecter un runner <b>perdu</b> : muet plus longtemps que le délai toléré, le run passe en échec au
 * lieu de rester « en cours » pour toujours. Symétrique, {@link #claimTimeout()} : un run que <b>personne</b>
 * ne réclame (aucun runner allumé pour son délégant) est clos au lieu de rester « en attente » pour toujours.</p>
 *
 * <p>{@code available} suit {@code delivery.local-runner.enabled} : désactivé, le provider reste affiché
 * « à venir » dans le picker, comme avant.</p>
 */
@Component
public class ClaudeCodeProvider implements DeliveryAgentProvider {

    public static final String KEY = "claude-code";

    /** Ce que la personne lit quand son runner signale un problème (codes de {@code taskforce-runner/src/readiness.ts}). */
    private static final Map<String, String> RUNNER_PROBLEMS = Map.of(
        "claude-signed-out", "Claude Code isn't signed in on the computer that runs your runner. Sign in there with "
            + "claude auth login, then delegate again.",
        "claude-outdated", "Claude Code is too old on the computer that runs your runner. Update it with "
            + "npm install -g @anthropic-ai/claude-code, then delegate again.",
        "claude-missing", "Claude Code isn't installed on the computer that runs your runner. Install it with "
            + "npm install -g @anthropic-ai/claude-code, then delegate again.");
    private static final String RUNNER_PROBLEM =
        "Your runner can't start Claude Code right now: open Settings > Agents to see what is missing.";

    private final LocalRunnerSettings settings;
    private final DeliveryRunRepository runRepository;
    /** Absent quand le runner local est désactivé (bean conditionnel). */
    private final ObjectProvider<RunnerProvisioningService> provisioning;
    private final RunnerPresenceService presence;

    public ClaudeCodeProvider(LocalRunnerSettings settings, DeliveryRunRepository runRepository,
                              ObjectProvider<RunnerProvisioningService> provisioning, RunnerPresenceService presence) {
        this.settings = settings;
        this.runRepository = runRepository;
        this.provisioning = provisioning;
        this.presence = presence;
    }

    @Override public String key()          { return KEY; }
    @Override public String displayName()  { return "Claude Code"; }
    // Clé de marque. Les fronts n'en affichent que le NOM : les conditions d'Anthropic interdisent son logo sans permission (ADR-013).
    @Override public String logoKey()      { return "anthropic"; }
    @Override public boolean available()   { return settings.enabled(); }
    @Override public boolean pullBased()   { return true; }
    @Override public Duration claimTimeout() { return settings.claimTimeout(); }
    @Override public List<String> models() { return List.of("claude-opus-5", "claude-sonnet-5"); }

    /**
     * Prêt quand la personne qui délègue a créé son runner local, c'est lui qui prendra la tâche, et que ce runner ne
     * signale aucun problème sur son poste (R37) : sinon la mission partirait pour échouer au démarrage.
     */
    @Override
    public String unavailableReason(DeliveryContext context) {
        if (!settings.enabled()) {
            return "Claude Code isn't enabled on this instance. An administrator turns it on with DELIVERY_LOCAL_RUNNER_ENABLED=true.";
        }
        RunnerProvisioningService service = provisioning.getIfAvailable();
        if (service != null && context.userId() != null && !service.hasRunner(context.userId())) {
            return "Set up your local runner first (Settings > Agents), then start it on your machine.";
        }
        if (context.userId() != null) {
            String problem = presence.problem(context.userId()).orElse(null);
            if (problem != null) return RUNNER_PROBLEMS.getOrDefault(problem, RUNNER_PROBLEM);
        }
        return null;
    }

    @Override
    public DeliveryPoll poll(String externalRef, Long workspaceId) {
        DeliveryRun run = runRepository.findByExternalRef(externalRef).orElse(null);
        if (run == null || run.getHeartbeatAt() == null) {
            return new DeliveryPoll(DeliveryRunStatus.RUNNING, null, null, null);
        }
        LocalDateTime deadline = run.getHeartbeatAt().plus(settings.heartbeatTimeout());
        if (LocalDateTime.now().isAfter(deadline)) {
            return new DeliveryPoll(DeliveryRunStatus.FAILED, null, null,
                "Runner lost: no heartbeat for more than " + settings.heartbeatTimeout().toMinutes()
                    + " min. Restart the runner and delegate the task again.");
        }
        return new DeliveryPoll(DeliveryRunStatus.RUNNING, null, null, null);
    }
}
