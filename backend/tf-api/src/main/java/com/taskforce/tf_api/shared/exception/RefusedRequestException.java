package com.taskforce.tf_api.shared.exception;

/**
 * Un refus attendu, que la requête provoque elle-même : une adresse que la garde anti-SSRF écarte. Même réponse qu'une
 * {@link BusinessException} (400 et son code stable), mais journalisé en WARN, comme une requête invalide, et non en
 * ERROR comme une panne (R159).
 */
public class RefusedRequestException extends BusinessException {

    public RefusedRequestException(String errorCode, String message) {
        super(errorCode, message);
    }
}
