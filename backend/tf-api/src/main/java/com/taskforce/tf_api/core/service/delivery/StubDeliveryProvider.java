package com.taskforce.tf_api.core.service.delivery;

import java.util.List;

import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.enums.DeliveryRunStatus;

/**
 * Provider de démonstration (TF-AGENT-DELIVERY slice 3) : simule un run de bout en bout, SANS dépendance
 * externe, pour prouver le pipeline {@code delegate -> dispatch -> poll -> résultat}. Le vrai Claude
 * Code (via Managed Agents) et Copilot/Cursor branchent leur dispatch ensuite.
 *
 * <p>{@code available = true} : c'est le seul exécutable pour l'instant. dispatch démarre le run,
 * poll le renvoie {@code DONE} avec un résultat factice (résumé + lien).</p>
 */
@Component
public class StubDeliveryProvider implements DeliveryAgentProvider {

    @Override public String key() { return "stub"; }
    @Override public String displayName() { return "Demo agent (stub)"; }
    @Override public String logoKey() { return "sparkles"; }
    @Override public boolean available() { return true; }
    @Override public List<String> models() { return List.of("stub"); }

    @Override
    public DeliveryDispatch dispatch(AgentBrief brief) {
        return new DeliveryDispatch("stub-" + brief.issueId() + "-" + System.currentTimeMillis());
    }

    @Override
    public DeliveryPoll poll(String externalRef) {
        return new DeliveryPoll(
            DeliveryRunStatus.DONE,
            "Simulated run: analyzed the task, prepared a draft change and opened a pull request.",
            "https://example.com/pull/" + externalRef,
            null);
    }
}
