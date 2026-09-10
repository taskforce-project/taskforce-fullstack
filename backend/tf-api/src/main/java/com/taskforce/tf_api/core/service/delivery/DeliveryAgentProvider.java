package com.taskforce.tf_api.core.service.delivery;

import java.util.List;

/**
 * Fournisseur d'agent de livraison (coding agent) auquel on peut déléguer une tâche
 * (TF-AGENT-DELIVERY, slice 2). Provider-agnostic : Claude Code, GitHub Copilot, Cursor, ...
 *
 * <p>Slice 2 = <b>métadonnées</b> seulement (branding + capacités), pour alimenter le picker et
 * le registre. Le dispatch/exécution ({@code dispatch}/{@code poll}) arrive en slice 3.</p>
 */
public interface DeliveryAgentProvider {

    /** Identifiant stable (kebab-case) : "claude-code" | "github-copilot" | "cursor" | ... */
    String key();

    /** Nom affiché : "Claude Code", "GitHub Copilot"... */
    String displayName();

    /** Slug de logo (résolu côté front par {@code BrandLogo}) : "claude", "githubcopilot", "cursor"... */
    String logoKey();

    /**
     * {@code true} si le provider est réellement <b>exécutable</b> (dispatch câblé). En slice 2 aucun ne
     * l'est encore → le picker les montre en « à venir ». Slice 3 passera Claude Code à {@code true}.
     */
    boolean available();

    /** Modèles proposés par le provider (indicatif, pour la reco et le picker). */
    List<String> models();

    /**
     * Lance le run dans le cloud du provider (sous le compte de l'utilisateur, cf. spec §D2) et renvoie
     * un handle. Défaut : non exécutable (les providers réels câblent leur dispatch en slice 3+).
     */
    default DeliveryDispatch dispatch(AgentBrief brief) {
        throw new UnsupportedOperationException(key() + " n'est pas encore exécutable");
    }

    /**
     * Interroge l'état d'un run asynchrone (et son résultat quand terminé), à partir du handle rendu par
     * {@code dispatch}. {@code workspaceId} permet au provider de retrouver ses secrets (ex. clé Cursor).
     * Défaut : non exécutable (les providers synchrones renvoient leur résultat dans {@code dispatch} via
     * {@link DeliveryDispatch#immediateResult()} et n'ont pas besoin de {@code poll}).
     */
    default DeliveryPoll poll(String externalRef, Long workspaceId) {
        throw new UnsupportedOperationException(key() + " n'est pas encore exécutable");
    }
}
