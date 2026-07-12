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
 * Le client doit envoyer : {@code Authorization: Bearer <token>} dans les headers STOMP CONNECT.
 *
 * <p>Auth au niveau CONNECT uniquement. Les topics temps réel (notifications, issues, workflows IA)
 * sont diffusés par le serveur ({@code convertAndSend}) — pas d'autorisation par canal côté client.</p>
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
        if (accessor == null || accessor.getCommand() == null) {
            return message;
        }
        if (StompCommand.CONNECT.equals(accessor.getCommand())) {
            authenticateConnect(accessor);
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
}
