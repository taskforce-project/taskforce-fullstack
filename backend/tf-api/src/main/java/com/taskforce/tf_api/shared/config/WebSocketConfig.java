package com.taskforce.tf_api.shared.config;

import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Configuration du temps réel STOMP.
 *
 * <p><b>Correctif {@code TF-RT-PROD}.</b> Ce fichier portait un {@code try/catch} autour de
 * {@code enableStompBrokerRelay(...)} censé retomber sur le broker en mémoire si RabbitMQ manquait.
 * <b>Ce filet n'a jamais pu s'exécuter</b> : {@code enableStompBrokerRelay} est un simple
 * <i>builder d'enregistrement</i>, il n'ouvre aucun socket. La connexion TCP est établie plus tard,
 * au {@code start()} du {@code StompBrokerRelayMessageHandler} (refresh du contexte), en asynchrone
 * via reactor-netty : l'échec y est <b>loggé, jamais levé</b> ici. Le {@code catch} était donc mort et
 * {@code enableSimpleBroker} inatteignable — en production, sans RabbitMQ, les messages {@code /topic/**}
 * étaient <b>jetés en silence</b> pendant que le panneau Status affichait « Temps réel : disponible ».</p>
 *
 * <p><b>Le choix du broker est désormais explicite</b>, plus déduit d'une exception impossible :</p>
 * <ul>
 *   <li><b>Broker en mémoire (défaut)</b> — correct et suffisant pour un déploiement <b>mono-instance</b>
 *       (VPS, Render). Aucun service externe : c'est ce qui rend le temps réel fonctionnel en prod
 *       <i>sans</i> ajouter RabbitMQ.</li>
 *   <li><b>Relais RabbitMQ</b> ({@code taskforce.realtime.relay.enabled=true}) — nécessaire seulement
 *       pour <b>scaler horizontalement</b> : sans lui, deux instances ne partagent pas leurs topics.
 *       Exige RabbitMQ avec le plugin {@code rabbitmq_stomp} sur le port 61613.</li>
 * </ul>
 *
 * <p>Le défaut est volontairement le mode qui <b>marche partout</b> : une config absente dégrade la
 * capacité de scale, jamais la fonctionnalité. C'est l'inverse du comportement précédent.</p>
 */
@Slf4j
@Configuration
@EnableWebSocketMessageBroker
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    /** {@code true} = relais RabbitMQ (multi-instance). Défaut : broker en mémoire (mono-instance). */
    @Value("${taskforce.realtime.relay.enabled:false}")
    private boolean relayEnabled;

    @Value("${spring.rabbitmq.host:localhost}")
    private String rabbitHost;

    @Value("${spring.rabbitmq.stomp.port:61613}")
    private int rabbitStompPort;

    @Value("${spring.rabbitmq.username:guest}")
    private String rabbitUser;

    @Value("${spring.rabbitmq.password:guest}")
    private String rabbitPassword;

    private final StompAuthInterceptor stompAuthInterceptor;

    @Override
    public void configureMessageBroker(MessageBrokerRegistry config) {
        if (relayEnabled) {
            config.enableStompBrokerRelay("/topic", "/queue")
                    .setRelayHost(rabbitHost)
                    .setRelayPort(rabbitStompPort)
                    .setClientLogin(rabbitUser)
                    .setClientPasscode(rabbitPassword)
                    .setSystemLogin(rabbitUser)
                    .setSystemPasscode(rabbitPassword);
            log.info("Temps réel : relais STOMP RabbitMQ → {}:{} (multi-instance)", rabbitHost, rabbitStompPort);
        } else {
            config.enableSimpleBroker("/topic", "/queue");
            log.info("Temps réel : broker en mémoire (mono-instance). "
                + "Poser taskforce.realtime.relay.enabled=true + RabbitMQ pour scaler horizontalement.");
        }
        config.setApplicationDestinationPrefixes("/app");
        config.setUserDestinationPrefix("/user");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        // Endpoint WebSocket natif (utilisé par @stomp/stompjs)
        registry.addEndpoint("/ws")
                .setAllowedOriginPatterns("*");

        // Endpoint SockJS (fallback navigateurs anciens)
        registry.addEndpoint("/ws-sockjs")
                .setAllowedOriginPatterns("*")
                .withSockJS();
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(stompAuthInterceptor);
    }
}
