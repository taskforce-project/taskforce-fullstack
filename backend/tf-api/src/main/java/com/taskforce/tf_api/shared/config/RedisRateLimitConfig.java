package com.taskforce.tf_api.shared.config;

import java.time.Duration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.github.bucket4j.distributed.ExpirationAfterWriteStrategy;
import io.github.bucket4j.distributed.proxy.ProxyManager;
import io.github.bucket4j.redis.lettuce.cas.LettuceBasedProxyManager;
import io.lettuce.core.RedisClient;
import io.lettuce.core.RedisURI;
import io.lettuce.core.api.StatefulRedisConnection;
import io.lettuce.core.codec.ByteArrayCodec;
import io.lettuce.core.codec.RedisCodec;
import io.lettuce.core.codec.StringCodec;
import lombok.extern.slf4j.Slf4j;

/**
 * Rate limiting <b>distribué</b> (TF-SEC-011) : fournit un {@link ProxyManager} adossé à Redis
 * (via Lettuce) pour partager les buckets entre instances. Sans cela, chaque instance garde ses
 * propres compteurs en mémoire ({@code ConcurrentHashMap}) et un client peut contourner la limite
 * en alternant les instances derrière le load-balancer.
 *
 * <p><b>Activation conditionnelle</b> : ce bean n'existe que si {@code ratelimit.distributed.enabled=true}
 * (typiquement en prod). En dev/test, la propriété est absente → aucun {@code ProxyManager} n'est
 * publié et {@code RateLimitFilter} retombe sur son mode local (aucune dépendance Redis requise).</p>
 */
@Slf4j
@Configuration
@ConditionalOnProperty(name = "ratelimit.distributed.enabled", havingValue = "true")
public class RedisRateLimitConfig {

    @Value("${spring.data.redis.host:redis}")
    private String redisHost;

    @Value("${spring.data.redis.port:6379}")
    private int redisPort;

    @Bean(destroyMethod = "shutdown")
    public RedisClient rateLimitRedisClient() {
        RedisClient client = RedisClient.create(
            RedisURI.builder().withHost(redisHost).withPort(redisPort).build());
        log.info("Rate limiting distribué activé — Redis {}:{}", redisHost, redisPort);
        return client;
    }

    @Bean(destroyMethod = "close")
    public StatefulRedisConnection<String, byte[]> rateLimitRedisConnection(RedisClient client) {
        return client.connect(RedisCodec.of(StringCodec.UTF8, ByteArrayCodec.INSTANCE));
    }

    @Bean
    public ProxyManager<String> rateLimitProxyManager(StatefulRedisConnection<String, byte[]> connection) {
        return LettuceBasedProxyManager.builderFor(connection)
            .withExpirationStrategy(
                ExpirationAfterWriteStrategy.basedOnTimeForRefillingBucketUpToMax(Duration.ofMinutes(2)))
            .build();
    }
}
