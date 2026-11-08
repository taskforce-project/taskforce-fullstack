package com.taskforce.tf_api.core.service.ai;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Le budget d'une requête au modèle, en jetons (TF-J1-13, décision de la Présidence du 08/11/2026 : le contexte selon le
 * modèle, comme Claude). Ce qui part à coup sûr (les consignes, les outils, ce que la personne a joint, sa demande) contre
 * la fenêtre moins la place de la réponse ; ce qu'il reste va à l'historique, le plus récent d'abord. Un petit modèle
 * garde peu de la conversation, un grand beaucoup, et la requête qui part tient toujours sa fenêtre.
 *
 * <p>Des nombres seulement : aucune lecture, aucun appel. Les tailles sont estimées large ({@link #tokens}), comme la
 * passerelle taille la fenêtre d'Ollama : une fenêtre dépassée perd le début du prompt, sans rien dire.</p>
 *
 * @param window   la fenêtre du modèle qui répond
 * @param system   les consignes, hors ce qui est joint
 * @param tools    les définitions des outils ; 0 sans outils
 * @param attached ce que la personne a joint ou a à l'écran
 * @param message  sa demande
 */
public record ContextBudget(ModelWindow window, int system, int tools, int attached, int message) {

    /**
     * Les caractères d'un jeton, au plus juste. Un texte anglais en fait 4,3 avec qwen3:8b, le JSON des outils moins : on
     * compte large, car une fenêtre trop courte perd le début du prompt.
     */
    public static final int CHARS_PER_TOKEN = 3;
    /** Le dernier caractère latin : au-delà (hiragana, han, emoji...), un caractère vaut environ un jeton. */
    private static final char LAST_LATIN = 0x02FF;
    /** La place de la réponse (la passerelle gardait la même), et d'une réponse qui raisonne d'abord. */
    private static final int ANSWER_ROOM = 2_048;
    private static final int THINKING_ROOM = 8_192;
    /** Ce que la traduction vers le fournisseur peut ajouter à l'estimation ({@code /no_think}, les crochets du JSON). */
    private static final int MARGIN = 32;
    /** Passé ce pourcentage de la fenêtre, les messages les plus anciens se condensent avant que la requête parte. */
    private static final int COMPACT_AT_PERCENT = 80;
    /** Le pourcentage que vise une requête après la compaction, pour que la suivante ne recommence pas. */
    private static final int AFTER_COMPACTION_PERCENT = 60;
    /** La part de la fenêtre (1/n) gardée à ce qui revient des outils pendant la boucle. */
    private static final int TOOL_ROOM_SHARE = 16;
    /** Le résumé : 3 % de la fenêtre, en mots, de 100 à 1 000 ; une limite haute qu'un petit modèle sait tenir d'un trait. */
    private static final int SUMMARY_WORDS_PERCENT = 3;
    private static final int MIN_SUMMARY_WORDS = 100;
    private static final int MAX_SUMMARY_WORDS = 1_000;
    /** Les jetons estimés d'un mot écrit (six caractères de JSON). */
    private static final int TOKENS_PER_WORD = 2;
    /** Condenser moins que cette part de la fenêtre (1/n) ne vaut pas un appel au modèle, sauf si l'historique ne tient plus. */
    private static final int WORTH_SHARE = 16;

    /** Les jetons estimés d'un texte : un tiers de jeton par caractère latin, un jeton par caractère au-delà. */
    public static int tokens(CharSequence text) {
        if (text == null) {
            return 0;
        }
        long latin = 0;
        long wide = 0;
        for (int i = 0; i < text.length(); i++) {
            if (text.charAt(i) > LAST_LATIN) {
                wide++;
            } else {
                latin++;
            }
        }
        return (int) Math.min(Integer.MAX_VALUE, (latin + CHARS_PER_TOKEN - 1) / CHARS_PER_TOKEN + wide);
    }

    /** Les jetons estimés d'un message ou de définitions d'outils, tels qu'ils partent : en JSON. */
    public static int tokensOf(ObjectMapper mapper, Object value) {
        try {
            return tokens(mapper.writeValueAsString(value));
        } catch (JsonProcessingException unreadable) {
            return tokens(String.valueOf(value));
        }
    }

    /**
     * La place gardée pour la réponse : 2 048 jetons (8 192 si le modèle raisonne), jamais plus du quart de la fenêtre (de
     * sa moitié s'il raisonne) : un modèle de 4 096 jetons a besoin du reste pour lire.
     */
    public static int answerRoom(int window, boolean think) {
        return think ? Math.min(THINKING_ROOM, window / 2) : Math.min(ANSWER_ROOM, window / 4);
    }

    /**
     * Combien des messages les plus récents tiennent dans {@code room} : on part du dernier, et on s'arrête au premier
     * qui ne tient pas, car un historique a des trous qui le rendent faux.
     *
     * @param oldestFirst les tailles des messages, du plus ancien au plus récent
     */
    public static int keepNewest(int[] oldestFirst, int room) {
        int left = room;
        int kept = 0;
        for (int i = oldestFirst.length - 1; i >= 0 && oldestFirst[i] <= left; i--) {
            left -= oldestFirst[i];
            kept++;
        }
        return kept;
    }

    /** Ce que le prompt peut prendre : la fenêtre, moins la réponse et la marge. */
    public int capacity() {
        return Math.max(0, window.tokens() - window.answerRoom() - MARGIN);
    }

    /** Ce qui part à coup sûr : tout sauf l'historique. */
    public int fixed() {
        return (int) Math.min(Integer.MAX_VALUE, (long) system + tools + attached + message);
    }

    /** Faux : même sans historique, la requête ne tient pas la fenêtre du modèle. */
    public boolean fits() {
        return fixed() <= capacity();
    }

    /** La place que le prompt laisse aux résultats des outils. */
    private int toolRoom() {
        return tools > 0 ? window.tokens() / TOOL_ROOM_SHARE : 0;
    }

    /** Ce qu'il reste à l'historique. */
    public int historyRoom() {
        return Math.max(0, capacity() - toolRoom() - fixed());
    }

    /** Le seuil de la compaction : environ 80 % de la fenêtre, et toujours avant que l'historique ne tienne plus. */
    public int compactAt() {
        return Math.min(percent(COMPACT_AT_PERCENT), capacity() - toolRoom());
    }

    /** Vrai : avec cet historique, la requête passerait le seuil. */
    public boolean compactionDue(int history) {
        return (long) fixed() + history > compactAt();
    }

    /**
     * Ce qui reste verbatim après une compaction, à côté du résumé : la requête revient vers 60 % de la fenêtre.
     *
     * @param summary la taille du résumé, en jetons
     */
    public int verbatimRoom(int summary) {
        return Math.max(0, Math.min(percent(AFTER_COMPACTION_PERCENT), capacity() - toolRoom()) - fixed() - summary);
    }

    /** Condenser si peu n'allège rien : la conversation attend de vraiment peser, sauf si elle ne tient plus. */
    public boolean worthCondensing(int tokens) {
        return tokens >= window.tokens() / WORTH_SHARE;
    }

    /** La longueur du résumé, en mots : proportionnelle à la fenêtre. */
    public int summaryWords() {
        return (int) Math.max(MIN_SUMMARY_WORDS, Math.min(MAX_SUMMARY_WORDS, (long) window.tokens() * SUMMARY_WORDS_PERCENT / 100));
    }

    /** Les jetons estimés d'un résumé de cette longueur. */
    public int summaryTokens() {
        return summaryWords() * TOKENS_PER_WORD;
    }

    private int percent(int percent) {
        return (int) ((long) window.tokens() * percent / 100);
    }
}
