package com.taskforce.tf_api.shared.config;

import com.taskforce.tf_api.shared.security.RateLimitFilter;
import io.github.bucket4j.distributed.proxy.ProxyManager;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RateLimitConfig {

    /**
     * Enregistre le filtre de rate limiting. Si un {@link ProxyManager} Redis est présent
     * (prod, {@code ratelimit.distributed.enabled=true}), les buckets sont partagés entre instances ;
     * sinon le filtre retombe sur son mode local en mémoire (dev/test).
     *
     * <p>{@code ratelimit.enabled=false} le retire : l'app desktop, dont l'API n'écoute que sur 127.0.0.1 et n'admet
     * que les jetons de la coque, n'a qu'une adresse pour la fenêtre, le runner et Claude Code, qui la
     * partageraient.</p>
     */
    @Bean
    @ConditionalOnProperty(name = "ratelimit.enabled", havingValue = "true", matchIfMissing = true)
    public FilterRegistrationBean<RateLimitFilter> rateLimitFilter(
            ObjectProvider<ProxyManager<String>> proxyManagerProvider) {
        ProxyManager<String> proxyManager = proxyManagerProvider.getIfAvailable();

        FilterRegistrationBean<RateLimitFilter> registration = new FilterRegistrationBean<>();
        registration.setFilter(new RateLimitFilter(proxyManager));
        registration.addUrlPatterns("/api/*");
        // Après le CORS, pour qu'un 429 porte Access-Control-Allow-Origin (sinon le navigateur le masque en
        // erreur réseau) ; avant Spring Security, pour ne pas décoder de jeton pendant une rafale.
        registration.setOrder(CorsConfig.FILTER_ORDER + 5);
        registration.setName("rateLimitFilter");
        return registration;
    }
}
