package com.taskforce.tf_api.shared.exception;

/**
 * L'IA a depasse le debit par minute autorise (budget LLM partage protege). Mappe en <b>429</b>
 * (Retry-After) par {@link GlobalExceptionHandler} : message clair « reessaie dans un instant »
 * plutot qu'un echec LLM opaque. Distincte du quota mensuel ({@code IllegalStateException} -> 409).
 */
public class AiRateLimitedException extends RuntimeException {
    public AiRateLimitedException(String message) {
        super(message);
    }
}
