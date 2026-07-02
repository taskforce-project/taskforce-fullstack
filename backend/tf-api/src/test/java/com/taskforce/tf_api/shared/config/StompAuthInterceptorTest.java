package com.taskforce.tf_api.shared.config;

import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;

import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.modules.chat.repository.ChannelMemberRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires (sécurité WebSocket) — {@link StompAuthInterceptor}.
 * Authentification STOMP CONNECT via JWT + routage des commandes.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("StompAuthInterceptor")
class StompAuthInterceptorTest {

    @Mock private JwtDecoder jwtDecoder;
    @Mock private UserRepository userRepository;
    @Mock private ChannelMemberRepository channelMemberRepository;
    @Mock private MessageChannel channel;

    @InjectMocks private StompAuthInterceptor interceptor;

    private Message<byte[]> stompMessage(StompCommand command, String authHeader) {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(command);
        if (authHeader != null) accessor.setNativeHeader("Authorization", authHeader);
        return MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());
    }

    @Test
    @DisplayName("message non-STOMP (pas d'accessor de commande) passe tel quel")
    void non_stomp_passes_through() {
        Message<byte[]> msg = MessageBuilder.withPayload(new byte[0]).build();
        assertThat(interceptor.preSend(msg, channel)).isSameAs(msg);
    }

    @Test
    @DisplayName("CONNECT avec Bearer valide authentifie via le JwtDecoder")
    void connect_with_bearer_authenticates() {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "none").claim("email", "dev@it.dev").build();
        when(jwtDecoder.decode("tok")).thenReturn(jwt);
        when(userRepository.findByEmail("dev@it.dev"))
            .thenReturn(Optional.of(User.builder().id(7L).email("dev@it.dev").build()));

        interceptor.preSend(stompMessage(StompCommand.CONNECT, "Bearer tok"), channel);

        verify(jwtDecoder).decode("tok");
        verify(userRepository).findByEmail("dev@it.dev");
    }

    @Test
    @DisplayName("CONNECT sans token n'appelle pas le décodeur (connexion anonyme tolérée)")
    void connect_without_token() {
        interceptor.preSend(stompMessage(StompCommand.CONNECT, null), channel);

        org.mockito.Mockito.verifyNoInteractions(jwtDecoder);
    }

    @Test
    @DisplayName("SUBSCRIBE est routé sans exception quand non authentifié")
    void subscribe_routes() {
        // pas d'utilisateur authentifié → autorisation court-circuitée, aucune exception attendue
        interceptor.preSend(stompMessage(StompCommand.SUBSCRIBE, null), channel);
    }
}
