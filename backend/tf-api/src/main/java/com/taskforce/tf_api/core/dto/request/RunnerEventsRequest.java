package com.taskforce.tf_api.core.dto.request;

import java.util.List;
import java.util.Map;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Lot d'événements d'un run, posté par le runner local : la chronologie en direct (OSS-5.3) et le dossier de preuve
 * (spécification de la v2, §9 ; TF-J2-7).
 *
 * @param events 50 au plus par appel ; le texte est tronqué à 2000 caractères au stockage
 */
public record RunnerEventsRequest(
    @NotEmpty @Size(max = 50)
    List<@Valid Event> events
) {

    /** {@code sha256:} et 64 chiffres hexadécimaux. */
    public static final String SHA256 = "sha256:[0-9a-f]{64}";

    /**
     * @param kind    {@code start}, {@code text}, {@code tool}, {@code error}, {@code denied} (l'agent), {@code decision}
     *                (une règle, au seul dossier de preuve), {@code exit} (une sortie faite ou non par le runner),
     *                {@code limit} (le plafond d'événements du runner atteint), {@code test} (les tests du projet lancés
     *                par le runner après l'agent, S1), {@code brief} (le texte remis à l'agent, au seul dossier) ou
     *                {@code agent} (l'agent réellement lancé : sa version, son modèle, sa session)
     * @param effect  pour {@code decision}, l'effet de la règle ; pour {@code exit}, ce qui s'est passé : {@code allow}
     *                si la sortie est faite, {@code deny} sinon
     * @param rule    pour {@code decision}, la règle qui l'a donnée ; absente quand aucune ne s'applique
     * @param n       le numéro de l'événement chez le runner (1, 2, 3...) : un numéro qui manque dit un lot perdu, et
     *                le dossier le marque ; absent d'un runner plus ancien
     * @param facts   pour {@code decision}, les faits que les règles ont jugés, un jeu par morceau de l'appel : un tiers
     *                rejuge l'action avec le paquet exporté
     * @param input   pour {@code decision}, l'empreinte de l'entrée de l'outil (son JSON canonique) : l'action exacte
     * @param written pour {@code decision} sur une écriture de fichier, le fichier et l'empreinte de ce qui s'y écrit
     * @param body    pour {@code brief}, le texte entier remis à l'agent : il est gardé à côté de la chaîne
     * @param agent   pour {@code agent}, ce que l'agent dit de lui-même au démarrage
     * @param test    pour {@code test}, ce que le runner a lancé et ce qu'il en a lu
     */
    public record Event(
        @NotBlank
        @Pattern(regexp = "start|text|tool|error|denied|decision|exit|limit|test|brief|agent",
            message = "kind must be start, text, tool, error, denied, decision, exit, limit, test, brief or agent")
        String kind,

        @Size(max = 120)
        String tool,

        @NotNull @Size(max = 4000)
        String text,

        @Pattern(regexp = "allow|ask|deny", message = "effect must be allow, ask or deny")
        String effect,

        @Size(max = 80)
        String rule,

        @Min(1)
        Integer n,

        @Size(max = 20)
        List<@Size(max = 30) Map<@Size(max = 60) String, @Size(max = 4000) String>> facts,

        @Pattern(regexp = SHA256, message = "input must be a sha256 digest")
        String input,

        @Valid
        Written written,

        @Size(max = 200_000)
        String body,

        @Valid
        Agent agent,

        @Valid
        Test test
    ) {

        /** Un événement de la chronologie, sans décision. */
        public Event(String kind, String tool, String text) {
            this(kind, tool, text, null, null);
        }

        /** Un événement comme les envoie un runner d'avant la 1.18 : ni numéro ni empreinte. */
        public Event(String kind, String tool, String text, String effect, String rule) {
            this(kind, tool, text, effect, rule, null, null, null, null, null, null, null);
        }
    }

    /**
     * Une écriture de fichier jugée par les règles : le chemin dans la copie, et l'empreinte de ce que le fichier contiendra
     * si l'écriture passe ; le relevé final des fichiers porte la même empreinte pour le contenu qui reste.
     */
    public record Written(
        @NotBlank @Size(max = 1000) String path,
        @Pattern(regexp = SHA256, message = "sha256 must be a sha256 digest") String sha256,
        @Min(0) Long bytes
    ) {}

    /**
     * L'agent réellement lancé : sa version, sa session, le modèle de la mission (celui que ses réponses ont nommé quand
     * elles l'ont fait, sinon celui de sa configuration), celui de sa configuration, chaque modèle que ses réponses ont
     * nommé, et qui sert le modèle, lu dans la configuration du poste (R159, L5).
     */
    public record Agent(
        @Size(max = 80) String version,
        @Size(max = 120) String model,
        @Size(max = 64) String session,
        @Size(max = 80) String provider,
        @Size(max = 120) String configured,
        @Size(max = 10) List<@Size(max = 120) String> served
    ) {

        /** L'agent comme le décrit un runner d'avant la relecture R159 : ni modèle de configuration ni modèle servi. */
        public Agent(String version, String model, String session, String provider) {
            this(version, model, session, provider, null, null);
        }
    }

    /**
     * Les tests du projet tels que le runner les a lancés : la commande, lancés ou non, passés ou non, les comptes quand
     * la sortie les donne, et l'empreinte de la sortie entière, que le runner garde sur le poste. {@code configured} faux :
     * le projet n'a pas de commande de test, rien n'a tourné. {@code definitionChanged} : les fichiers de la branche qui
     * disent comment les tests tournent, ou que la commande nomme ; le résultat ne dit alors que ce que donne la version
     * des tests de l'agent (R159, M5). {@code definitions} : ceux que le runner a trouvés dans le dépôt, changés ou non, la
     * liste qu'il a regardée (second tour, L-b).
     */
    public record Test(
        @NotBlank @Size(max = 500) String command,
        boolean ran,
        boolean passed,
        @Min(0) Integer passedCount,
        @Min(0) Integer total,
        @Pattern(regexp = SHA256, message = "output must be a sha256 digest") String output,
        @Min(0) Long outputBytes,
        Boolean configured,
        @Size(max = 20) List<@Size(max = 300) String> definitionChanged,
        @Size(max = 20) List<@Size(max = 300) String> definitions
    ) {

        /** Des tests lancés, comme les décrit un runner qui ne dit pas si une commande est configurée. */
        public Test(String command, boolean ran, boolean passed, Integer passedCount, Integer total, String output, Long outputBytes) {
            this(command, ran, passed, passedCount, total, output, outputBytes, null, null, null);
        }

        /** Des tests, comme les décrit un runner d'avant la relecture R159 : rien sur la définition des tests. */
        public Test(String command, boolean ran, boolean passed, Integer passedCount, Integer total, String output, Long outputBytes,
                    Boolean configured) {
            this(command, ran, passed, passedCount, total, output, outputBytes, configured, null, null);
        }

        /** Des tests, comme les décrit un runner du premier tour : ce qui a changé, sans la liste regardée. */
        public Test(String command, boolean ran, boolean passed, Integer passedCount, Integer total, String output, Long outputBytes,
                    Boolean configured, List<String> definitionChanged) {
            this(command, ran, passed, passedCount, total, output, outputBytes, configured, definitionChanged, null);
        }
    }
}
