package com.taskforce.tf_api.core.dto.response;

import java.util.List;

import com.taskforce.tf_api.core.dto.request.UpdateNotificationPreferencesRequest;
import com.taskforce.tf_api.core.dto.request.UpsertMemberSkillsRequest;

/**
 * Réglages du compte que l'app desktop reprend à la connexion, comme une récupération de compte : le rôle, le profil de
 * compétences, les préférences de notification et l'onboarding déjà fait en ligne. Jamais les espaces de travail ni
 * leurs données. Le profil et les préférences ont la forme des requêtes qui les appliquent dans l'app.
 *
 * @param jobTitle            rôle de la personne
 * @param onboardingCompleted onboarding fait en ligne : l'app ne le redemande pas
 * @param skills              profil de compétences le plus récent (tous espaces confondus), ou {@code null}
 * @param notifications       préférences de notification enregistrées
 */
public record DesktopProfileResponse(
    String jobTitle,
    boolean onboardingCompleted,
    UpsertMemberSkillsRequest skills,
    List<UpdateNotificationPreferencesRequest.Item> notifications
) {}
