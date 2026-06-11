package com.taskforce.tf_api.shared.config;

import org.springframework.security.access.AccessDeniedException;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.stereotype.Component;

import com.taskforce.tf_api.modules.chat.repository.ChannelMemberRepository;
import com.taskforce.tf_api.core.repository.UserRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Intercepte les frames CONNECT STOMP et valide le JWT pour établir le Principal.
 * Le client doit envoyer : Authorization: Bearer <token> dans les headers STOMP CONNECT.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class StompAuthInterceptor implements ChannelInterceptor {

    private static final String CHANNEL_SEND_PREFIX = "/app/channel/";
    private static final String CHANNEL_TOPIC_PREFIX = "/topic/channel.";

    private final JwtDecoder     jwtDecoder;
    private final UserRepository userRepository;
    private final ChannelMemberRepository channelMemberRepository;

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);

        if (accessor == null || accessor.getCommand() == null) {
            return message;
        }

        if (StompCommand.CONNECT.equals(accessor.getCommand())) {
            authenticateConnect(accessor);
            return message;
        }

        if (StompCommand.SUBSCRIBE.equals(accessor.getCommand())) {
            authorizeSubscription(accessor);
        }

        if (StompCommand.SEND.equals(accessor.getCommand())) {
            authorizeSend(accessor);
        }

        return message;
    }

    private void authenticateConnect(StompHeaderAccessor accessor) {
        String authorization = accessor.getFirstNativeHeader("Authorization");
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            log.warn("STOMP CONNECT sans token JWT — connexion acceptée sans authentification");
            return;
        }

        try {
            Jwt jwt = jwtDecoder.decode(authorization.substring(7));
            String email = jwt.getClaimAsString("email");
            userRepository.findByEmail(email).ifPresentOrElse(
                    user -> {
                        var auth = new UsernamePasswordAuthenticationToken(
                                user.getId().toString(), null, java.util.List.of()
                        );
                        accessor.setUser(auth);
                        log.debug("STOMP CONNECT authentifié : userId={}", user.getId());
                    },
                    () -> log.warn("STOMP CONNECT : user email {} introuvable en base", email)
            );
        } catch (Exception e) {
            log.warn("STOMP CONNECT : token JWT invalide — {}", e.getMessage());
        }
    }

    private void authorizeSubscription(StompHeaderAccessor accessor) {
        String destination = accessor.getDestination();
        if (destination == null || !destination.startsWith(CHANNEL_TOPIC_PREFIX)) {
            return;
        }

        try {
            assertChannelMembership(parseChannelIdFromTopicDestination(destination), extractUserId(accessor), "SUBSCRIBE");
        } catch (AccessDeniedException e) {
            throw e;
        } catch (Exception e) {
            log.warn("STOMP SUBSCRIBE refusé : destination={} — {}", destination, e.getMessage());
            throw new AccessDeniedException("Souscription STOMP invalide");
        }
    }

    private void authorizeSend(StompHeaderAccessor accessor) {
        String destination = accessor.getDestination();
        if (destination == null || !destination.startsWith(CHANNEL_SEND_PREFIX) || !destination.endsWith("/send")) {
            return;
        }

        try {
            assertChannelMembership(parseChannelIdFromSendDestination(destination), extractUserId(accessor), "SEND");
        } catch (AccessDeniedException e) {
            throw e;
        } catch (Exception e) {
            log.warn("STOMP SEND refusé : destination={} — {}", destination, e.getMessage());
            throw new AccessDeniedException("Envoi STOMP invalide");
        }
    }

    private void assertChannelMembership(Long channelId, Long userId, String commandName) {
        if (!channelMemberRepository.existsById_ChannelIdAndId_UserId(channelId, userId)) {
            log.warn("STOMP {} refusé : userId={} n'est pas membre du canal {}", commandName, userId, channelId);
            throw new AccessDeniedException("Accès refusé à ce canal");
        }
    }

    private Long extractUserId(StompHeaderAccessor accessor) {
        var principal = accessor.getUser();
        if (principal == null || principal.getName() == null) {
            throw new AccessDeniedException("Utilisateur STOMP non authentifié");
        }

        return Long.parseLong(principal.getName());
    }

    private Long parseChannelIdFromTopicDestination(String destination) {
        return Long.parseLong(destination, CHANNEL_TOPIC_PREFIX.length(), destination.length(), 10);
    }

    private Long parseChannelIdFromSendDestination(String destination) {
        return Long.parseLong(destination, CHANNEL_SEND_PREFIX.length(), destination.length() - "/send".length(), 10);
    }
}
