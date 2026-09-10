package com.taskforce.tf_api.core.service.delivery;

/**
 * Résultat d'un {@code dispatch} : le run a démarré chez le provider (TF-AGENT-DELIVERY).
 *
 * <p>Deux familles de providers :</p>
 * <ul>
 *   <li><b>Asynchrones</b> (ex. futur Claude Code via Managed Agents, Copilot) : le run tourne dans le
 *       cloud du provider ; {@code immediateResult} est {@code null} et le runner fera un {@code poll}
 *       plus tard via {@code externalRef}.</li>
 *   <li><b>Synchrones</b> (ex. {@code ClaudeApiProvider} B1 : un appel Messages API) : le résultat est
 *       déjà là ; il est porté par {@code immediateResult} et le runner n'appelle pas {@code poll}.</li>
 * </ul>
 *
 * @param externalRef     identifiant du run côté provider (repris pour le {@code poll})
 * @param immediateResult résultat déjà disponible (providers synchrones), ou {@code null}
 */
public record DeliveryDispatch(String externalRef, DeliveryPoll immediateResult) {

    /** Provider asynchrone : pas de résultat immédiat, le runner fera un {@code poll}. */
    public DeliveryDispatch(String externalRef) {
        this(externalRef, null);
    }
}
