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

    // ---- Helpers enrichis -------------------------------------------------

    private Message<byte[]> stompWith(StompCommand command, String destination, String userId) {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(command);
        if (destination != null) accessor.setDestination(destination);
        if (userId != null) {
            accessor.setUser(new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(
                userId, null, java.util.List.of()));
        }
        return MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());
    }

    // ---- CONNECT branches --------------------------------------------------

    @Test
    @DisplayName("CONNECT avec token invalide : l'exception du décodeur est avalée (connexion tolérée)")
    void connect_with_invalid_token_is_swallowed() {
        when(jwtDecoder.decode("bad")).thenThrow(new org.springframework.security.oauth2.jwt.BadJwtException("nope"));
        // ne doit rien lever
        interceptor.preSend(stompMessage(StompCommand.CONNECT, "Bearer bad"), channel);
        verify(jwtDecoder).decode("bad");
    }

    @Test
    @DisplayName("CONNECT avec Bearer valide mais email inconnu en base → aucun Principal, pas d'erreur")
    void connect_user_not_found() {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "none").claim("email", "ghost@it.dev").build();
        when(jwtDecoder.decode("tok")).thenReturn(jwt);
        when(userRepository.findByEmail("ghost@it.dev")).thenReturn(Optional.empty());

        interceptor.preSend(stompMessage(StompCommand.CONNECT, "Bearer tok"), channel);

        verify(userRepository).findByEmail("ghost@it.dev");
    }

    @Test
    @DisplayName("CONNECT avec header Authorization non-Bearer est ignoré (pas de décodage)")
    void connect_non_bearer_header_ignored() {
        interceptor.preSend(stompMessage(StompCommand.CONNECT, "Basic abc"), channel);
        org.mockito.Mockito.verifyNoInteractions(jwtDecoder);
    }

    // ---- SUBSCRIBE branches -----------------------------------------------

    @Test
    @DisplayName("SUBSCRIBE à /topic/channel.<id> par un membre du canal : autorisé")
    void subscribe_member_allowed() {
        when(channelMemberRepository.existsById_ChannelIdAndId_UserId(5L, 7L)).thenReturn(true);
        interceptor.preSend(stompWith(StompCommand.SUBSCRIBE, "/topic/channel.5", "7"), channel);
        verify(channelMemberRepository).existsById_ChannelIdAndId_UserId(5L, 7L);
    }

    @Test
    @DisplayName("SUBSCRIBE à un canal dont on n'est pas membre → AccessDeniedException")
    void subscribe_non_member_denied() {
        when(channelMemberRepository.existsById_ChannelIdAndId_UserId(5L, 7L)).thenReturn(false);
        org.assertj.core.api.Assertions.assertThatThrownBy(() ->
                interceptor.preSend(stompWith(StompCommand.SUBSCRIBE, "/topic/channel.5", "7"), channel))
            .isInstanceOf(org.springframework.security.access.AccessDeniedException.class);
    }

    @Test
    @DisplayName("SUBSCRIBE à une destination hors-canal (autre topic) est ignoré")
    void subscribe_non_channel_topic_skipped() {
        interceptor.preSend(stompWith(StompCommand.SUBSCRIBE, "/topic/notifications", "7"), channel);
        org.mockito.Mockito.verifyNoInteractions(channelMemberRepository);
    }

    @Test
    @DisplayName("SUBSCRIBE à un canal sans utilisateur authentifié → AccessDeniedException")
    void subscribe_channel_unauthenticated_denied() {
        org.assertj.core.api.Assertions.assertThatThrownBy(() ->
                interceptor.preSend(stompWith(StompCommand.SUBSCRIBE, "/topic/channel.5", null), channel))
            .isInstanceOf(org.springframework.security.access.AccessDeniedException.class);
    }

    // ---- SEND branches -----------------------------------------------------

    @Test
    @DisplayName("SEND vers /app/channel/<id>/send par un membre : autorisé")
    void send_member_allowed() {
        when(channelMemberRepository.existsById_ChannelIdAndId_UserId(9L, 3L)).thenReturn(true);
        interceptor.preSend(stompWith(StompCommand.SEND, "/app/channel/9/send", "3"), channel);
        verify(channelMemberRepository).existsById_ChannelIdAndId_UserId(9L, 3L);
    }

    @Test
    @DisplayName("SEND vers un canal dont on n'est pas membre → AccessDeniedException")
    void send_non_member_denied() {
        when(channelMemberRepository.existsById_ChannelIdAndId_UserId(9L, 3L)).thenReturn(false);
        org.assertj.core.api.Assertions.assertThatThrownBy(() ->
                interceptor.preSend(stompWith(StompCommand.SEND, "/app/channel/9/send", "3"), channel))
            .isInstanceOf(org.springframework.security.access.AccessDeniedException.class);
    }

    @Test
    @DisplayName("SEND vers une destination hors-canal est ignoré")
    void send_non_channel_skipped() {
        interceptor.preSend(stompWith(StompCommand.SEND, "/app/other", "3"), channel);
        org.mockito.Mockito.verifyNoInteractions(channelMemberRepository);
    }
}
