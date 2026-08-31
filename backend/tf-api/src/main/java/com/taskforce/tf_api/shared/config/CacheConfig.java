package com.taskforce.tf_api.shared.config;

import org.springframework.cache.annotation.EnableCaching;
import org.springframework.context.annotation.Configuration;

/**
 * Active le cache applicatif (Spring Cache). PERF-CACHE-01.
 *
 * <p>Le gestionnaire de cache est choisi par {@code spring.cache.type} : <b>redis</b> en prod
 * (agrégats de dashboard partagés entre instances + TTL, cf. application-prod.yml) et <b>simple</b>
 * (mémoire) en dev/test — aucune dépendance Redis requise localement.</p>
 *
 * <p>Seules des lectures coûteuses et tolérantes à une courte péremption sont mises en cache
 * (analytics de dashboard) ; l'autorisation reste assurée en amont par
 * {@code WorkspaceAccessInterceptor}, donc un cache hit ne contourne aucun contrôle d'accès.</p>
 */
@Configuration
@EnableCaching
public class CacheConfig {
}
