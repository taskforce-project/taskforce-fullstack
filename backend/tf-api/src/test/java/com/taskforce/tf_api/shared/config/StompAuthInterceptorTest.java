package com.taskforce.tf_api.shared.config;

import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessageDeliveryException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;

import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.shared.security.JwtIdentityResolver;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires (sécurité WebSocket) — {@link StompAuthInterceptor}.
 *
 * <p><b>⚠️ Lire ceci avant de « réparer » un test qui échoue ici.</b> Ce fichier a été <b>inversé</b> le
 * 16/07 ({@code TF-RT-AUTH}). Sa version précédente ne <i>ratait</i> pas la faille : elle la
 * <b>spécifiait</b>. Ses libellés, mot pour mot :</p>
 * <ul>
 *   <li>« CONNECT sans token n'appelle pas le décodeur (<b>connexion anonyme tolérée</b>) »</li>
 *   <li>« token invalide : l'exception du décodeur est <b>avalée (connexion tolérée)</b> »</li>
 *   <li>« header Authorization non-Bearer est <b>ignoré</b> »</li>
 *   <li>« SUBSCRIBE/SEND <b>ne sont plus autorisés par canal</b> → routés sans exception »</li>
 * </ul>
 * <p>Six tests verts qui certifiaient qu'un client anonyme pouvait se connecter et s'abonner aux
 * notifications de n'importe qui. Le vert ne prouvait rien : il <b>entérinait</b> le trou. C'est le
 * risque de tester le comportement observé plutôt que le comportement voulu.</p>
 *
 * <p>Désormais : tout CONNECT non authentifié est <b>refusé</b>, et un SUBSCRIBE sur
 * {@code /topic/notifications.{userId}} exige d'<b>être</b> ce userId.</p>
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("StompAuthInterceptor (sécurité)")
class StompAuthInterceptorTest {

    @Mock private JwtDecoder jwtDecoder;
    @Mock private UserRepository userRepository;
    @Mock private JwtIdentityResolver identityResolver;
    @Mock private MessageChannel channel;

    @InjectMocks private StompAuthInterceptor interceptor;

    private Message<byte[]> connect(String authHeader) {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.CONNECT);
        if (authHeader != null) accessor.setNativeHeader("Authorization", authHeader);
        return MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());
    }

    private Message<byte[]> subscribe(String destination, String principalUserId) {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.SUBSCRIBE);
        accessor.setDestination(destination);
        if (principalUserId != null) {
            accessor.setUser(new UsernamePasswordAuthenticationToken(principalUserId, null, java.util.List.of()));
        }
        return MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());
    }

    @Test
    @DisplayName("un message non-STOMP passe tel quel")
    void non_stomp_passes_through() {
        Message<byte[]> msg = MessageBuilder.withPayload(new byte[0]).build();
        assertThat(interceptor.preSend(msg, channel)).isSameAs(msg);
    }

    // =========================================================================
    @Nested
    @DisplayName("CONNECT — tout échec d'authentification REFUSE la connexion")
    class Connect {

        @Test
        @DisplayName("Bearer valide → authentifie et pose le Principal (= userId)")
        void connect_with_bearer_authenticates() {
            Jwt jwt = Jwt.withTokenValue("t").header("alg", "none").claim("email", "dev@it.dev").build();
            when(jwtDecoder.decode("tok")).thenReturn(jwt);
            when(identityResolver.resolveEmail(jwt)).thenReturn("dev@it.dev");
            when(userRepository.findByEmail("dev@it.dev"))
                .thenReturn(Optional.of(User.builder().id(7L).email("dev@it.dev").build()));

            Message<?> out = interceptor.preSend(connect("Bearer tok"), channel);

            StompHeaderAccessor accessor =
                StompHeaderAccessor.wrap(out);
            assertThat(accessor.getUser()).isNotNull();
            assertThat(accessor.getUser().getName()).isEqualTo("7");
            verify(userRepository).findByEmail("dev@it.dev");
        }

        @Test
        @DisplayName("sans token → REFUSÉ (avant : « connexion anonyme tolérée »)")
        void connect_without_token_is_rejected() {
            assertThatThrownBy(() -> interceptor.preSend(connect(null), channel))
                .isInstanceOf(MessageDeliveryException.class);
            org.mockito.Mockito.verifyNoInteractions(jwtDecoder);
        }

        @Test
        @DisplayName("header non-Bearer → REFUSÉ (avant : « ignoré »)")
        void connect_non_bearer_header_is_rejected() {
            assertThatThrownBy(() -> interceptor.preSend(connect("Basic abc"), channel))
                .isInstanceOf(MessageDeliveryException.class);
            org.mockito.Mockito.verifyNoInteractions(jwtDecoder);
        }

        @Test
        @DisplayName("token invalide → REFUSÉ (avant : « l'exception est avalée »)")
        void connect_with_invalid_token_is_rejected() {
            when(jwtDecoder.decode("bad"))
                .thenThrow(new org.springframework.security.oauth2.jwt.BadJwtException("nope"));

            assertThatThrownBy(() -> interceptor.preSend(connect("Bearer bad"), channel))
                .isInstanceOf(MessageDeliveryException.class);
        }

        @Test
        @DisplayName("email inconnu en base → REFUSÉ (avant : « aucun Principal, pas d'erreur »)")
        void connect_user_not_found_is_rejected() {
            Jwt jwt = Jwt.withTokenValue("t").header("alg", "none").claim("email", "ghost@it.dev").build();
            when(jwtDecoder.decode("tok")).thenReturn(jwt);
            when(identityResolver.resolveEmail(jwt)).thenReturn("ghost@it.dev");
            when(userRepository.findByEmail("ghost@it.dev")).thenReturn(Optional.empty());

            assertThatThrownBy(() -> interceptor.preSend(connect("Bearer tok"), channel))
                .isInstanceOf(MessageDeliveryException.class);
        }

        @Test
        @DisplayName("identité illisible (resolver qui lève) → REFUSÉ")
        void connect_unresolvable_identity_is_rejected() {
            Jwt jwt = Jwt.withTokenValue("t").header("alg", "none").build();
            when(jwtDecoder.decode("tok")).thenReturn(jwt);
            when(identityResolver.resolveEmail(any())).thenThrow(new IllegalStateException("JWT email claim missing"));

            assertThatThrownBy(() -> interceptor.preSend(connect("Bearer tok"), channel))
                .isInstanceOf(MessageDeliveryException.class);
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("SUBSCRIBE — les notifications d'un autre sont interdites")
    class Subscribe {

        @Test
        @DisplayName("ses PROPRES notifications → autorisé")
        void own_notifications_allowed() {
            Message<byte[]> msg = subscribe("/topic/notifications.7", "7");
            assertThat(interceptor.preSend(msg, channel)).isSameAs(msg);
        }

        @Test
        @DisplayName("🔒 les notifications d'AUTRUI → REFUSÉ (la fuite d'origine)")
        void other_user_notifications_rejected() {
            assertThatThrownBy(() -> interceptor.preSend(subscribe("/topic/notifications.42", "7"), channel))
                .isInstanceOf(MessageDeliveryException.class);
        }

        @Test
        @DisplayName("session non authentifiée → REFUSÉ")
        void unauthenticated_subscribe_rejected() {
            assertThatThrownBy(() -> interceptor.preSend(subscribe("/topic/notifications.7", null), channel))
                .isInstanceOf(MessageDeliveryException.class);
        }

        /**
         * Périmètre assumé (cf. {@code TF-RT-AUTH-CHANNELS}) : ces topics ne sont pas encore autorisés
         * finement — il faudrait lire la base depuis {@code shared.config}, ce qui creuserait la
         * dépendance {@code shared → core}. Ils exigent au moins une session authentifiée.
         */
        @Test
        @DisplayName("projects/analysis → passent (autorisation fine encore à faire : TF-RT-AUTH-CHANNELS)")
        void other_topics_pass_for_now() {
            Message<byte[]> msg = subscribe("/topic/projects.3", "7");
            assertThat(interceptor.preSend(msg, channel)).isSameAs(msg);
        }
    }
}
