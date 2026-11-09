package com.taskforce.tf_api.core.service.ai;

/** Fournisseur d'IA injoignable, IA coupée, requête refusée ou réponse invalide. */
public class ModelProviderException extends RuntimeException {

    public ModelProviderException(String message) {
        super(message);
    }

    public ModelProviderException(String message, Throwable cause) {
        super(message, cause);
    }

    /**
     * Le fournisseur répond, mais refuse les outils, jusqu'au dernier. L'agent ne doit pas répondre comme s'il en avait :
     * sans outils, le modèle annonçait des actions qu'il n'avait pas faites (recette du 29/10/2026).
     */
    public static class ToolsRefused extends ModelProviderException {

        public ToolsRefused(String message) {
            super(message);
        }
    }

    /**
     * Le fournisseur n'a pas répondu dans le délai : il est là, mais trop lent pour cette demande. Le banc en fait un
     * verdict (R142), pas une panne : le passage continue.
     */
    public static class TimedOut extends ModelProviderException {

        public TimedOut(String message, Throwable cause) {
            super(message, cause);
        }
    }

    /** Le fournisseur ne répond pas du tout : éteint, adresse fausse, réseau coupé. Là, le passage s'arrête et le dit. */
    public static class Unreachable extends ModelProviderException {

        public Unreachable(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
