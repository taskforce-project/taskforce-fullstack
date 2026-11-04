package com.taskforce.tf_api.core.service.delivery;

import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.service.AiStatusService;
import com.taskforce.tf_api.core.service.ai.AiProvider;

/**
 * L'agent à l'essai de R51 (séance n°8), essayé en J1 sur la passerelle (R113, séance n°16) : la boucle minimale de
 * TaskForce ({@link TrialAgentLoop}) avec le modèle de l'instance, pour les tâches qui se rendent en commentaire. Il
 * porte le nom du modèle qui répond (un seul nom dans le menu, pas une liste de moteurs) et se dit à l'essai.
 *
 * <ul>
 *   <li>Il ne paraît dans le menu d'une issue que si son projet n'a pas de dépôt : le code reste à Claude Code.</li>
 *   <li>Provider « push » : le backend lance lui-même la mission, après le commit de son passage à {@code RUNNING} ;
 *       la boucle la clôt ({@link DeliveryRunner#complete}). Un run que ce backend ne connaît plus (redémarré pendant
 *       la mission) se clôt en échec à sa prochaine lecture, au lieu de rester « en cours ».</li>
 * </ul>
 */
@Component
public class TrialAgentProvider implements DeliveryAgentProvider {

    public static final String KEY = "taskforce-agent";
    static final String UNNAMED = "TaskForce agent";
    /** La taille de {@code issue_activity.via} et de {@code issue_comments.via}. */
    static final int MAX_NAME = 60;

    private final AiStatusService aiStatus;
    private final TrialAgentLoop loop;

    public TrialAgentProvider(AiStatusService aiStatus, TrialAgentLoop loop) {
        this.aiStatus = aiStatus;
        this.loop = loop;
    }

    @Override public String key()        { return KEY; }
    @Override public boolean trial()     { return true; }

    /** Le nom du modèle qui répondra, celui de Cortex sur l'instance. */
    @Override
    public String displayName() {
        String model = model();
        return model == null ? UNNAMED : model.length() <= MAX_NAME ? model : model.substring(0, MAX_NAME);
    }

    @Override
    public String logoKey() {
        return aiStatus.snapshot().settings().provider() == AiProvider.OLLAMA ? "ollama" : "taskforce";
    }

    @Override
    public boolean available() {
        return aiStatus.current().chatAvailable();
    }

    @Override
    public List<String> models() {
        String model = model();
        return model == null ? List.of() : List.of(model);
    }

    @Override
    public boolean shownFor(DeliveryContext context) {
        return context.project() == null || !hasRepository(context.project());
    }

    @Override
    public String unavailableReason(DeliveryContext context) {
        if (!available()) {
            return "The AI of this instance isn't answering, so the trial agent can't take a task. Check Settings > AI.";
        }
        if (context.project() != null && hasRepository(context.project())) {
            return "The trial agent only takes tasks without a repository: delegate this one to Claude Code.";
        }
        return null;
    }

    /** Le run part après le commit de son passage à {@code RUNNING}, dans le fil de la boucle. */
    @Override
    public DeliveryDispatch dispatch(Long runId, AgentBrief brief) {
        String ref = "trial:" + UUID.randomUUID();
        loop.start(runId, ref);
        return new DeliveryDispatch(ref);
    }

    /** En cours tant que ce backend connaît le run ; sinon perdu, et la personne le relance. */
    @Override
    public DeliveryPoll poll(String externalRef, Long workspaceId) {
        if (loop.knows(externalRef)) {
            return new DeliveryPoll(DeliveryRunStatus.RUNNING, null, null, null);
        }
        return new DeliveryPoll(DeliveryRunStatus.FAILED, null, null,
            "The trial agent stopped when TaskForce restarted. Delegate the task again.");
    }

    private String model() {
        String model = aiStatus.current().fastModel();
        return model == null || model.isBlank() ? null : model;
    }

    private static boolean hasRepository(Project project) {
        return project.getRepoFullName() != null && !project.getRepoFullName().isBlank();
    }
}
