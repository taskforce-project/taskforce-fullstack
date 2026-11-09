package com.taskforce.tf_api.core.service.ai;

import java.io.IOException;
import java.net.http.HttpConnectTimeoutException;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.Locale;

/** Fournisseur d'IA injoignable, IA coupée, requête refusée ou réponse invalide. */
public class ModelProviderException extends RuntimeException {

    /**
     * Pourquoi le modèle n'a pas répondu, dans ce que la personne peut y faire (TF-J1-15, R133) : la conversation le dit
     * en une phrase ({@link ModelFailure}), sans code d'erreur. {@code OTHER} : rien de plus précis n'est connu.
     */
    public enum Why {
        TIMEOUT, UNREACHABLE, RATE_LIMITED, NO_CREDIT, KEY_REFUSED, MODEL_MISSING, TOO_LARGE, OUT_OF_MEMORY, PROVIDER_ERROR, OTHER
    }

    private final Why why;
    /** Le temps donné au modèle quand il l'a dépassé ; null sinon. */
    private final Duration waited;
    /** Le modèle appelé, posé par la passerelle ; null quand aucun n'était encore choisi. */
    private String model;

    public ModelProviderException(String message) {
        this(message, null, Why.OTHER, null);
    }

    public ModelProviderException(String message, Throwable cause) {
        this(message, cause, Why.OTHER, null);
    }

    private ModelProviderException(String message, Throwable cause, Why why, Duration waited) {
        super(message, cause);
        this.why = why;
        this.waited = waited;
    }

    /**
     * Le transport a échoué. Le JDK distingue la réponse qui n'est pas venue à temps (le modèle travaillait, il était trop
     * lent) d'une connexion qui ne s'ouvre pas (il n'y a personne au bout).
     */
    public static ModelProviderException transport(String reason, IOException failure, Duration timeout) {
        boolean tooSlow = failure instanceof HttpTimeoutException && !(failure instanceof HttpConnectTimeoutException);
        return new ModelProviderException("AI provider unreachable: " + reason, failure,
            tooSlow ? Why.TIMEOUT : Why.UNREACHABLE, tooSlow ? timeout : null);
    }

    /** Le fournisseur a répondu, et refusé : son statut et ses mots disent pourquoi, sans sortir du journal. */
    public static ModelProviderException refused(int status, String body) {
        return new ModelProviderException("AI provider refused the request (HTTP " + status + ")", null, whyRefused(status, body), null);
    }

    /** Une requête trop grande pour le fournisseur, même réduite à un seul outil. */
    public static ModelProviderException tooLarge(String message) {
        return new ModelProviderException(message, null, Why.TOO_LARGE, null);
    }

    static Why whyRefused(int status, String body) {
        String said = body == null ? "" : body.toLowerCase(Locale.ROOT);
        if (said.contains("requires more system memory") || said.contains("out of memory")) return Why.OUT_OF_MEMORY;
        if (status == 402 || said.contains("insufficient_quota") || said.contains("credit balance")) return Why.NO_CREDIT;
        if (status == 401 || status == 403) return Why.KEY_REFUSED;
        if (status == 429) return Why.RATE_LIMITED;
        if (status == 404 || (said.contains("model") && said.contains("not found"))) return Why.MODEL_MISSING;
        if (status == 413 || said.contains("context length") || said.contains("context_length")
            || said.contains("too large") || said.contains("too long")) return Why.TOO_LARGE;
        return status >= 500 ? Why.PROVIDER_ERROR : Why.OTHER;
    }

    public Why why() {
        return why;
    }

    public Duration waited() {
        return waited;
    }

    public String model() {
        return model;
    }

    /** Le modèle que cet appel visait : la phrase de la conversation le nomme. */
    ModelProviderException about(String calledModel) {
        model = calledModel;
        return this;
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
}
