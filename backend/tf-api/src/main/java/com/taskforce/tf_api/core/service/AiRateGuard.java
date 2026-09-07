package com.taskforce.tf_api.core.service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import com.taskforce.tf_api.shared.exception.AiRateLimitedException;

import lombok.extern.slf4j.Slf4j;

/**
 * Garde-debit IA <b>par minute</b> : protege le budget LLM partage (Groq gpt-oss-120b = ~8000 tokens/minute
 * partages par TOUTE l'org) contre les pics de concurrence. Deux fenetres (par minute calendaire) dans
 * Redis : une <b>GLOBALE</b> (org) et une <b>PAR COMPTE</b> (equite, empeche un compte de monopoliser la
 * minute). Au depassement, l'appelant recoit un <b>429 propre</b> (« reessaie dans un instant ») au lieu
 * d'un echec Groq opaque (413/429 cote fournisseur).
 *
 * <p><b>Post-paiement</b> : le cout exact en tokens n'est connu qu'APRES l'appel LLM. On verifie donc AVANT
 * (la fenetre n'est pas deja pleine) via {@link #assertWithinRate}, puis on debite APRES via
 * {@link #recordTokens}. Un appel peut donc franchir legerement le seuil, mais il protege le SUIVANT.
 *
 * <p><b>Best-effort / fail-open</b> : sans Redis (dev, tests) ou en cas d'incident Redis, le garde
 * <b>laisse passer</b> — il ne bloque jamais l'IA pour une panne d'infra. Branche dans
 * {@link AiUsageService#assertWithinQuota} / {@link AiUsageService#record} (donc actif sur les 9 chemins IA
 * sans toucher les sites d'appel). Les compteurs expirent seuls (TTL 120 s).
 */
@Component
@Slf4j
public class AiRateGuard {

    private static final DateTimeFormatter MINUTE = DateTimeFormatter.ofPattern("yyyyMMddHHmm");
    private static final Duration WINDOW_TTL = Duration.ofSeconds(120);

    private final ObjectProvider<StringRedisTemplate> redisProvider;

    /** Plafond org-wide tokens/minute (= TPM Groq du tier courant). {@code <= 0} desactive la fenetre globale. */
    @Value("${ai.rate.global-tpm:8000}")
    private long globalTpm;

    /** Part equitable tokens/minute par compte (permet un appel « deep », borne la monopolisation). {@code <= 0} desactive. */
    @Value("${ai.rate.account-tpm:6000}")
    private long accountTpm;

    public AiRateGuard(ObjectProvider<StringRedisTemplate> redisProvider) {
        this.redisProvider = redisProvider;
    }

    /** Verifie AVANT l'appel LLM que ni la fenetre-minute globale ni celle du compte ne sont pleines. */
    public void assertWithinRate(Long accountId) {
        StringRedisTemplate redis = redisProvider.getIfAvailable();
        if (redis == null || accountId == null) {
            return; // fail-open : pas de Redis (dev/test)
        }
        try {
            String minute = LocalDateTime.now().format(MINUTE);
            if (globalTpm > 0 && read(redis, "ai:tpm:g:" + minute) >= globalTpm) {
                throw new AiRateLimitedException(
                    "IA momentanement saturee (debit partage atteint). Reessaie dans un instant.");
            }
            if (accountTpm > 0 && read(redis, "ai:tpm:a:" + accountId + ":" + minute) >= accountTpm) {
                throw new AiRateLimitedException(
                    "Trop de requetes IA sur la derniere minute. Reessaie dans un instant.");
            }
        } catch (AiRateLimitedException e) {
            throw e;
        } catch (Exception e) {
            log.warn("Garde-debit IA indisponible (Redis) : {} — on laisse passer", e.getMessage());
        }
    }

    /** Debite APRES l'appel LLM les tokens consommes sur les deux fenetres-minute. Best-effort. */
    public void recordTokens(Long accountId, long tokens) {
        StringRedisTemplate redis = redisProvider.getIfAvailable();
        if (redis == null || accountId == null || tokens <= 0) {
            return;
        }
        try {
            String minute = LocalDateTime.now().format(MINUTE);
            bump(redis, "ai:tpm:g:" + minute, tokens);
            bump(redis, "ai:tpm:a:" + accountId + ":" + minute, tokens);
        } catch (Exception e) {
            log.warn("Garde-debit IA : ecriture Redis echouee : {}", e.getMessage());
        }
    }

    private long read(StringRedisTemplate redis, String key) {
        String v = redis.opsForValue().get(key);
        return v != null ? Long.parseLong(v) : 0L;
    }

    private void bump(StringRedisTemplate redis, String key, long tokens) {
        Long total = redis.opsForValue().increment(key, tokens);
        if (total != null && total == tokens) {
            redis.expire(key, WINDOW_TTL); // 1re ecriture de la fenetre -> pose le TTL
        }
    }
}
