package com.taskforce.tf_api.core.dto.response;

/**
 * Compte TaskForce tel que l'app desktop le garde : l'identifiant du compte en ligne ({@code subject}), qui nomme aussi
 * le dossier de ses données sur l'ordinateur, son adresse et son nom.
 */
public record DesktopAccountResponse(String subject, String email, String givenName, String familyName,
                                     DesktopProfileResponse profile) {}
