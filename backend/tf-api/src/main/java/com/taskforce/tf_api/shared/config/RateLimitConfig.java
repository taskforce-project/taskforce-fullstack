package com.taskforce.tf_api.shared.config;

import com.taskforce.tf_api.shared.security.RateLimitFilter;
import io.github.bucket4j.distributed.proxy.ProxyManager;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;

@Configuration
public class RateLimitConfig {

    /**
     * Enregistre le filtre de rate limiting. Si un {@link ProxyManager} Redis est présent
     * (prod, {@code ratelimit.distributed.enabled=true}), les buckets sont partagés entre instances ;
     * sinon le filtre retombe sur son mode local en mémoire (dev/test).
     */
    @Bean
    public FilterRegistrationBean<RateLimitFilter> rateLimitFilter(
            ObjectProvider<ProxyManager<String>> proxyManagerProvider) {
        ProxyManager<String> proxyManager = proxyManagerProvider.getIfAvailable();

        FilterRegistrationBean<RateLimitFilter> registration = new FilterRegistrationBean<>();
        registration.setFilter(new RateLimitFilter(proxyManager));
        registration.addUrlPatterns("/api/*");
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE + 10); // avant Spring Security
        registration.setName("rateLimitFilter");
        return registration;
    }
}
