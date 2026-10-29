package com.taskforce.tf_api.shared.exception;

/**
 * L'IA a depasse le debit par minute autorise (budget LLM partage protege). Mappe en <b>429</b>
 * (Retry-After) par {@link GlobalExceptionHandler} : message clair « reessaie dans un instant »
 * plutot qu'un echec LLM opaque. Distincte du quota mensuel ({@code IllegalStateException} -> 409).
 *
 * <p>L'attente annoncee est celle de la fenetre : les compteurs sont par minute calendaire, ils se vident a la
 * minute suivante (R52, seance n°8 : « une question par minute », pas « trop de requetes, 60 s »).</p>
 */
public class AiRateLimitedException extends RuntimeException {

    private final long retryAfterSeconds;

    public AiRateLimitedException(String message) {
        this(message, 60);
    }

    public AiRateLimitedException(String message, long retryAfterSeconds) {
        super(message);
        this.retryAfterSeconds = Math.max(1, retryAfterSeconds);
    }

    /** Secondes avant que la fenetre se vide, pour l'en-tete {@code Retry-After}. */
    public long getRetryAfterSeconds() {
        return retryAfterSeconds;
    }
}
