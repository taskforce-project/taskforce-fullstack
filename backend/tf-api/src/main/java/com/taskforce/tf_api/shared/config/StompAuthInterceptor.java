package com.taskforce.tf_api.shared.config;

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

    private final JwtDecoder     jwtDecoder;
    private final UserRepository userRepository;

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);

        if (accessor == null || !StompCommand.CONNECT.equals(accessor.getCommand())) {
            return message;
        }

        String authorization = accessor.getFirstNativeHeader("Authorization");
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            log.warn("STOMP CONNECT sans token JWT — connexion acceptée sans authentification");
            return message;
        }

        try {
            Jwt jwt = jwtDecoder.decode(authorization.substring(7));
            userRepository.findByKeycloakId(jwt.getSubject()).ifPresentOrElse(
                    user -> {
                        var auth = new UsernamePasswordAuthenticationToken(
                                user.getId().toString(), null, java.util.List.of()
                        );
                        accessor.setUser(auth);
                        log.debug("STOMP CONNECT authentifié : userId={}", user.getId());
                    },
                    () -> log.warn("STOMP CONNECT : user Keycloak {} introuvable en base", jwt.getSubject())
            );
        } catch (Exception e) {
            log.warn("STOMP CONNECT : token JWT invalide — {}", e.getMessage());
        }

        return message;
    }
}
