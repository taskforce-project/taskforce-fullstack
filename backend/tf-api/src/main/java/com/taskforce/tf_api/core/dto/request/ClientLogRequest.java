package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Remontée d'une erreur/log côté client (frontend) pour journalisation serveur (E25).
 * Journalisation « classique » (Slf4j) — PAS d'audit (l'audit est réservé aux actions métier/sécurité).
 * Champs bornés en taille pour éviter le flooding de logs.
 */
@Data
public class ClientLogRequest {

    /** "error" ou "warn" (défaut : error). */
    @Size(max = 16)
    private String level;

    @NotBlank(message = "message requis")
    @Size(max = 2000)
    private String message;

    /** Origine (route / composant). */
    @Size(max = 512)
    private String source;

    /** Stack trace (tronquée). */
    @Size(max = 8000)
    private String stack;

    @Size(max = 512)
    private String userAgent;
}
