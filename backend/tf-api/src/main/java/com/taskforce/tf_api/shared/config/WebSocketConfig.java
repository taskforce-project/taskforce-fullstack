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

@Slf4j
@Configuration
@EnableWebSocketMessageBroker
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

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
        try {
            config.enableStompBrokerRelay("/topic", "/queue")
                    .setRelayHost(rabbitHost)
                    .setRelayPort(rabbitStompPort)
                    .setClientLogin(rabbitUser)
                    .setClientPasscode(rabbitPassword)
                    .setSystemLogin(rabbitUser)
                    .setSystemPasscode(rabbitPassword);
            log.info("STOMP broker relay activé → {}:{}", rabbitHost, rabbitStompPort);
        } catch (Exception e) {
            log.warn("RabbitMQ STOMP relay indisponible — fallback sur le broker en mémoire : {}", e.getMessage());
            config.enableSimpleBroker("/topic", "/queue");
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
