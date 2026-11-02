package com.taskforce.tf_api.core.service.ai;

import java.net.URI;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.function.Function;

/**
 * Réglages de la passerelle de modèles, résolus depuis les variables d'environnement. Ce sont celles que lisait
 * l'ancien ai-service Python : une instance en place redémarre sur la passerelle Java sans qu'on touche à son fichier
 * d'environnement. L'app desktop passe le choix de la personne par les mêmes variables (DesktopAiService).
 *
 * <ul>
 *   <li>{@code AI_PROVIDER} : {@code ollama}, {@code openai} (toute API compatible OpenAI), {@code anthropic},
 *       {@code groq} ; {@code none} coupe l'IA. Vide, le fournisseur se déduit des autres variables, comme avant :
 *       {@code AI_BASE_URL} posée, une API compatible OpenAI ; {@code GROQ_API_KEY}, Groq ; sinon Ollama.</li>
 *   <li>{@code AI_BASE_URL} (avec {@code /v1}), {@code AI_API_KEY}, {@code AI_MODEL}, {@code AI_MODEL_FAST}.</li>
 *   <li>{@code AI_EMBED_BASE_URL}, {@code AI_EMBED_API_KEY}, {@code AI_EMBED_MODEL} : les vecteurs, sur une API
 *       compatible OpenAI. Par défaut au même endroit que la conversation, sauf pour Groq et Anthropic, qui n'en ont
 *       pas : alors Ollama.</li>
 *   <li>{@code AI_TIMEOUT} (secondes) ; {@code AI_MAX_TOKENS}, le plafond d'une réponse d'Anthropic, qui l'exige.</li>
 *   <li>Alias d'avant le lot 4, toujours lus : {@code GROQ_API_KEY}, {@code GROQ_BASE_URL}, {@code GROQ_MODEL},
 *       {@code GROQ_MODEL_FAST} ; {@code OLLAMA_BASE_URL} (sans {@code /v1}), {@code OLLAMA_MODEL},
 *       {@code OLLAMA_MODEL_FAST}, {@code OLLAMA_EMBED_MODEL}, {@code OLLAMA_TIMEOUT}.</li>
 * </ul>
 *
 * <p>Les modèles laissés vides. Dans l'ancien format ({@code AI_PROVIDER} vide), les défauts de l'ai-service valent :
 * {@code qwen3:8b} et {@code bge-m3}. Une instance en place garde ainsi ses modèles, et surtout le nom de modèle que
 * portent ses vecteurs ({@code knowledge_nodes.embedding_model}) : un autre nom, même {@code bge-m3:latest}, ferait
 * tout réindexer. Avec {@code AI_PROVIDER}, comme l'app desktop le pose toujours, un modèle vide est choisi parmi
 * ceux que le fournisseur annonce ({@link ModelChoice}), comme le faisait son ancien relais. Groq garde ses modèles
 * par défaut dans les deux cas : sa liste ne contient aucun modèle des préférences.</p>
 *
 * <p>Les clés ne sortent jamais d'ici par {@link #toString()} : un journal ou une exception qui citerait les réglages
 * ne les montre pas.</p>
 *
 * @param baseUrl      URL de base de la conversation, avec {@code /v1}, sans {@code /} final
 * @param model        modèle de conversation ; vide, choisi parmi les modèles annoncés
 * @param modelFast    modèle des réponses rapides ; vide, choisi (un Haiku chez Anthropic) ou celui de la conversation
 * @param embedBaseUrl URL de base des vecteurs (API compatible OpenAI), avec {@code /v1}
 * @param embedModel   modèle des vecteurs ; vide, choisi parmi les modèles installés
 */
public record AiProviderSettings(
    boolean enabled,
    AiProvider provider,
    String baseUrl,
    String apiKey,
    String model,
    String modelFast,
    String embedBaseUrl,
    String embedApiKey,
    String embedModel,
    Duration timeout,
    int maxTokens) {

    /** Ollama de la machine hôte, vu depuis un conteneur. */
    public static final String DEFAULT_OLLAMA_URL = "http://host.docker.internal:11434";
    public static final String DEFAULT_OPENAI_URL = "https://api.openai.com/v1";
    public static final String DEFAULT_GROQ_URL = "https://api.groq.com/openai/v1";
    public static final String DEFAULT_ANTHROPIC_URL = "https://api.anthropic.com/v1";
    /** Modèles de l'instance hébergée sur Groq (les anciens défauts llama-3.3 y ont été retirés en 2026). */
    static final String DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";
    static final String DEFAULT_GROQ_MODEL_FAST = "openai/gpt-oss-20b";
    /** Défauts de l'ai-service, pour l'ancien format (sans {@code AI_PROVIDER}). */
    static final String LEGACY_MODEL = "qwen3:8b";
    static final String LEGACY_EMBED_MODEL = "bge-m3";
    /** Les valeurs d'{@code AI_PROVIDER} qui choisissent un fournisseur ; l'ai-service ne lisait que {@code none}. */
    private static final Set<String> CHOSEN = Set.of("ollama", "openai", "custom", "openai-compatible", "anthropic", "groq");
    static final Duration DEFAULT_TIMEOUT = Duration.ofSeconds(120);
    /** Plafond d'une réponse chez Anthropic, raisonnement compris : large, on ne paie que ce qui est produit. */
    static final int DEFAULT_MAX_TOKENS = 16_000;

    /** Les variables lues : l'app desktop ne peut poser que celles-là. */
    public static final List<String> VARIABLES = List.of(
        "AI_PROVIDER", "AI_BASE_URL", "AI_API_KEY", "AI_MODEL", "AI_MODEL_FAST",
        "AI_EMBED_BASE_URL", "AI_EMBED_API_KEY", "AI_EMBED_MODEL", "AI_TIMEOUT", "AI_MAX_TOKENS",
        "GROQ_API_KEY", "GROQ_BASE_URL", "GROQ_MODEL", "GROQ_MODEL_FAST",
        "OLLAMA_BASE_URL", "OLLAMA_MODEL", "OLLAMA_MODEL_FAST", "OLLAMA_EMBED_MODEL", "OLLAMA_TIMEOUT");

    /** Résout les réglages ; {@code env} rend la valeur d'une variable, ou {@code null}. */
    public static AiProviderSettings from(Function<String, String> env) {
        // OLLAMA_BASE_URL s'écrit sans /v1 ; une adresse qui le porte déjà ne le reçoit pas deux fois.
        String ollamaV1 = trimSlash(first(env, DEFAULT_OLLAMA_URL, "OLLAMA_BASE_URL")).replaceAll("/v1$", "") + "/v1";
        String explicit = trimSlash(first(env, "", "AI_BASE_URL"));
        String chosen = first(env, "", "AI_PROVIDER").toLowerCase(Locale.ROOT);
        String kind = switch (chosen) {
            case "ollama", "anthropic", "groq" -> chosen;
            case "openai", "custom", "openai-compatible" -> "openai";
            // Rien de choisi (ou un nom inconnu) : la règle de l'ai-service.
            default -> !explicit.isEmpty() ? "openai" : !first(env, "", "GROQ_API_KEY").isEmpty() ? "groq" : "ollama";
        };
        boolean legacy = !CHOSEN.contains(chosen);
        String defaultModel = legacy ? LEGACY_MODEL : "";

        AiProvider provider;
        String base;
        String key;
        String model;
        String fast;
        // Où vont les vecteurs quand AI_EMBED_BASE_URL n'est pas posée.
        String derivedEmbedBase;
        switch (kind) {
            case "anthropic" -> {
                provider = AiProvider.ANTHROPIC;
                base = explicit.isEmpty() ? DEFAULT_ANTHROPIC_URL : explicit;
                key = first(env, "", "AI_API_KEY");
                model = first(env, "", "AI_MODEL");
                fast = first(env, "", "AI_MODEL_FAST");
                derivedEmbedBase = ollamaV1;
            }
            case "groq" -> {
                provider = AiProvider.OPENAI;
                base = explicit.isEmpty() ? trimSlash(first(env, DEFAULT_GROQ_URL, "GROQ_BASE_URL")) : explicit;
                key = first(env, "", "AI_API_KEY", "GROQ_API_KEY");
                model = first(env, DEFAULT_GROQ_MODEL, "AI_MODEL", "GROQ_MODEL");
                fast = first(env, DEFAULT_GROQ_MODEL_FAST, "AI_MODEL_FAST", "GROQ_MODEL_FAST");
                derivedEmbedBase = ollamaV1;
            }
            case "openai" -> {
                provider = AiProvider.OPENAI;
                base = explicit.isEmpty() ? DEFAULT_OPENAI_URL : explicit;
                key = first(env, "", "AI_API_KEY");
                model = first(env, defaultModel, "AI_MODEL");
                fast = first(env, "", "AI_MODEL_FAST");
                derivedEmbedBase = base;
            }
            default -> {
                provider = AiProvider.OLLAMA;
                base = explicit.isEmpty() ? ollamaV1 : explicit;
                key = first(env, "", "AI_API_KEY");
                model = first(env, defaultModel, "AI_MODEL", "OLLAMA_MODEL");
                fast = first(env, "", "AI_MODEL_FAST", "OLLAMA_MODEL_FAST");
                derivedEmbedBase = base;
            }
        }

        String embedBase;
        String embedKey;
        String posedEmbedBase = trimSlash(first(env, "", "AI_EMBED_BASE_URL"));
        if (!posedEmbedBase.isEmpty()) {
            embedBase = posedEmbedBase;
            embedKey = first(env, "", "AI_EMBED_API_KEY");
        } else {
            embedBase = derivedEmbedBase;
            // Au même endroit que la conversation, avec la même clé ; ailleurs (Ollama), sans clé.
            embedKey = first(env, derivedEmbedBase.equals(base) ? key : "", "AI_EMBED_API_KEY");
        }

        return new AiProviderSettings(
            !"none".equals(chosen),
            provider,
            base,
            key,
            model,
            fast,
            embedBase,
            embedKey,
            first(env, legacy ? LEGACY_EMBED_MODEL : "", "AI_EMBED_MODEL", "OLLAMA_EMBED_MODEL"),
            seconds(first(env, "", "AI_TIMEOUT", "OLLAMA_TIMEOUT")),
            positive(first(env, "", "AI_MAX_TOKENS"), DEFAULT_MAX_TOKENS));
    }

    /** Les vecteurs passent par le même point d'accès, avec la même clé, que la conversation. */
    public boolean sameEmbedEndpoint() {
        return provider != AiProvider.ANTHROPIC && embedBaseUrl.equals(baseUrl) && embedApiKey.equals(apiKey);
    }

    /** Résumé pour le journal : le fournisseur, l'hôte et les modèles, jamais une clé ni une adresse complète. */
    public String describe() {
        if (!enabled) {
            return "off (AI_PROVIDER=none)";
        }
        return provider + " at " + host(baseUrl) + ", models " + orAuto(model) + " / " + orAuto(modelFast)
            + ", key " + (apiKey.isEmpty() ? "none" : "set") + "; embeddings at " + host(embedBaseUrl) + ", model "
            + orAuto(embedModel);
    }

    @Override
    public String toString() {
        return "AiProviderSettings[" + describe() + "]";
    }

    /** Première variable non vide parmi {@code names} (ordre de priorité), sinon {@code fallback}. */
    private static String first(Function<String, String> env, String fallback, String... names) {
        for (String name : names) {
            String value = env.apply(name);
            if (value != null && !value.isBlank()) {
                return value.strip();
            }
        }
        return fallback;
    }

    private static String trimSlash(String url) {
        return url.replaceAll("/+$", "");
    }

    private static Duration seconds(String value) {
        try {
            double parsed = Double.parseDouble(value);
            return parsed > 0 ? Duration.ofMillis(Math.round(parsed * 1000)) : DEFAULT_TIMEOUT;
        } catch (NumberFormatException unset) {
            return DEFAULT_TIMEOUT;
        }
    }

    private static int positive(String value, int fallback) {
        try {
            int parsed = Integer.parseInt(value);
            return parsed > 0 ? parsed : fallback;
        } catch (NumberFormatException unset) {
            return fallback;
        }
    }

    private static String orAuto(String model) {
        return model.isEmpty() ? "auto" : model;
    }

    private static String host(String url) {
        try {
            URI uri = URI.create(url);
            return uri.getHost() == null ? "?" : uri.getHost() + (uri.getPort() > 0 ? ":" + uri.getPort() : "");
        } catch (IllegalArgumentException malformed) {
            return "?";
        }
    }
}
