package com.taskforce.tf_api.core.service.delivery;

import java.time.Duration;
import java.util.List;

/**
 * Fournisseur d'agent de livraison (coding agent) auquel on peut déléguer une tâche
 * (TF-AGENT-DELIVERY). Provider-agnostic : aujourd'hui Claude Code, exécuté par le runner local
 * (ADR-013). Un provider « push » ({@code dispatch}/{@code poll}) lance lui-même le run chez son
 * fournisseur ; un provider « pull » attend qu'un runner le réclame.
 */
public interface DeliveryAgentProvider {

    /** Identifiant stable (kebab-case), ex. "claude-code". */
    String key();

    /** Nom affiché, ex. "Claude Code". */
    String displayName();

    /** Slug de logo (résolu côté front par {@code BrandLogo}). */
    String logoKey();

    /**
     * {@code true} si le provider est réellement <b>exécutable</b>. Sinon, le picker le montre en
     * « à venir » (ex. Claude Code tant que le runner local est désactivé).
     */
    boolean available();

    /** Modèles proposés par le provider (indicatif, pour la reco et le picker). */
    List<String> models();

    /**
     * Ce qui manque pour que ce provider prenne une tâche déléguée dans ce contexte (OSS-5.7), dans la langue de
     * l'interface, ou {@code null} s'il est prêt. Un agent qui n'est pas prêt n'est ni proposé par Smart Assign ni
     * accepté à la délégation : la personne apprend tout de suite quoi faire, au lieu d'attendre un run qui
     * n'aboutira pas. Défaut : prêt dès qu'il est disponible sur l'instance.
     */
    default String unavailableReason(DeliveryContext context) {
        return available() ? null : displayName() + " isn't enabled on this instance.";
    }

    /**
     * {@code true} pour un provider <b>« pull »</b> : l'exécution a lieu sur une machine que le backend ne
     * peut pas joindre (runner local, ADR-013). Le run n'est alors pas dispatché : il reste {@code QUEUED}
     * jusqu'à ce qu'un runner le réclame, puis le runner poste lui-même le résultat.
     */
    default boolean pullBased() {
        return false;
    }

    /**
     * Provider « pull » : attente maximale d'un run que personne ne réclame. Au-delà, il est clos en échec
     * (cf. {@link DeliveryRunner#refresh}). {@code null} = jamais : un provider « push » dispatche lui-même.
     */
    default Duration claimTimeout() {
        return null;
    }

    /**
     * Lance le run dans le cloud du provider (sous le compte de l'utilisateur, cf. spec §D2) et renvoie
     * un handle. Défaut : non exécutable (un provider « pull » ne dispatche rien).
     */
    default DeliveryDispatch dispatch(AgentBrief brief) {
        throw new UnsupportedOperationException(key() + " can't run yet");
    }

    /**
     * Interroge l'état d'un run asynchrone (et son résultat quand terminé), à partir du handle rendu par
     * {@code dispatch}. {@code workspaceId} permet au provider de retrouver ses secrets.
     * Défaut : non exécutable (les providers synchrones renvoient leur résultat dans {@code dispatch} via
     * {@link DeliveryDispatch#immediateResult()} et n'ont pas besoin de {@code poll}).
     */
    default DeliveryPoll poll(String externalRef, Long workspaceId) {
        throw new UnsupportedOperationException(key() + " can't run yet");
    }
}
