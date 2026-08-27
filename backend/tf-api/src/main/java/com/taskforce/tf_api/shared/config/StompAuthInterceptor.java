package com.taskforce.tf_api.shared.config;

import java.util.List;

import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessageDeliveryException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.RealtimeAuthorizationService;
import com.taskforce.tf_api.shared.security.JwtIdentityResolver;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Authentifie les frames STOMP {@code CONNECT} et autorise les {@code SUBSCRIBE}.
 * Le client envoie {@code Authorization: Bearer <token>} dans les headers STOMP CONNECT.
 *
 * <p><b>Correctif {@code TF-RT-AUTH}.</b> Cette classe <i>documentait</i> son propre trou :
 * « STOMP CONNECT sans token JWT — connexion acceptée sans authentification », puis {@code return} —
 * la frame passait. Un JWT invalide passait aussi (catch → warn → rien). Sans Principal <b>et</b> sans
 * autorisation par canal, n'importe quel client anonyme pouvait s'abonner à
 * {@code /topic/notifications.{n'importe quel userId}} et lire les notifications d'autrui en direct.</p>
 *
 * <p>Le trou était <b>dormant</b> uniquement parce que le relais STOMP est mort en production
 * ({@code TF-RT-PROD}) : réparer le temps réel l'aurait <b>ouvert</b>. C'est pourquoi ce correctif part
 * avant celui du relais, jamais après.</p>
 *
 * <p><b>Pourquoi lever plutôt que retourner {@code null}</b> : une exception dans {@code preSend} sur un
 * CONNECT fait répondre une frame ERROR au client puis ferme la session — le refus est explicite et
 * diagnosticable, là où un {@code null} donnerait une coupure muette côté navigateur.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class StompAuthInterceptor implements ChannelInterceptor {

    /** Topic dont la clé EST l'identité de l'abonné : {@code /topic/notifications.{userId}}. */
    private static final String USER_TOPIC_PREFIX     = "/topic/notifications.";
    /** Flux temps réel d'un projet (board) : {@code /topic/projects.{projectId}} — autorisé par visibilité projet. */
    private static final String PROJECT_TOPIC_PREFIX  = "/topic/projects.";
    /** Flux d'analyse IA d'un workspace : {@code /topic/analysis.{workspaceId}} — autorisé par appartenance. */
    private static final String ANALYSIS_TOPIC_PREFIX = "/topic/analysis.";

    private final JwtDecoder                   jwtDecoder;
    private final UserRepository               userRepository;
    private final JwtIdentityResolver          identityResolver;
    private final RealtimeAuthorizationService realtimeAuth;

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null || accessor.getCommand() == null) {
            return message;
        }
        if (StompCommand.CONNECT.equals(accessor.getCommand())) {
            accessor.setUser(authenticateConnect(accessor));
        } else if (StompCommand.SUBSCRIBE.equals(accessor.getCommand())) {
            authorizeSubscribe(accessor);
        }
        return message;
    }

    /** @return le Principal authentifié — ne rend jamais {@code null} : tout échec lève. */
    private UsernamePasswordAuthenticationToken authenticateConnect(StompHeaderAccessor accessor) {
        String authorization = accessor.getFirstNativeHeader("Authorization");
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            log.warn("STOMP CONNECT refusé : aucun token Bearer");
            throw new MessageDeliveryException("Authentification requise");
        }

        Jwt jwt;
        try {
            jwt = jwtDecoder.decode(authorization.substring(7));
        } catch (Exception ex) {
            log.warn("STOMP CONNECT refusé : token invalide — {}", ex.getMessage());
            throw new MessageDeliveryException("Token invalide");
        }

        // Passe par le resolver plutôt que jwt.getClaimAsString("email") : en profil dev un token sans
        // claim email est légitime (cf. TF-JWT-IDENTITY), hors dev le resolver lève de lui-même.
        String email;
        try {
            email = identityResolver.resolveEmail(jwt);
        } catch (Exception ex) {
            log.warn("STOMP CONNECT refusé : identité illisible — {}", ex.getMessage());
            throw new MessageDeliveryException("Identité illisible");
        }

        return userRepository.findByEmail(email)
            .map(user -> {
                log.debug("STOMP CONNECT authentifié : userId={}", user.getId());
                return new UsernamePasswordAuthenticationToken(user.getId().toString(), null, List.of());
            })
            .orElseThrow(() -> {
                log.warn("STOMP CONNECT refusé : utilisateur {} introuvable", email);
                return new MessageDeliveryException("Utilisateur inconnu");
            });
    }

    /**
     * Autorise chaque {@code SUBSCRIBE} <b>par canal</b> (fix <b>H2</b>, TF-RT-AUTH-CHANNELS). Toute
     * souscription exige une session authentifiée ; en plus, les canaux porteurs de données sont vérifiés :
     * <ul>
     *   <li>{@code /topic/notifications.{userId}} — l'abonné doit être ce {@code userId} ;</li>
     *   <li>{@code /topic/projects.{projectId}} — l'abonné doit <b>voir</b> le projet (public / membre / OWNER-ADMIN) ;</li>
     *   <li>{@code /topic/analysis.{workspaceId}} — l'abonné doit être <b>membre</b> du workspace.</li>
     * </ul>
     * Avant, seul le topic notifications était contrôlé : {@code projects.*} / {@code analysis.*} n'exigeaient
     * qu'une session authentifiée → n'importe qui pouvait streamer l'activité d'un autre compte par simple
     * énumération d'id. La lecture de la base vit dans {@link RealtimeAuthorizationService} (côté {@code core}) ;
     * l'intercepteur reste mince.
     */
    private void authorizeSubscribe(StompHeaderAccessor accessor) {
        String destination = accessor.getDestination();
        if (destination == null) {
            return;
        }
        String principal = accessor.getUser() != null ? accessor.getUser().getName() : null;
        if (principal == null) {
            log.warn("STOMP SUBSCRIBE refusé sur {} : session non authentifiée", destination);
            throw new MessageDeliveryException("Authentification requise");
        }
        long userId;
        try {
            userId = Long.parseLong(principal);
        } catch (NumberFormatException ex) {
            throw new MessageDeliveryException("Identité illisible");
        }

        if (destination.startsWith(USER_TOPIC_PREFIX)) {
            if (!principal.equals(destination.substring(USER_TOPIC_PREFIX.length()))) {
                log.warn("STOMP SUBSCRIBE refusé : user {} a tenté de lire les notifications d'un autre", principal);
                throw new MessageDeliveryException("Accès refusé à ce canal");
            }
        } else if (destination.startsWith(PROJECT_TOPIC_PREFIX)) {
            if (!realtimeAuth.canSubscribeProject(userId, parseId(destination, PROJECT_TOPIC_PREFIX))) {
                log.warn("STOMP SUBSCRIBE refusé : user {} sans accès au canal {}", userId, destination);
                throw new MessageDeliveryException("Accès refusé à ce canal");
            }
        } else if (destination.startsWith(ANALYSIS_TOPIC_PREFIX)) {
            if (!realtimeAuth.canSubscribeWorkspace(userId, parseId(destination, ANALYSIS_TOPIC_PREFIX))) {
                log.warn("STOMP SUBSCRIBE refusé : user {} sans accès au canal {}", userId, destination);
                throw new MessageDeliveryException("Accès refusé à ce canal");
            }
        }
        // Autres canaux : la session authentifiée suffit (aucun flux cross-tenant connu au-delà de ces 3).
    }

    /** Id numérique en fin de destination ({@code prefix + id}) ; refuse une destination malformée. */
    private static long parseId(String destination, String prefix) {
        try {
            return Long.parseLong(destination.substring(prefix.length()));
        } catch (NumberFormatException ex) {
            throw new MessageDeliveryException("Canal invalide");
        }
    }
}
