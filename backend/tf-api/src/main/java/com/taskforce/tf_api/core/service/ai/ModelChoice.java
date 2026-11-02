package com.taskforce.tf_api.core.service.ai;

import java.util.List;
import java.util.regex.Pattern;

/**
 * Les modèles retenus quand les réglages n'en nomment pas, et la vérification qu'un modèle nommé est bien servi.
 * Repris de la coque de l'app desktop (son ancien relais, desktop/src/ai.ts), étendu à Anthropic.
 *
 * <ul>
 *   <li>Conversation : le premier modèle des préférences que le fournisseur annonce (rapides, ils gèrent les outils).
 *       À défaut, sur Ollama et chez Anthropic, le premier modèle de conversation annoncé ; sur une autre API compatible
 *       OpenAI, son modèle s'il n'en sert qu'un : sa liste peut contenir des modèles de voix ou d'image.</li>
 *   <li>Réponses rapides : chez Anthropic, un Haiku ; ailleurs, le modèle de la conversation, dont le palier rapide
 *       coupe seulement le raisonnement.</li>
 *   <li>Vecteurs : un modèle de 1024 dimensions, la seule taille que la base accepte.</li>
 * </ul>
 */
public final class ModelChoice {

    /** Modèles locaux essayés dans l'ordre : rapides, ils gèrent les outils. */
    static final List<String> CHAT_PREFERENCES =
        List.of("qwen3:8b", "qwen2.5:7b-instruct", "qwen3:4b", "llama3.1:8b", "mistral-nemo", "gemma3:4b");
    static final List<String> ANTHROPIC_CHAT_PREFERENCES =
        List.of("claude-opus-5-5", "claude-sonnet-5-5", "claude-opus-5", "claude-sonnet-5");
    static final List<String> ANTHROPIC_FAST_PREFERENCES = List.of("claude-haiku-5-5", "claude-haiku-4-5");
    /** Modèles de vecteurs de 1024 dimensions, la taille de {@code knowledge_nodes.embedding}. */
    static final List<String> EMBED_PREFERENCES = List.of("bge-m3", "mxbai-embed-large");

    private static final Pattern EMBEDDING_NAME = Pattern.compile("embed|bge|minilm|nomic|e5-|gte-", Pattern.CASE_INSENSITIVE);
    /** Date d'une version figée chez Anthropic : {@code claude-haiku-4-5} répond sous {@code claude-haiku-4-5-20251001}. */
    private static final String DATED = "-\\d{8}";

    private ModelChoice() {
    }

    /** Les modèles effectivement utilisés ; {@code null} pour un modèle qu'on ne sait pas choisir. */
    public record Models(String chat, String fast, String embed) {
    }

    /**
     * Complète les choix vides par ce que les fournisseurs annoncent.
     *
     * @param chatModels  modèles annoncés par l'API de conversation, {@code null} si elle ne répond pas
     * @param embedModels modèles annoncés par l'API des vecteurs, {@code null} si elle ne répond pas
     */
    public static Models resolve(AiProviderSettings settings, List<String> chatModels, List<String> embedModels) {
        String chat = settings.model().isEmpty() ? autoChat(settings.provider(), chatModels) : settings.model();
        String fast = settings.modelFast();
        if (fast.isEmpty() && settings.provider() == AiProvider.ANTHROPIC) {
            fast = pick(chatModels, ANTHROPIC_FAST_PREFERENCES);
        }
        if (fast == null || fast.isEmpty()) {
            fast = chat;
        }
        String embed = settings.embedModel().isEmpty() ? pick(embedModels, EMBED_PREFERENCES) : settings.embedModel();
        return new Models(chat, fast, embed);
    }

    /**
     * Le modèle est-il servi ? Une liste vide ne dit rien : on le croit. Un nom sans étiquette vaut {@code :latest}
     * (Ollama), un alias vaut sa version datée (Anthropic).
     */
    public static boolean listed(List<String> models, String model) {
        if (model == null || model.isEmpty()) {
            return false;
        }
        return models.isEmpty() || models.stream()
            .anyMatch(id -> id.equals(model) || id.equals(model + ":latest") || id.matches(Pattern.quote(model) + DATED));
    }

    /** Premier modèle annoncé qui correspond à une préférence ({@code bge-m3} trouve {@code bge-m3:latest}). */
    static String pick(List<String> models, List<String> preferences) {
        if (models == null) {
            return null;
        }
        for (String wanted : preferences) {
            for (String id : models) {
                if (id.equals(wanted) || id.startsWith(wanted + ":") || lastSegment(id).equals(wanted)
                    || id.matches(Pattern.quote(wanted) + DATED)) {
                    return id;
                }
            }
        }
        return null;
    }

    private static String autoChat(AiProvider provider, List<String> models) {
        if (models == null) {
            return null;
        }
        String preferred = pick(models, provider == AiProvider.ANTHROPIC ? ANTHROPIC_CHAT_PREFERENCES : CHAT_PREFERENCES);
        if (preferred != null) {
            return preferred;
        }
        List<String> chatModels = models.stream().filter(id -> !EMBEDDING_NAME.matcher(id).find()).toList();
        if (provider == AiProvider.OPENAI) {
            return chatModels.size() == 1 ? chatModels.get(0) : null;
        }
        return chatModels.isEmpty() ? null : chatModels.get(0);
    }

    private static String lastSegment(String id) {
        int slash = id.lastIndexOf('/');
        return slash < 0 ? id : id.substring(slash + 1);
    }
}
