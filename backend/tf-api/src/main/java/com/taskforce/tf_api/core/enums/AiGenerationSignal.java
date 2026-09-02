package com.taskforce.tf_api.core.enums;

/**
 * Signal de preference capture a un point human-in-the-loop. C'est ce signal (le passage
 * draft -> final) qui fait la valeur du corpus : un dataset de preferences (type RLHF/DPO),
 * pas juste du texte.
 *
 * <ul>
 *   <li>{@code ACCEPTED} - proposition IA retenue telle quelle ;</li>
 *   <li>{@code EDITED} - retenue apres edition humaine ({@code edit_distance} > 0) ;</li>
 *   <li>{@code REJECTED} - ecartee (l'humain a choisi autre chose, ou abandonne).</li>
 * </ul>
 */
public enum AiGenerationSignal {
    ACCEPTED,
    EDITED,
    REJECTED
}
