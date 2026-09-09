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
}
