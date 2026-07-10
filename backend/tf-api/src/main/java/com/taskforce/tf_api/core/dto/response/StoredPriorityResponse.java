package com.taskforce.tf_api.core.dto.response;

/**
 * Une priorité persistée et actionnable.
 *
 * <p>{@code issueId} / {@code issueIdentifier} (ex. {@code WEB-42}) sont renseignés dès que
 * la priorité a été acceptée : le front peut alors pointer vers l'issue créée.
 */
public record StoredPriorityResponse(
    Long id,
    String level,            // HIGH | MEDIUM | LOW
    String title,
    String rationale,
    String status,           // NEW | ACCEPTED | PINNED | DISMISSED
    Long issueId,
    String issueIdentifier,
    int position
) {}
