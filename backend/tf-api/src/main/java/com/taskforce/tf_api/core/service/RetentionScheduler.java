package com.taskforce.tf_api.core.service;

import java.time.LocalDateTime;
import java.util.function.IntSupplier;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.repository.OAuthStateRepository;
import com.taskforce.tf_api.core.repository.WorkspaceInvitationRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Application automatique des durées de conservation — RGPD art. 5.1.e (limitation de la
 * conservation) · CERT-C11.
 *
 * <p>Jusqu'au 22/07/2026 les durées de conservation étaient <b>déclarées au registre mais jamais
 * appliquées</b> : les méthodes de purge existaient, aucune tâche planifiée ne les appelait.
 * {@link OtpService#cleanupExpiredOtps()} portait même la mention « à appeler périodiquement via
 * un scheduler » — ce scheduler n'avait jamais été écrit.</p>
 *
 * <h2>Périmètre : ce qui porte déjà une échéance</h2>
 * Les trois traitements purgés ici ont en commun de <b>porter leur propre date d'expiration</b>.
 * Les supprimer une fois expirés n'invente aucune politique de rétention : cela applique
 * l'échéance que la donnée déclare elle-même.
 * <ul>
 *   <li><b>Codes OTP</b> — associés à un e-mail, sans finalité une fois le code périmé.</li>
 *   <li><b>States OAuth</b> — jetons anti-CSRF à usage unique. Le nettoyage opportuniste existant
 *       (à l'émission d'un nouveau state) laissait s'accumuler ceux d'un workspace qui ne
 *       reconnecte plus d'intégration.</li>
 *   <li><b>Invitations sans suite</b> — l'e-mail d'une personne qui n'est jamais devenue
 *       utilisatrice ; c'est la donnée la plus exposée des trois.</li>
 * </ul>
 *
 * <h2>Hors périmètre, volontairement : le journal d'audit</h2>
 * Sa durée est notée « à définir en prod » au registre, et la table y est déclarée <b>immuable</b>.
 * Fixer cette durée est une décision du responsable de traitement, pas du développeur : la trancher
 * ici reviendrait à inventer une politique, et à contredire une mesure de sécurité déjà annoncée.
 * Le point reste ouvert et documenté.
 *
 * @see OtpService#cleanupExpiredOtps()
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class RetentionScheduler {

    private final OtpService                    otpService;
    private final OAuthStateRepository          oauthStateRepository;
    private final WorkspaceInvitationRepository invitationRepository;

    /**
     * Délai de grâce après expiration d'une invitation, avant purge. Non nul pour qu'un
     * administrateur puisse encore constater qu'une invitation est restée sans réponse.
     */
    @Value("${taskforce.retention.invitation-grace-days:30}")
    private int invitationGraceDays;

    /**
     * Tous les jours à 03:30 (fuseau serveur, UTC en dev) — décalé des jobs d'alerte de 08:00 et
     * 08:30 pour ne pas cumuler les charges. Cron surchargeable via
     * {@code taskforce.retention.cron}.
     *
     * <p>Chaque purge est isolée : une erreur sur l'une ne doit pas empêcher les autres de
     * s'exécuter, sans quoi un incident sur une seule table gèlerait toute la rétention. La
     * transaction est portée par les méthodes de dépôt, pas par cette méthode.</p>
     */
    @Scheduled(cron = "${taskforce.retention.cron:0 30 3 * * *}")
    public void applyRetentionPolicies() {
        int otps        = purge("codes OTP expirés",       otpService::cleanupExpiredOtps);
        int states      = purge("states OAuth expirés",    this::purgeOauthStates);
        int invitations = purge("invitations sans suite",  this::purgeStaleInvitations);

        log.info("Rétention appliquée : {} OTP, {} states OAuth, {} invitations supprimés",
            otps, states, invitations);
    }

    private int purgeOauthStates() {
        return (int) oauthStateRepository.deleteByExpiresAtBefore(LocalDateTime.now());
    }

    private int purgeStaleInvitations() {
        return invitationRepository.deleteStaleInvitations(
            LocalDateTime.now().minusDays(invitationGraceDays));
    }

    /**
     * Exécute une purge en absorbant son échec. Renvoie {@code -1} en cas d'erreur, valeur qui se
     * distingue d'un « 0 supprimé » légitime dans les journaux.
     */
    private int purge(String label, IntSupplier action) {
        try {
            return action.getAsInt();
        } catch (Exception e) {
            log.error("Rétention — échec de la purge « {} » : {}", label, e.getMessage(), e);
            return -1;
        }
    }
}
