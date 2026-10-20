package com.taskforce.tf_api.core.dto.response;

/**
 * Compte TaskForce tel que l'app desktop le garde : l'identifiant du compte en ligne ({@code subject}), qui nomme aussi
 * le dossier de ses données sur l'ordinateur, son adresse et son nom.
 *
 * @param avatarUrl photo de profil du compte en ligne, que l'app reprend une fois par poste : chemin de l'API
 *                  ({@code /api/files/avatars/{id}}, photo envoyée) ou adresse du fournisseur de connexion (GitHub,
 *                  Google) ; {@code null} sans photo
 */
public record DesktopAccountResponse(String subject, String email, String givenName, String familyName,
                                     DesktopProfileResponse profile, String avatarUrl) {}
