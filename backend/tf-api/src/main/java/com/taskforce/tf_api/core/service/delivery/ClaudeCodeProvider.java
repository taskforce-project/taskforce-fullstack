package com.taskforce.tf_api.core.service.delivery;

import java.time.LocalDateTime;
import java.util.List;

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
 * lieu de rester « en cours » pour toujours.</p>
 *
 * <p>{@code available} suit {@code delivery.local-runner.enabled} : désactivé, le provider reste affiché
 * « à venir » dans le picker, comme avant.</p>
 */
@Component
public class ClaudeCodeProvider implements DeliveryAgentProvider {

    public static final String KEY = "claude-code";

    private final LocalRunnerSettings settings;
    private final DeliveryRunRepository runRepository;

    public ClaudeCodeProvider(LocalRunnerSettings settings, DeliveryRunRepository runRepository) {
        this.settings = settings;
        this.runRepository = runRepository;
    }

    @Override public String key()          { return KEY; }
    @Override public String displayName()  { return "Claude Code"; }
    @Override public String logoKey()      { return "anthropic"; } // logo vendorisé (SVGL)
    @Override public boolean available()   { return settings.enabled(); }
    @Override public boolean pullBased()   { return true; }
    @Override public List<String> models() { return List.of("claude-opus-5", "claude-sonnet-5"); }

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
