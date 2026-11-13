package com.taskforce.tf_api.core.service.mcp;

import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.security.SsrfGuard;

/**
 * Pourquoi une connexion à un outil n'a pas abouti (revue des écrans de J2, séance n°23, R160) : un code stable, rendu
 * dans le champ {@code error} de la réponse d'erreur, que l'écran traduit en une phrase qui dit ce qui s'est passé et
 * quoi faire (R133). Le message reste le texte brut, montré seulement à deux clics ; l'écran ne le lit jamais pour
 * décider.
 */
public final class ConnectFailure {

    /** L'adresse demandée n'est pas celle du serveur officiel de l'outil, ou l'outil ne se connecte pas par une adresse. */
    public static final String OFFICIAL_SERVER_ONLY = "CONNECT_OFFICIAL_SERVER_ONLY";
    /** L'adresse vise le réseau interne, n'est pas une adresse web, ou son nom ne se résout pas. */
    public static final String ADDRESS_NOT_ALLOWED = "CONNECT_ADDRESS_NOT_ALLOWED";
    /** L'outil ne publie aucune connexion OAuth que TaskForce sache suivre. */
    public static final String NO_SIGN_IN = "CONNECT_NO_SIGN_IN";
    /** Le serveur de connexion de l'éditeur ne répond pas. */
    public static final String SIGN_IN_UNREACHABLE = "CONNECT_SIGN_IN_UNREACHABLE";
    /** Le serveur de connexion ne se nomme pas comme attendu, ou décrit un autre serveur : TaskForce s'arrête. */
    public static final String SIGN_IN_UNTRUSTED = "CONNECT_SIGN_IN_UNTRUSTED";
    /** Le serveur de connexion n'offre pas ce qu'il faut pour se connecter sûrement (PKCE, ses adresses). */
    public static final String SIGN_IN_UNSUPPORTED = "CONNECT_SIGN_IN_UNSUPPORTED";
    /** L'éditeur refuse d'inscrire TaskForce (inscription dynamique). */
    public static final String REGISTRATION_REFUSED = "CONNECT_REGISTRATION_REFUSED";
    /** L'éditeur ne laisse pas TaskForce s'inscrire seul : une clé, ou une application que l'administrateur crée. */
    public static final String NO_CLIENT = "CONNECT_NO_CLIENT";
    /** L'en-tête choisi pour le jeton ne peut pas le porter, ou sa valeur manque. */
    public static final String HEADER_NOT_ALLOWED = "CONNECT_HEADER_NOT_ALLOWED";
    /** Un serveur sur la machine ou le réseau local attend l'accord de la personne qui l'a lancé. */
    public static final String LOCAL_NEEDS_APPROVAL = "CONNECT_LOCAL_NEEDS_APPROVAL";

    private ConnectFailure() {}

    /** Un échec de connexion, avec son code et son texte brut. */
    public static BusinessException of(String code, String message) {
        return new BusinessException(code, message);
    }

    /**
     * La garde anti-SSRF d'une adresse du flux de connexion : une adresse refusée devient un échec à code stable
     * ({@link #ADDRESS_NOT_ALLOWED}), au lieu d'une erreur sans code. Le code ne distingue pas ses trois causes (un nom
     * qui ne se résout pas, une adresse qui n'est pas web, le réseau interne) : la phrase de l'écran les dit toutes.
     */
    public static void assertPublicAddress(String url) {
        try {
            SsrfGuard.assertPublicHttpUrl(url);
        } catch (IllegalArgumentException e) {
            throw of(ADDRESS_NOT_ALLOWED, e.getMessage());
        }
    }
}
